const path = require("path");
const swaggerUi = require("swagger-ui-express");

const swaggerDocument = require(path.join(__dirname, "../../swagger.json"));

const swaggerServe = swaggerUi.serve;
const swaggerSetup = swaggerUi.setup(swaggerDocument, {
  customSiteTitle: "WhatsApp Web API",
});

module.exports = {
  swaggerDocument,
  swaggerServe,
  swaggerSetup,
};
