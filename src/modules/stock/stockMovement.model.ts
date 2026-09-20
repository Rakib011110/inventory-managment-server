import { Schema, Types, model } from "mongoose";

export type StockMovementType =
  | "OUT"
  | "STORE"
  | "IN"
  | "UPDATE"
  | "TRANSFER"
  | "DELETE";

export interface IStockMovement {
  type: StockMovementType;
  item: Types.ObjectId;
  quantity: number;
  user?: Types.ObjectId;
  fromUser?: Types.ObjectId;
  toUser?: Types.ObjectId;
  location?: string;
  fromLocation?: string;
  toLocation?: string;
  purpose?: "STORE" | "USE";
  fromPurpose?: "STORE" | "USE";
  toPurpose?: "STORE" | "USE";
  previousQuantity?: number;
  newQuantity?: number;
  note?: string;
  performedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const stockMovementSchema = new Schema<IStockMovement>(
  {
    type: {
      type: String,
      enum: ["OUT", "STORE", "IN", "UPDATE", "TRANSFER", "DELETE"],
      required: true,
    },
    item: { type: Schema.Types.ObjectId, ref: "Item", required: true },
    quantity: { type: Number, required: true, min: 0 },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    fromUser: { type: Schema.Types.ObjectId, ref: "User" },
    toUser: { type: Schema.Types.ObjectId, ref: "User" },
    location: { type: String, trim: true },
    fromLocation: { type: String, trim: true },
    toLocation: { type: String, trim: true },
    purpose: { type: String, enum: ["STORE", "USE"] },
    fromPurpose: { type: String, enum: ["STORE", "USE"] },
    toPurpose: { type: String, enum: ["STORE", "USE"] },
    previousQuantity: { type: Number, min: 0 },
    newQuantity: { type: Number, min: 0 },
    note: { type: String, trim: true },
    performedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

stockMovementSchema.index({ item: 1, createdAt: -1 });
stockMovementSchema.index({ user: 1, createdAt: -1 });

export const StockMovement = model<IStockMovement>(
  "StockMovement",
  stockMovementSchema,
);
