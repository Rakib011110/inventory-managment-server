import { app } from "./app";
import { connectDatabase } from "./config/db";

export default async function handler(req: any, res: any) {
  try {
    await connectDatabase();
  } catch (error) {
    console.error("Database connection error:", error);
    return res.status(500).json({
      success: false,
      message: "Database connection failed",
    });
  }
  return app(req, res);
}
