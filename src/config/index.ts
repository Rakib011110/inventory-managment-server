import dotenv from "dotenv";

dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 5000),
  dbUrl:
    process.env.DB_URL ??
    "mongodb://127.0.0.1:27017/inventory-management",
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:3000",
  jwtSecret: process.env.JWT_SECRET ?? "development-only-secret",
  cookieName: "inventory_token",
  cookieSecure:
    process.env.COOKIE_SECURE !== undefined
      ? process.env.COOKIE_SECURE === "true"
      : process.env.NODE_ENV === "production",
  adminName: process.env.ADMIN_NAME ?? "System Admin",
  adminEmail: process.env.ADMIN_EMAIL ?? "admin@example.com",
  adminPassword: process.env.ADMIN_PASSWORD ?? "admin12345",
};
