import { app } from "./app";
import { config } from "./config";
import { connectDatabase } from "./config/db";
import { seedAdmin } from "./config/seed";
import { migrateStockAccounting } from "./modules/items/migrateStockAccounting";

async function start() {
  await connectDatabase();
  await migrateStockAccounting();
  await seedAdmin();
  app.listen(config.port, () => {
    console.log(`Inventory API listening on http://localhost:${config.port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
