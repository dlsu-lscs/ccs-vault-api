import "dotenv/config";
import app from "./app.js";
import { startSessionCleanupJob } from "./services/session-service.js";

const PORT = Number(process.env.PORT) || 3001;

const server = app.listen(PORT, () => {
  console.log(`CCS Vault API running on port ${PORT}`);
  startSessionCleanupJob();
});

server.on("error", (err: Error) => {
  console.error(`Failed to start: ${err.message}`);
  process.exit(1);
});