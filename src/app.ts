import cors from "cors";
import express from "express";
import { config } from "./config";
import { errorHandler, notFound } from "./middleware/errorHandler";
import { apiRoutes } from "./routes";

export const app = express();

const allowedOrigins = [
  config.clientUrl,
  "http://localhost:3000",
  "https://inventory-managment-client.vercel.app",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const cleanOrigin = origin.replace(/\/$/, "");
      if (
        allowedOrigins.some((o) => cleanOrigin === o.replace(/\/$/, "")) ||
        cleanOrigin.endsWith(".vercel.app")
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.json({ success: true, message: "Inventory API is running" });
});

app.get("/health", (_req, res) => {
  res.json({ success: true, message: "Inventory API is running" });
});

app.use("/api/v1", apiRoutes);
app.use(notFound);
app.use(errorHandler);
