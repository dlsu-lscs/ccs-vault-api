import express from "express";
import authRoutes from "./routes/auth-routes.js";
import courseRoutes from "./routes/course-routes.js";

const app = express();

app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    message: "CCS Vault API is running",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/courses", courseRoutes);
// Liveness only; add a DB-backed /ready once pg is used.
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

export default app;