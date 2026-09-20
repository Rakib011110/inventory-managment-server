import { app } from "./app";
import { config } from "./config";
import { connectDatabase } from "./config/db";
import { migrateStockAccounting } from "./modules/items/migrateStockAccounting";
import { User } from "./modules/users/user.model";

async function seedAdmin() {
  if (!config.adminEmail || !config.adminPassword) return;
  const existing = await User.findOne({
    email: config.adminEmail.toLowerCase(),
  });
  if (!existing) {
    await User.create({
      name: config.adminName,
      email: config.adminEmail,
      password: config.adminPassword,
      role: "ADMIN",
      status: "ACTIVE",
    });
    console.log(`Created initial Admin: ${config.adminEmail}`);
  }
}

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
