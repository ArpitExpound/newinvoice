const cds = require('@sap/cds');
const cors = require('cors');
 
cds.on('bootstrap', app => {
  app.use(cors({
    origin: '*',   // allow all frontends
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
});
 
module.exports = cds.server;