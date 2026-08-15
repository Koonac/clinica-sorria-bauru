// Ponto de entrada da aplicação
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

require("./src/app");
