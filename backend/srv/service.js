// srv/service.js
const cds = require('@sap/cds');
const axios = require('axios');
require('dotenv').config();

module.exports = async function () {
    const { billingDocument } = this.entities;
    const { 
        ABAP_API_URL,
        ABAP_ITEM_API_URL, 
        ABAP_USER, 
        ABAP_PASS, 
        SO_API_URL, 
        INCOTERM_API_URL, 
        DELIVERY_ITEM_API_URL, 
        DELIVERY_HEADER_API_URL,
        ZI_PLANT1_API_URL, 
        ZCE_TAX_DETAILS_API_URL, 
        BUSINESS_PARTNER_API_URL,
        PRODUCT_PLANT_API_URL
    } = process.env;

    if (!PRODUCT_PLANT_API_URL) {
        console.warn("PRODUCT_PLANT_API_URL not set in .env — ProductPlant lookups will be skipped.");
    }

    // Simple in-memory cache for ProductPlant lookups to avoid repeated calls
    const productPlantCache = new Map(); // key = `${product}__${plant}` -> productPlant object or null

    // Generic safe axios GET that returns normalized data object/array
    const safeGet = async (url) => {
        const resp = await axios.get(url, { auth: { username: ABAP_USER, password: ABAP_PASS } });
        // Support OData V2 (resp.data.d.results), V2 single (resp.data.d), V4 (resp.data.value), or direct (resp.data)
        if (resp.data === undefined || resp.data === null) return null;
        if (Array.isArray(resp.data)) return resp.data;
        if (resp.data.value) return resp.data.value;
        if (resp.data.d && resp.data.d.results) return resp.data.d.results;
        if (resp.data.d) return resp.data.d;
        return resp.data;
    };

    // Fetch ProductPlant with fallbacks: 1) entity key style, 2) $filter query
    const fetchProductPlant = async (productId, plantId) => {
        if (!PRODUCT_PLANT_API_URL) return null;
        if (!productId || !plantId) return null;

        const cacheKey = `${productId}__${plantId}`;
        if (productPlantCache.has(cacheKey)) return productPlantCache.get(cacheKey);

        // Try entity-key URL first (most direct)
        let tried = [];
        try {
            // Build entity-key URL (common OData pattern)
            // Some systems expect Product numeric vs string; we always quote the key to be safe
            const keyUrl = `${PRODUCT_PLANT_API_URL}(Product='${encodeURIComponent(productId)}',Plant='${encodeURIComponent(plantId)}')?$select=Product,Plant,ConsumptionTaxCtrlCode&$format=json`;
            tried.push(keyUrl);
            let resp = await axios.get(keyUrl, { auth: { username: ABAP_USER, password: ABAP_PASS } });
            let data = resp.data && (resp.data.d || resp.data);
            // If the entity-key returned a wrapper with results (rare), normalize:
            if (data && data.results && Array.isArray(data.results) && data.results.length > 0) data = data.results[0];
            // If direct object with fields:
            if (data && (data.ConsumptionTaxCtrlCode !== undefined || data.Product || data.Plant)) {
                productPlantCache.set(cacheKey, data);
                return data;
            }
        } catch (err) {
            // swallow and try fallback
            // console.debug('ProductPlant entity-key failed', err.message);
        }

        // Fallback: try $filter to search for the Product+Plant combination
        try {
            const filter = `$filter=Product eq '${productId}' and Plant eq '${plantId}'&$select=Product,Plant,ConsumptionTaxCtrlCode&$format=json`;
            const filterUrl = `${PRODUCT_PLANT_API_URL}?${filter}`;
            tried.push(filterUrl);
            const results = await safeGet(filterUrl);
            // results might be array or single object
            if (Array.isArray(results) && results.length > 0) {
                productPlantCache.set(cacheKey, results[0]);
                return results[0];
            }
            if (results && !Array.isArray(results) && (results.ConsumptionTaxCtrlCode !== undefined || results.Product)) {
                productPlantCache.set(cacheKey, results);
                return results;
            }
        } catch (err) {
            // swallow
            // console.debug('ProductPlant filter failed', err.message);
        }

        // If nothing found, cache null and return null
        productPlantCache.set(cacheKey, null);
        return null;
    };

    // --- Pricing Elements Fetch Function ---
    const fetchPricingElements = async (billingDocumentId, BillingDocumentItem) => {
        try {
            const pricingUrl = `https://my414535-api.s4hana.cloud.sap/sap/opu/odata/sap/API_BILLING_DOCUMENT_SRV/A_BillingDocumentItem(BillingDocument='${billingDocumentId}',BillingDocumentItem='${BillingDocumentItem}')/to_PricingElement?$select=ConditionType,ConditionBaseValue,ConditionRateValue,ConditionQuantityUnit,ConditionAmount&$format=json`;
            const results = await safeGet(pricingUrl);
            if (Array.isArray(results)) return results;
            if (results && results.ConditionType) return [results];a
            return [];
        } catch (err) {
            console.error(`Error fetching Pricing Elements for BillingDoc ${billingDocumentId} Item ${BillingDocumentItem}:`, err.message);
            return [];
        }
    };

    // --- Mapping function for POST (full data) ---
    const mapBillingData = async (data) => {
        const mappedDoc = {
            billingDocumentID: data.BillingDocument,
            DocumentCategory: data.SDDocumentCategory,
            Division: data.Division,
            BillingDocument: data.BillingDocument,
            BillingDocumentDate: data.BillingDocumentDate,
            BillingDocumentType: data.BillingDocumentType,
            CompanyCode: data.CompanyCode,
            FiscalYear: data.FiscalYear,
            SalesOrganization: data.SalesOrganization,
            DistributionChannel: data.DistributionChannel,
            invoiceNo: data.BillingDocument,
            invoiceDate: data.CreationDate,
            destinationCountry: data.Country,
            SoldToParty: data.SoldToParty,
            termsOfPayment: data.CustomerPaymentTerms || null,
            PaymentTermsName: null,
            motorVehicleNo: data.YY1_VehicleNo2_BDH,
            Items: [],
            SalesOrders: []
        };

        // --- Map Billing Items (from billing document) ---
        const items = (data._Item && data._Item.results) || data._Item || [];
        if (Array.isArray(items) && items.length > 0) {
            for (let item of items) {
            const pricingElements = await fetchPricingElements(item.BillingDocument, item.BillingDocumentItem);
            mappedDoc.Items = items.map(item => ({
                
                BillingDocumentItem: item.BillingDocumentItem,
                ItemCategory: item.SalesDocumentItemCategory,
                SalesDocumentItemType: item.SalesDocumentItemType,
                SalesDocument: item.SalesDocument,
                ReferenceSDDocument: item.ReferenceSDDocument,
                ReferenceSDDocumentItem: item.ReferenceSDDocumentItem,
                BillingDocumentItemText: item.BillingDocumentItemText,
                Batch: item.Batch,
                BillingQuantity: item.BillingQuantity,
                BillingQuantityUnitSAPCode: item.BillingQuantityUnitSAPCode,
                NetAmount: item.NetAmount,
                // Many sources use "Material" for product/material id; store common fields so we can try them later
                Material: item.Material || item.Product || item.ProductID || null,
                PricingElements: pricingElements.map(pe => ({
                        ConditionType: pe.ConditionType,
                        ConditionBaseValue: pe.ConditionBaseValue,
                        ConditionRateValue: pe.ConditionRateValue,
                        ConditionQuantityUnit: pe.ConditionQuantityUnit,
                        ConditionAmount: pe.ConditionAmount
                    }))
            }));
        }
    }
        
        
        // --- Fetch Sales Orders & related delivery items ---
        const salesDocIds = [...new Set(mappedDoc.Items.map(it => it.SalesDocument).filter(id => id))];
        if (salesDocIds.length > 0) {
            try {
                const filterQuery = salesDocIds.map(id => `SalesOrder eq '${id}'`).join(" or ");
                const soUrl = `${SO_API_URL}?$filter=${filterQuery}&$select=SalesOrder,CustomerPurchaseOrderDate,PurchaseOrderByCustomer&$format=json`;
                const soResponse = await axios.get(soUrl, { auth: { username: ABAP_USER, password: ABAP_PASS } });
                const soData = soResponse.data.value || (soResponse.data.d && soResponse.data.d.results) || [];

                const bpIds = new Set();

                for (let so of soData) {
                    // normalize date if present (some OData return /Date(...)/)
                    so.CustomerPurchaseOrderDate = so.CustomerPurchaseOrderDate
                        ? (typeof so.CustomerPurchaseOrderDate === 'string' && /\/Date\((\d+)\)\//.test(so.CustomerPurchaseOrderDate)
                            ? new Date(parseInt(so.CustomerPurchaseOrderDate.replace(/\/Date\((\d+)\)\//, '$1'))).toISOString().split('T')[0]
                            : so.CustomerPurchaseOrderDate)
                        : null;

                    // fetch delivery items for this sales order
                    const deliveryFilter = `ReferenceSDDocument eq '${so.SalesOrder}'`;
                    const deliveryUrl = `${DELIVERY_ITEM_API_URL}?$filter=${deliveryFilter}&$select=DeliveryDocument,DeliveryDocumentItem,ReferenceSDDocument,ReferenceSDDocumentItem,Plant,Material&$format=json`;
                    const deliveryItems = (await safeGet(deliveryUrl)) || [];

                    // for each delivery item, enrich plant, header, productPlant etc.
                    for (let di of deliveryItems) {
                        // Ensure fields that might be used to find product are present
                        // Candidate product ids we'll try in order:
                        // 1) di.Material (common)
                        // 2) find billing item mapping by reference SD doc + item -> mappedDoc.Items[*].Material
                        // 3) di.ReferenceSDDocumentItem (sometimes contains product mapping id)
                        // 4) fallback: di.ReferenceSDDocument (sales order) + its items (not fetched here)
                        di.PlantAddress = di.PlantAddress || {};

                        // --- Fetch Plant details from ZI_PLANT1_API_URL ---
                        if (di.Plant) {
                            try {
                                const plantUrl = `${ZI_PLANT1_API_URL}?$filter=Plant eq '${encodeURIComponent(di.Plant)}'&$select=PlantName,Plant,StreetName,HouseNumber,CityName,PostalCode,Region,Country,BusinessPlace&$format=json`;
                                const plantData = await safeGet(plantUrl) || [];
                                const plantInfo = Array.isArray(plantData) ? plantData[0] : plantData;
                                if (plantInfo) {
                                    di.PlantAddress.PlantName = plantInfo.PlantName || null;
                                    di.PlantAddress.StreetName = plantInfo.StreetName || null;
                                    di.PlantAddress.HouseNumber = plantInfo.HouseNumber || null;
                                    di.PlantAddress.CityName = plantInfo.CityName || null;
                                    di.PlantAddress.PostalCode = plantInfo.PostalCode || null;
                                    di.PlantAddress.Region = plantInfo.Region || null;
                                    di.PlantAddress.Country = plantInfo.Country || null;
                                    di.PlantAddress.BusinessPlace = plantInfo.BusinessPlace || null;

                                    // Fetch GST for BusinessPlace if present
                                    if (plantInfo.BusinessPlace) {
                                        try {
                                            const taxUrl = `${ZCE_TAX_DETAILS_API_URL}?$filter=BusinessPlace eq '${encodeURIComponent(plantInfo.BusinessPlace)}'&$select=BusinessPlace,IN_GSTIdentificationNumber&$format=json`;
                                            const taxData = await safeGet(taxUrl);
                                            const taxInfo = Array.isArray(taxData) ? taxData[0] : taxData;
                                            if (taxInfo && taxInfo.IN_GSTIdentificationNumber) {
                                                di.PlantAddress.in_GSTIdentificationNumber = taxInfo.IN_GSTIdentificationNumber;
                                            }
                                        } catch (err) {
                                            console.error(`Error fetching Tax details for BusinessPlace ${plantInfo.BusinessPlace}:`, err.message);
                                        }
                                    }

                                    // --- Determine candidate product IDs to try for ProductPlant lookup ---
                                    const candidates = [];

                                    // 1) delivery item Material (very common)
                                    if (di.Material) candidates.push(String(di.Material));

                                    // 2) Look up billing doc mapped item that references this sales/delivery item
                                    if (di.ReferenceSDDocument && di.ReferenceSDDocumentItem) {
                                        const found = mappedDoc.Items.find(mi =>
                                            (mi.ReferenceSDDocument === di.ReferenceSDDocument ||
                                             mi.SalesDocument === di.ReferenceSDDocument) &&
                                            (mi.ReferenceSDDocumentItem === di.ReferenceSDDocumentItem || mi.BillingDocumentItem === di.ReferenceSDDocumentItem)
                                        );
                                        if (found && found.Material) candidates.push(String(found.Material));
                                    }

                                    // 3) Try ReferenceSDDocumentItem itself (some systems store product id in that field)
                                    if (di.ReferenceSDDocumentItem) candidates.push(String(di.ReferenceSDDocumentItem));

                                    // 4) As a last resort, try to get product from delivery item's fields that might contain product-like values
                                    if (di.Product) candidates.push(String(di.Product));
                                    if (di.ProductID) candidates.push(String(di.ProductID));

                                    // Deduplicate candidate list preserving order
                                    const uniqueCandidates = [...new Set(candidates.filter(Boolean))];

                                    // Try each candidate until we find a ProductPlant with a non-empty ConsumptionTaxCtrlCode
                                    let foundProductPlant = null;
                                    for (let candidateProduct of uniqueCandidates) {
                                        try {
                                            const pp = await fetchProductPlant(candidateProduct, plantInfo.Plant);
                                            if (pp) {
                                                // If consumption code exists and is non-empty, accept it
                                                if (pp.ConsumptionTaxCtrlCode !== undefined && pp.ConsumptionTaxCtrlCode !== null && String(pp.ConsumptionTaxCtrlCode).trim() !== '') {
                                                    foundProductPlant = pp;
                                                    // Attach which product id matched (useful for debugging)
                                                    di._matchedProductPlant = { ProductChecked: candidateProduct };
                                                    break;
                                                } else {
                                                    // Keep it as potential fallback (may be valid even if empty)
                                                    foundProductPlant = foundProductPlant || pp;
                                                    di._matchedProductPlant = { ProductChecked: candidateProduct };
                                                }
                                            }
                                        } catch (err) {
                                            // continue trying other candidates
                                            // console.debug('fetchProductPlant attempt failed', err.message);
                                        }
                                    }

                                    // Attach ConsumptionTaxCtrlCode if found
                                    if (foundProductPlant && foundProductPlant.ConsumptionTaxCtrlCode) {
                                        di.PlantAddress.ConsumptionTaxCtrlCode = foundProductPlant.ConsumptionTaxCtrlCode;
                                    } else if (foundProductPlant && foundProductPlant.ConsumptionTaxCtrlCode === undefined) {
                                        // if object found but ConsumptionTaxCtrlCode undefined, do nothing, keep null
                                    } else {
                                        // no productPlant found for any candidate
                                        // di.PlantAddress.ConsumptionTaxCtrlCode remains absent/null
                                    }
                                }
                            } catch (err) {
                                console.error(`Error fetching Plant details for Plant=${di.Plant}:`, err.message);
                            }
                        } // end if di.Plant

                        // --- Fetch Delivery Header (ShipToParty, SoldToParty) ---
                        if (di.DeliveryDocument) {
                            try {
                                const headerUrl = `${DELIVERY_HEADER_API_URL}?$filter=DeliveryDocument eq '${encodeURIComponent(di.DeliveryDocument)}'&$select=DeliveryDocument,ShipToParty,SoldToParty&$format=json`;
                                const headerData = await safeGet(headerUrl) || [];
                                const headerInfo = Array.isArray(headerData) ? headerData[0] : headerData;
                                if (headerInfo) {
                                    di.DeliveryHeader = {
                                        DeliveryDocument: headerInfo.DeliveryDocument || null,
                                        ShipToParty: headerInfo.ShipToParty || null,
                                        SoldToParty: headerInfo.SoldToParty || null
                                    };
                                    if (headerInfo.SoldToParty) bpIds.add(headerInfo.SoldToParty);
                                    if (headerInfo.ShipToParty) bpIds.add(headerInfo.ShipToParty);
                                }
                            } catch (err) {
                                console.error(`Error fetching Delivery Header for ${di.DeliveryDocument}:`, err.message);
                            }
                        }
                    } // end for each delivery item

                    so.DeliveryItems = deliveryItems;
                } // end for each sales order

                // --- Fetch Buyer & Consignee Addresses ---
                const bpDataMap = {};
                for (let bpId of bpIds) {
                    try {
                        const addrUrl = `${BUSINESS_PARTNER_API_URL}('${encodeURIComponent(bpId)}')/to_BusinessPartnerAddress?$format=json`;
                        const addrResults = await safeGet(addrUrl) || [];
                        const addr = Array.isArray(addrResults) ? addrResults[0] : addrResults;
                        if (addr) {
                            bpDataMap[bpId] = {
                                FullName: addr.FullName || null,
                                HouseNumber: addr.HouseNumber || null,
                                StreetName: addr.StreetName || null,
                                CityName: addr.CityName || null,
                                CompanyPostalCode: addr.CompanyPostalCode || null,
                                Country: addr.Country || null
                            };
                        } else {
                            bpDataMap[bpId] = null;
                        }
                    } catch (err) {
                        console.error(`Error fetching BP address for ${bpId}:`, err.message);
                        bpDataMap[bpId] = null;
                    }
                }

                // Attach Buyer/Consignee addresses to each delivery item
                for (let so of soData) {
                    if (Array.isArray(so.DeliveryItems)) {
                        for (let di of so.DeliveryItems) {
                            const dh = di.DeliveryHeader;
                            if (dh) {
                                di.BuyerAddress = dh.SoldToParty ? (bpDataMap[dh.SoldToParty] || null) : null;
                                di.ConsigneeAddress = dh.ShipToParty ? (bpDataMap[dh.ShipToParty] || null) : null;
                            }
                        }
                    }
                }

                mappedDoc.SalesOrders = soData;
            } catch (err) {
                console.error("Error fetching Sales Orders or Delivery data:", err.message);
            }
        } // end if salesDocIds

        // --- Fetch Payment Terms Name ---
        if (data.CustomerPaymentTerms) {
            try {
                const language = 'EN';
                const url = `${INCOTERM_API_URL}(PaymentTerms='${encodeURIComponent(data.CustomerPaymentTerms)}',Language='${language}')?$select=PaymentTerms,PaymentTermsName&$format=json`;
                const incotermResponse = await axios.get(url, { auth: { username: ABAP_USER, password: ABAP_PASS } });
                const paymentData = incotermResponse.data;
                if (paymentData) {
                    mappedDoc.termsOfPayment = paymentData.PaymentTerms || mappedDoc.termsOfPayment;
                    mappedDoc.PaymentTermsName = paymentData.PaymentTermsName || null;
                }
            } catch (err) {
                console.error("Error fetching Payment Terms Name:", err.message);
            }
        }

        return mappedDoc;
    };

    // --- GET handler ---
    this.on('READ', billingDocument, async (req) => {
        try {
            const billingDocumentId = req.params[0] ||
                (req.query.SELECT &&
                 req.query.SELECT.from &&
                 req.query.SELECT.from.ref[0] &&
                 req.query.SELECT.from.ref[0].where &&
                 req.query.SELECT.from.ref[0].where[2] &&
                 req.query.SELECT.from.ref[0].where[2].val);

            let url;
            if (billingDocumentId) {
                url = `${ABAP_API_URL}('${encodeURIComponent(billingDocumentId)}')?$format=json`;
            } else {
                url = `${ABAP_API_URL}?$format=json`;
            }

            const response = await axios.get(url, { auth: { username: ABAP_USER, password: ABAP_PASS } });
            const results = response.data.value || (response.data.d && response.data.d.results);

            if (billingDocumentId) {
                if (!response.data) return req.reject(404, `Billing Document '${billingDocumentId}' not found.`);
                const data = response.data.d || response.data;
                return {
                    billingDocumentID: data.BillingDocument,
                    DocumentCategory: data.SDDocumentCategory,
                    Division: data.Division,
                    BillingDocument: data.BillingDocument,
                    BillingDocumentDate: data.BillingDocumentDate,
                    BillingDocumentType: data.BillingDocumentType,
                    CompanyCode: data.CompanyCode,
                    FiscalYear: data.FiscalYear,
                    SalesOrganization: data.SalesOrganization,
                    DistributionChannel: data.DistributionChannel,
                    CustomerName: data.CustomerName
                };
            } else {
                if (!Array.isArray(results)) throw new Error("Expected an array of billing documents.");
                return results.map(data => ({
                    billingDocumentID: data.BillingDocument,
                    DocumentCategory: data.SDDocumentCategory,
                    Division: data.Division,
                    BillingDocument: data.BillingDocument,
                    BillingDocumentDate: data.BillingDocumentDate,
                    BillingDocumentType: data.BillingDocumentType,
                    CompanyCode: data.CompanyCode,
                    FiscalYear: data.FiscalYear,
                    SalesOrganization: data.SalesOrganization,
                    DistributionChannel: data.DistributionChannel,
                    CustomerName: data.CustomerName
                }));
            }

        } catch (err) {
            const errorMsg = (err.response && err.response.data && err.response.data.error && err.response.data.error.message) || err.message;
            req.reject(502, 'Error fetching data from the remote ABAP System.', { message: errorMsg });
        }
    });

    // --- POST handler: full enriched response ---
    this.on('CREATE', billingDocument, async (req) => {
        const { BillingDocument: billingDocumentId } = req.data;
        if (!billingDocumentId) return req.reject(400, 'A "BillingDocument" ID must be provided for POST.');

        try {
            const url = `${ABAP_API_URL}('${encodeURIComponent(billingDocumentId)}')?$expand=_Item,_Text&$format=json`;
            const response = await axios.get(url, { auth: { username: ABAP_USER, password: ABAP_PASS } });

            if (!response.data) return req.reject(404, `Billing Document '${billingDocumentId}' not found.`);
            
            return await mapBillingData(response.data);

        } catch (err) {
            const errorMsg = (err.response && err.response.data && err.response.data.error && err.response.data.error.message) || err.message;
            req.reject(502, 'Error fetching data from the remote ABAP System.', { message: errorMsg });
        }
    });
};
