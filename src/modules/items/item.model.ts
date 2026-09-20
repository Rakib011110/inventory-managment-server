import { Schema, model } from "mongoose";

export interface IItem {
  name: string;
  location: string;
  description?: string;
  quantity: number;
  availableQuantity: number;
  assignedQuantity: number;
  storedQuantity: number;
  unitPrice: number;
  stockAccountingVersion: number;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: Date;
  updatedAt: Date;
}

const itemSchema = new Schema<IItem>(
  {
    name: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    quantity: { type: Number, required: true, min: 0 },
    availableQuantity: { type: Number, required: true, min: 0 },
    assignedQuantity: { type: Number, default: 0, min: 0 },
    storedQuantity: { type: Number, default: 0, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    stockAccountingVersion: { type: Number, default: 4 },
    status: {
      type: String,
      enum: ["ACTIVE", "ARCHIVED"],
      default: "ACTIVE",
    },
  },
  { timestamps: true },
);

itemSchema.index({ name: "text", location: "text" });

export const Item = model<IItem>("Item", itemSchema);
