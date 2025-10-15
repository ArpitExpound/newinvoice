// srv/service.js
const cds = require('@sap/cds');
const axios = require('axios');
require('dotenv').config();
const stateCodeMap = require("../utils/stateCodeMap");

module.exports = async function () {
    const { billingDocument } = this.entities;
    const { 
        ABAP_API_URL,
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

    const productPlantCache = new Map();

    const safeGet = async (url) => {
        const resp = await axios.get(url, { auth: { username: ABAP_USER, password: ABAP_PASS } });
        if (!resp.data) return null;
        if (Array.isArray(resp.data)) return resp.data;
        if (resp.data.value) return resp.data.value;
        if (resp.data.d && resp.data.d.results) return resp.data.d.results;
        if (resp.data.d) return resp.data.d;
        return resp.data;
    };

    const fetchProductPlant = async (productId, plantId) => {
        if (!PRODUCT_PLANT_API_URL || !productId || !plantId) return null;
        const cacheKey = `${productId}__${plantId}`;
        if (productPlantCache.has(cacheKey)) return productPlantCache.get(cacheKey);

        try {
            const keyUrl = `${PRODUCT_PLANT_API_URL}(Product='${encodeURIComponent(productId)}',Plant='${encodeURIComponent(plantId)}')?$select=Product,Plant,ConsumptionTaxCtrlCode&$format=json`;
            const resp = await axios.get(keyUrl, { auth: { username: ABAP_USER, password: ABAP_PASS } });
            let data = resp.data && (resp.data.d || resp.data);
            if (data && data.results && Array.isArray(data.results) && data.results.length > 0) data = data.results[0];
            if (data && (data.ConsumptionTaxCtrlCode !== undefined || data.Product || data.Plant)) {
                productPlantCache.set(cacheKey, data);
                return data;
            }
        } catch (err) {}

        try {
            const filterUrl = `${PRODUCT_PLANT_API_URL}?$filter=Product eq '${productId}' and Plant eq '${plantId}'&$select=Product,Plant,ConsumptionTaxCtrlCode&$format=json`;
            const results = await safeGet(filterUrl);
            if (Array.isArray(results) && results.length > 0) {
                productPlantCache.set(cacheKey, results[0]);
                return results[0];
            }
            if (results && !Array.isArray(results)) {
                productPlantCache.set(cacheKey, results);
                return results;
            }
        } catch (err) {}

        productPlantCache.set(cacheKey, null);
        return null;
    };

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
            SalesOrders: [],
            Buyer: null,
            Consignee: null
        };

        // --- Map Billing Items ---
        const items = (data._Item && data._Item.results) || data._Item || [];
        if (Array.isArray(items) && items.length > 0) {
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
                Material: item.Material || item.Product || item.ProductID || null
            }));
        }

        // --- Fetch Sales Orders & Delivery Items ---
        const salesDocIds = [...new Set(mappedDoc.Items.map(it => it.SalesDocument).filter(id => id))];
        if (salesDocIds.length > 0) {
            try {
                const filterQuery = salesDocIds.map(id => `SalesOrder eq '${id}'`).join(" or ");
                const soUrl = `${SO_API_URL}?$filter=${filterQuery}&$select=SalesOrder,CustomerPurchaseOrderDate,PurchaseOrderByCustomer&$format=json`;
                const soResponse = await axios.get(soUrl, { auth: { username: ABAP_USER, password: ABAP_PASS } });
                const soData = soResponse.data.value || (soResponse.data.d && soResponse.data.d.results) || [];
                const bpIds = new Set();

                const mappedSalesOrders = [];
                for (let so of soData) {
                    const parsedDate = so.CustomerPurchaseOrderDate
                        ? (typeof so.CustomerPurchaseOrderDate === 'string' && /\/Date\((\d+)\)\//.test(so.CustomerPurchaseOrderDate)
                            ? new Date(parseInt(so.CustomerPurchaseOrderDate.replace(/\/Date\((\d+)\)\//, '$1'))).toISOString().split('T')[0]
                            : so.CustomerPurchaseOrderDate)
                        : null;

                    const deliveryFilter = `ReferenceSDDocument eq '${so.SalesOrder}'`;
                    const deliveryUrl = `${DELIVERY_ITEM_API_URL}?$filter=${deliveryFilter}&$select=DeliveryDocument,DeliveryDocumentItem,ReferenceSDDocument,ReferenceSDDocumentItem,Plant,Material&$format=json`;
                    const deliveryItems = (await safeGet(deliveryUrl)) || [];

                    const mappedDeliveryItems = [];
                    for (let di of deliveryItems) {
                        const mappedItem = {
                            DeliveryDocument: di.DeliveryDocument || null,
                            DeliveryDocumentItem: di.DeliveryDocumentItem || null,
                            ReferenceSDDocument: di.ReferenceSDDocument || null,
                            ReferenceSDDocumentItem: di.ReferenceSDDocumentItem || null,
                            Plant: di.Plant || null,
                            Material: di.Material || null,
                            PlantAddress: {},
                            DeliveryHeader: {}
                        };

                        // --- Fetch Plant details ---
                        if (di.Plant) {
                            try {
                                const plantUrl = `${ZI_PLANT1_API_URL}?$filter=Plant eq '${encodeURIComponent(di.Plant)}'&$select=PlantName,StreetName,HouseNumber,CityName,PostalCode,Region,Country,BusinessPlace&$format=json`;
                                const plantData = await safeGet(plantUrl);
                                const plantInfo = Array.isArray(plantData) ? plantData[0] : plantData;
                                if (plantInfo) {
                                // --- 🧠 Resolve state name and code ---
                                const gstCodeToStateAbbr = {};
                                for (const [abbr, { code }] of Object.entries(stateCodeMap)) {
                                    gstCodeToStateAbbr[code] = abbr;
                                }

                                const regionValue = plantInfo.Region?.toString();
                                let stateData =
                                    stateCodeMap[regionValue] ||
                                    Object.values(stateCodeMap).find(s => s.code === regionValue);

                                const stateCodeName = stateData?.name || null;
                                const stateCodeNum = stateData?.code || null;
                                    mappedItem.PlantAddress = {
                                        PlantName: plantInfo.PlantName || null,
                                        StreetName: plantInfo.StreetName || null,
                                        HouseNumber: plantInfo.HouseNumber || null,
                                        CityName: plantInfo.CityName || null,
                                        PostalCode: plantInfo.PostalCode || null,
                                        StateName: stateCodeName || regionValue || null,  // readable name
                                        StateCode: stateCodeNum || null,
                                        Region: plantInfo.Region || null,
                                        Country: plantInfo.Country || null,
                                        BusinessPlace: plantInfo.BusinessPlace || null
                                    };

                                    if (plantInfo.BusinessPlace) {
                                        const taxUrl = `${ZCE_TAX_DETAILS_API_URL}?$filter=BusinessPlace eq '${encodeURIComponent(plantInfo.BusinessPlace)}'&$select=IN_GSTIdentificationNumber&$format=json`;
                                        const taxData = await safeGet(taxUrl);
                                        const taxInfo = Array.isArray(taxData) ? taxData[0] : taxData;
                                        if (taxInfo?.IN_GSTIdentificationNumber) {
                                            mappedItem.PlantAddress.GSTIN = taxInfo.IN_GSTIdentificationNumber;
                                        }
                                    }

                                    const candidates = [di.Material, di.ReferenceSDDocumentItem, di.Product, di.ProductID].filter(Boolean);
                                    for (let candidate of candidates) {
                                        const pp = await fetchProductPlant(candidate, plantInfo.Plant);
                                        if (pp?.ConsumptionTaxCtrlCode) {
                                            mappedItem.PlantAddress.HSN = pp.ConsumptionTaxCtrlCode;
                                            break;
                                        }
                                    }
                                }
                            } catch (err) {
                                console.error(`Error fetching Plant details for ${di.Plant}:`, err.message);
                            }
                        }

                        // --- Fetch Delivery Header ---
                        if (di.DeliveryDocument) {
                            try {
                                const headerUrl = `${DELIVERY_HEADER_API_URL}?$filter=DeliveryDocument eq '${encodeURIComponent(di.DeliveryDocument)}'&$select=ShipToParty,SoldToParty&$format=json`;
                                const headerData = await safeGet(headerUrl);
                                const headerInfo = Array.isArray(headerData) ? headerData[0] : headerData;
                                if (headerInfo) {
                                    mappedItem.DeliveryHeader = {
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

                        mappedDeliveryItems.push(mappedItem);
                    }

                    mappedSalesOrders.push({
                        SalesOrder: so.SalesOrder || null,
                        CustomerPurchaseOrderDate: parsedDate,
                        PurchaseOrderByCustomer: so.PurchaseOrderByCustomer || null,
                        DeliveryItems: mappedDeliveryItems
                    });
                }

                // --- Fetch BP Addresses ---
                const bpDataMap = {};

for (let bpId of bpIds) {
    try {
        // --- Fetch BP Address ---
        const addrUrl = `${BUSINESS_PARTNER_API_URL}('${encodeURIComponent(bpId)}')/to_BusinessPartnerAddress?$format=json`;
        const addrResults = await safeGet(addrUrl);
        const addr = Array.isArray(addrResults) ? addrResults[0] : addrResults;

        if (addr) {
            // --- 🧠 Resolve state name and code ---
            const regionValue = addr.Region?.toString();
            let stateData =
                stateCodeMap[regionValue] ||
                Object.values(stateCodeMap).find(s => s.code === regionValue);

            const stateName = stateData?.name || null;
            const stateCode = stateData?.code || null;

            // --- 🧩 Initialize BP object ---
            const bpObj = {
                FullName: addr.FullName || null,
                HouseNumber: addr.HouseNumber || null,
                StreetPrefixName: addr.StreetPrefixName || null,
                StreetName: addr.StreetName || null,
                CityName: addr.CityName || null,
                StateName: stateName || regionValue || null,
                StateCode: stateCode || null,
                PostalCode: addr.PostalCode || null,
                Country: addr.Country || null,
                GSTIN: null // will populate below
            };

            // --- Fetch GSTIN from Business Partner Tax (BPTaxType = 'IN3') ---
            try {
                const taxUrl = `${BUSINESS_PARTNER_API_URL}('${encodeURIComponent(bpId)}')/to_BusinessPartnerTax?$format=json`;
                const taxResults = await safeGet(taxUrl);

                // Normalize for OData V2/V4
                const taxes = Array.isArray(taxResults)
                    ? taxResults
                    : taxResults.results
                        ? taxResults.results
                        : taxResults.d?.results || [];

                const gstEntry = taxes.find(t => t.BPTaxType === 'IN3');
                if (gstEntry && gstEntry.BPTaxNumber) {
                    bpObj.GSTIN = gstEntry.BPTaxNumber;
                }
            } catch (taxErr) {
                console.error(`Error fetching GSTIN for BP ${bpId}:`, taxErr.message);
            }

            bpDataMap[bpId] = bpObj;
        } else {
            bpDataMap[bpId] = null;
        }
    } catch (err) {
        console.error(`Error fetching BP address for ${bpId}:`, err.message);
        bpDataMap[bpId] = null;
    }
}

                // --- Extract Buyer & Consignee globally from first DeliveryItem ---
                if (mappedSalesOrders.length > 0 && mappedSalesOrders[0].DeliveryItems.length > 0) {
                    const firstItem = mappedSalesOrders[0].DeliveryItems[0];
                    const dh = firstItem.DeliveryHeader;
                    if (dh) {
                        mappedDoc.Buyer = dh.SoldToParty ? bpDataMap[dh.SoldToParty] || null : null;
                        mappedDoc.Consignee = dh.ShipToParty ? bpDataMap[dh.ShipToParty] || null : null;
                    }
                }

                mappedDoc.SalesOrders = mappedSalesOrders;

            } catch (err) {
                console.error("Error fetching Sales Orders or Delivery data:", err.message);
            }
        }

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
                url = `${ABAP_API_URL}?$top=500&?$format=json`;
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

    // --- POST handler ---
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
