import cors from "cors";
import express from "express";
import { config } from "./config";
import { errorHandler, notFound } from "./middleware/errorHandler";
import { apiRoutes } from "./routes";

export const app = express();

app.use(
  cors({
    origin: config.clientUrl,
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
