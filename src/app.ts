import express from "express";

const app = express();

app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    message: "CCS Vault API is running",
  });
});

// Liveness only; add a DB-backed /ready once pg is used.
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

export default app;
const broken: number = "not a number";
export { broken };
