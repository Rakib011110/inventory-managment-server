import { app } from "./app";
import { connectDatabase } from "./config/db";
import { seedAdmin } from "./config/seed";
import { migrateStockAccounting } from "./modules/items/migrateStockAccounting";

let isInitialized = false;

async function ensureInitialized() {
  await connectDatabase();
  if (!isInitialized) {
    try {
      await seedAdmin();
      await migrateStockAccounting();
      isInitialized = true;
    } catch (err) {
      console.error("Initialization error:", err);
    }
  }
}

export default async function handler(req: any, res: any) {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,OPTIONS,PATCH,DELETE,POST,PUT",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization",
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    await ensureInitialized();
  } catch (error: any) {
    console.error("Database connection error:", error);
    return res.status(500).json({
      success: false,
      message: "Database connection failed",
      error: error?.message || "Check server DB_URL environment variable and MongoDB Atlas IP whitelist",
    });
  }

  return app(req, res);
}
