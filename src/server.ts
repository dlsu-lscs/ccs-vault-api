import "dotenv/config";
import app from "./app.js";

const PORT = Number(process.env.PORT) || 3001;

app.listen(PORT, (err?: Error) => {
  if (err) {
    console.error(`Failed to start: ${err.message}`);
    process.exit(1);
  }
  console.log(`CCS Vault API running on port ${PORT}`);
});