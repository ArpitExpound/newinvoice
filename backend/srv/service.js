const cds = require('@sap/cds');
const axios = require('axios');
require('dotenv').config();

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
        BUSINESS_PARTNER_API_URL
    } = process.env;

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
            CustomerName: data.CustomerName,
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

        // --- Map Items ---
        const items = (data._Item && data._Item.results) || data._Item || [];
        if (Array.isArray(items) && items.length > 0) {
            mappedDoc.Items = items.map(item => ({
                BillingDocumentItem: item.BillingDocumentItem,
                ItemCategory: item.SalesDocumentItemCategory,
                SalesDocumentItemType: item.SalesDocumentItemType,
                SalesDocument: item.SalesDocument,
                ReferenceSDDocument: item.ReferenceSDDocument
            }));
        }

        // --- Fetch Sales Orders ---
        const salesDocIds = [...new Set(mappedDoc.Items.map(item => item.SalesDocument).filter(id => id))];
        if (salesDocIds.length > 0) {
            try {
                const filterQuery = salesDocIds.map(id => `SalesOrder eq '${id}'`).join(" or ");
                const soResponse = await axios.get(
                    `${SO_API_URL}?$filter=${filterQuery}&$select=SalesOrder,CustomerPurchaseOrderDate,PurchaseOrderByCustomer&$format=json`,
                    { auth: { username: ABAP_USER, password: ABAP_PASS } }
                );
                const soData = soResponse.data.value || (soResponse.data.d && soResponse.data.d.results) || [];

                // Collect all unique Buyer and Consignee IDs
                const bpIds = new Set();

                for (let so of soData) {
                    // Fetch delivery items
                    so.CustomerPurchaseOrderDate = so.CustomerPurchaseOrderDate
                        ? new Date(parseInt(so.CustomerPurchaseOrderDate.replace(/\/Date\((\d+)\)\//, '$1'))).toISOString().split('T')[0]
                        : null;
                    const deliveryFilter = `ReferenceSDDocument eq '${so.SalesOrder}'`;
                    const deliveryResponse = await axios.get(
                        `${DELIVERY_ITEM_API_URL}?$filter=${deliveryFilter}&$select=DeliveryDocument,ReferenceSDDocument,ReferenceSDDocumentItem,Plant&$format=json`,
                        { auth: { username: ABAP_USER, password: ABAP_PASS } }
                    );
                    const deliveryItems = deliveryResponse.data.value || (deliveryResponse.data.d && deliveryResponse.data.d.results) || [];

                    for (let item of deliveryItems) {
                        // --- Fetch Plant details ---
                        if (item.Plant) {
                            try {
                                const plantResponse = await axios.get(
                                    `${ZI_PLANT1_API_URL}?$filter=Plant eq '${item.Plant}'&$select=PlantName,Plant,StreetName,HouseNumber,CityName,PostalCode,Region,Country,BusinessPlace&$format=json`,
                                    { auth: { username: ABAP_USER, password: ABAP_PASS } }
                                );
                                const plantData = plantResponse.data.value || (plantResponse.data.d && plantResponse.data.d.results) || [];
                                if (plantData.length > 0) {
                                    const plantInfo = plantData[0];
                                    item.PlantAddress = {
                                        PlantName:plantInfo.PlantName || nill,
                                        StreetName: plantInfo.StreetName || null,
                                        HouseNumber: plantInfo.HouseNumber || null,
                                        CityName: plantInfo.CityName || null,
                                        PostalCode: plantInfo.PostalCode || null,
                                        Region: plantInfo.Region || null,
                                        Country: plantInfo.Country || null,
                                        BusinessPlace: plantInfo.BusinessPlace || null
                                    };

                                    // Fetch GST
                                    if (plantInfo.BusinessPlace) {
                                        try {
                                            const taxResponse = await axios.get(
                                                `${ZCE_TAX_DETAILS_API_URL}?$filter=BusinessPlace eq '${plantInfo.BusinessPlace}'&$select=BusinessPlace,IN_GSTIdentificationNumber&$format=json`,
                                                { auth: { username: ABAP_USER, password: ABAP_PASS } }
                                            );
                                            const taxData = taxResponse.data.value || (taxResponse.data.d && taxResponse.data.d.results) || [];
                                            if (taxData.length > 0) {
                                                item.PlantAddress.in_GSTIdentificationNumber = taxData[0].IN_GSTIdentificationNumber || null;
                                            }
                                        } catch (err) {
                                            console.error(`Error fetching Tax details for ${plantInfo.BusinessPlace}:`, err.message);
                                        }
                                    }
                                }
                            } catch (err) {
                                console.error(`Error fetching Plant details for ${item.Plant}:`, err.message);
                            }
                        }

                        // --- Fetch Delivery Header (ShipToParty, SoldToParty) ---
                        if (item.DeliveryDocument) {
                            try {
                                const deliveryHeaderResponse = await axios.get(
                                    `${DELIVERY_HEADER_API_URL}?$filter=DeliveryDocument eq '${item.DeliveryDocument}'&$select=DeliveryDocument,ShipToParty,SoldToParty&$format=json`,
                                    { auth: { username: ABAP_USER, password: ABAP_PASS } }
                                );
                                const headerData = deliveryHeaderResponse.data.value || (deliveryHeaderResponse.data.d && deliveryHeaderResponse.data.d.results) || [];
                                if (headerData.length > 0) {
                                    const headerInfo = headerData[0];
                                    item.DeliveryHeader = {
                                        DeliveryDocument: headerInfo.DeliveryDocument || null,
                                        ShipToParty: headerInfo.ShipToParty || null,
                                        SoldToParty: headerInfo.SoldToParty || null
                                    };

                                    if (headerInfo.SoldToParty) bpIds.add(headerInfo.SoldToParty);
                                    if (headerInfo.ShipToParty) bpIds.add(headerInfo.ShipToParty);
                                }
                            } catch (err) {
                                console.error(`Error fetching Delivery Header for ${item.DeliveryDocument}:`, err.message);
                            }
                        }
                    }

                    so.DeliveryItems = deliveryItems;
                }

                // --- Fetch Buyer and Consignee Addresses ---
                const bpDataMap = {};
                for (let bpId of bpIds) {
                    try {
                        const addrResponse = await axios.get(
                            `${BUSINESS_PARTNER_API_URL}('${encodeURIComponent(bpId)}')/to_BusinessPartnerAddress?$format=json`,
                            { auth: { username: ABAP_USER, password: ABAP_PASS } }
                        );
                        const addrResults = addrResponse.data.value || (addrResponse.data.d && addrResponse.data.d.results) || [];
                        if (addrResults.length > 0) {
                            const addr = addrResults[0];
                            bpDataMap[bpId] = {
                                FullName: addr.FullName || null,
                                HouseNumber: addr.HouseNumber || null,
                                StreetName: addr.StreetName || null,
                                StreetPrefixName: addr.StreetPrefixName || null,
                                AdditionalStreetPrefixName: addr.AdditionalStreetPrefixName || null,
                                CityName: addr.CityName || null,
                                CompanyPostalCode: addr.CompanyPostalCode || null,
                                Country: addr.Country || null,
                                
                                
                               
                            };
                        } else {
                            bpDataMap[bpId] = null;
                        }
                    } catch (err) {
                        console.error(`Error fetching BP address for ${bpId}:`, err.message);
                        bpDataMap[bpId] = null;
                    }
                }

                // Attach Buyer and Consignee addresses
                for (let so of soData) {
                    for (let item of so.DeliveryItems) {
                        const dh = item.DeliveryHeader;
                        if (dh) {
                            item.BuyerAddress = dh.SoldToParty ? bpDataMap[dh.SoldToParty] || null : null;
                            item.ConsigneeAddress = dh.ShipToParty ? bpDataMap[dh.ShipToParty] || null : null;
                        }
                    }
                }

                mappedDoc.SalesOrders = soData;

            } catch (err) {
                console.error("Error fetching Sales Orders or Delivery data:", err.message);
            }
        }

        // --- Fetch Payment Terms Name ---
        if (data.CustomerPaymentTerms) {
            try {
                const language = 'EN';
                const url = `${INCOTERM_API_URL}(PaymentTerms='${data.CustomerPaymentTerms}',Language='${language}')?$select=PaymentTerms,PaymentTermsName&$format=json`;
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
                url = `${ABAP_API_URL}('${billingDocumentId}')?$format=json`;
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
            const url = `${ABAP_API_URL}('${billingDocumentId}')?$expand=_Item,_Text&$format=json`;
            const response = await axios.get(url, { auth: { username: ABAP_USER, password: ABAP_PASS } });

            if (!response.data) return req.reject(404, `Billing Document '${billingDocumentId}' not found.`);
            
            return await mapBillingData(response.data);

        } catch (err) {
            const errorMsg = (err.response && err.response.data && err.response.data.error && err.response.data.error.message) || err.message;
            req.reject(502, 'Error fetching data from the remote ABAP System.', { message: errorMsg });
        }
    });
};