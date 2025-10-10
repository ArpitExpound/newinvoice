using my.billingDocument as db from '../db/schema';

service billingDocumentService @(path: '/api/v1') {
    entity billingDocument as projection on db.billingDocument;
    entity billingDocumentPost {
        key BillingDocument : String(20);
    }
}