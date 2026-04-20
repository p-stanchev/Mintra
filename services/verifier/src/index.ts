import "dotenv/config";
import { buildVerifierApp } from "./app";

const port = Number(process.env["PORT"] ?? 3002);

buildVerifierApp()
  .then((app) => app.listen({ port, host: "0.0.0.0" }))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
