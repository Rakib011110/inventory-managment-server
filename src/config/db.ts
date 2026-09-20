import mongoose from "mongoose";
import { config } from "./index";

export async function connectDatabase() {
  if (mongoose.connection.readyState >= 1) {
    return;
  }
  await mongoose.connect(config.dbUrl, {
    serverSelectionTimeoutMS: 5000,
  });
  console.log("MongoDB connected");
}

