import { Schema, Types, model } from "mongoose";

export interface IHolding {
  item: Types.ObjectId;
  user: Types.ObjectId;
  quantity: number;
  location: string;
  purpose: "STORE" | "USE";
  assignedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const holdingSchema = new Schema<IHolding>(
  {
    item: { type: Schema.Types.ObjectId, ref: "Item", required: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    quantity: { type: Number, required: true, min: 1 },
    location: { type: String, required: true, trim: true },
    purpose: {
      type: String,
      enum: ["STORE", "USE"],
      default: "USE",
      required: true,
    },
    assignedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

holdingSchema.index({ item: 1, user: 1 }, { unique: true });
holdingSchema.index({ user: 1, updatedAt: -1 });

export const Holding = model<IHolding>("Holding", holdingSchema);
