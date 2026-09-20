import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth";
import { AppError } from "../../utils/AppError";
import { asyncHandler } from "../../utils/asyncHandler";
import { Holding } from "../stock/holding.model";
import { StockMovement } from "../stock/stockMovement.model";
import { Item } from "./item.model";

export const itemRoutes = Router();

itemRoutes.use(authenticate, requireRole("ADMIN"));

itemRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    const search = String(req.query.search ?? "").trim();
    const query: Record<string, unknown> = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { location: { $regex: search, $options: "i" } },
      ];
    }
    const items = await Item.find(query).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: items });
  }),
);

itemRoutes.post(
  "/",
  asyncHandler(async (req, res) => {
    const { name, location, description, quantity, unitPrice } = req.body;
    const parsedQuantity = Number(quantity);
    const parsedPrice = Number(unitPrice);
    if (
      !name ||
      !location ||
      !Number.isInteger(parsedQuantity) ||
      parsedQuantity < 0 ||
      parsedPrice < 0
    ) {
      throw new AppError(
        400,
        "Enter a name, location, valid quantity, and unit price",
      );
    }
    const item = await Item.create({
      name,
      location,
      description,
      quantity: parsedQuantity,
      availableQuantity: parsedQuantity,
      assignedQuantity: 0,
      storedQuantity: 0,
      unitPrice: parsedPrice,
      stockAccountingVersion: 4,
    });
    res.status(201).json({ success: true, data: item });
  }),
);

itemRoutes.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const [item, holdings, history] = await Promise.all([
      Item.findById(req.params.id).lean(),
      Holding.find({ item: req.params.id })
        .populate("user", "name email")
        .sort({ createdAt: 1 })
        .lean(),
      StockMovement.find({ item: req.params.id })
        .populate("user", "name")
        .populate("fromUser", "name")
        .populate("toUser", "name")
        .populate("performedBy", "name")
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
    ]);
    if (!item) throw new AppError(404, "Item not found");
    res.json({ success: true, data: { item, holdings, history } });
  }),
);

itemRoutes.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const item = await Item.findById(req.params.id);
    if (!item) throw new AppError(404, "Item not found");

    if (req.body.quantity !== undefined) {
      const quantity = Number(req.body.quantity);
      const allocatedQuantity = item.assignedQuantity + item.storedQuantity;
      if (!Number.isInteger(quantity) || quantity < allocatedQuantity) {
        throw new AppError(
          400,
          `Total stock cannot be below ${allocatedQuantity} units held by people`,
        );
      }
      item.quantity = quantity;
      item.availableQuantity = quantity - item.assignedQuantity;
    }

    for (const key of ["name", "location", "description", "status"] as const) {
      if (req.body[key] !== undefined) {
        (item as unknown as Record<string, unknown>)[key] = req.body[key];
      }
    }
    if (req.body.unitPrice !== undefined) {
      const unitPrice = Number(req.body.unitPrice);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new AppError(400, "Unit price must be zero or greater");
      }
      item.unitPrice = unitPrice;
    }

    await item.save();
    res.json({ success: true, data: item });
  }),
);

itemRoutes.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await Item.findById(req.params.id);
    if (!existing) throw new AppError(404, "Item not found");
    if (existing.assignedQuantity > 0 || existing.storedQuantity > 0) {
      throw new AppError(400, "Remove all person assignments before deleting this item");
    }
    existing.status = "ARCHIVED";
    const item = await existing.save();
    res.json({ success: true, data: item });
  }),
);
