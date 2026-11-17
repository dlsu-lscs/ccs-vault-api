import express from "express";
import { errorHandler, notFoundHandler } from "./middleware/error-middleware.js";
import authRoutes from "./routes/auth-routes.js";
import courseRoutes from "./routes/course-routes.js";

/**
 * Resolves Express's `trust proxy` setting from `TRUST_PROXY`.
 * Defaults to `1` for Dokploy's single Traefik reverse proxy hop.
 */
export function resolveTrustProxy(raw?: string): boolean | number | string {
  const value = raw?.trim();
  if (!value) {
    return 1;
  }
  if (value === "false") {
    return false;
  }
  if (value === "true") {
    throw new Error(
      'TRUST_PROXY must not be "true"; specify a hop count (e.g. "1"), "false", or trusted proxy IPs/subnets.'
    );
  }
  if (/^\d+$/.test(value)) {
    const hops = Number(value);
    return hops === 0 ? false : hops;
  }
  return value;
}

const app = express();

app.set("trust proxy", resolveTrustProxy(process.env.TRUST_PROXY));

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

app.use(notFoundHandler);
app.use(errorHandler);

export default app;