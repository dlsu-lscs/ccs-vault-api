import express from "express";
import authRoutes from "./routes/auth-routes.js";

const app = express();

app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    message: "CCS Vault API is running",
  });
});

app.use("/api/auth", authRoutes);

export default app;