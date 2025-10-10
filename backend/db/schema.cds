namespace my.billingDocument;

entity billingDocument {
    key billingDocumentID : String(20);
        DocumentCategory  : String(50);
        Division: String(50);
        BillingDocument: String(50);
        BillingDocumentDate: String(50);
        BillingDocumentType: String(50);
        CompanyCode: String(50);
        FiscalYear: String(50);
        SalesOrganization:String(50);
        DistributionChannel:String(50);
        SoldToParty: String(50);
        CustomerName: String(50);
        CreationDate:String(50);
        Country:String(50);
        CustomerPaymentTerms:String(50);
        YY1_VehicleNo2_BDH:String(50);
       
}