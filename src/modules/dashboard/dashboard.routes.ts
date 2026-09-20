import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { Item } from "../items/item.model";
import { Holding } from "../stock/holding.model";
import { StockMovement } from "../stock/stockMovement.model";
import { User } from "../users/user.model";

export const dashboardRoutes = Router();

dashboardRoutes.get(
  "/admin-summary",
  authenticate,
  requireRole("ADMIN"),
  asyncHandler(async (_req, res) => {
    const [inventory = {}, totalUsers, recentMovements] = await Promise.all([
      Item.aggregate([
        { $match: { status: "ACTIVE" } },
        {
          $group: {
            _id: null,
            totalItemTypes: { $sum: 1 },
            totalAvailableUnits: { $sum: "$availableQuantity" },
            totalAssignedUnits: { $sum: "$assignedQuantity" },
            totalStoredUnits: { $sum: "$storedQuantity" },
            totalInventoryValue: {
              $sum: { $multiply: ["$quantity", "$unitPrice"] },
            },
            totalAssignedInventoryValue: {
              $sum: { $multiply: ["$assignedQuantity", "$unitPrice"] },
            },
          },
        },
      ]).then((rows) => rows[0]),
      User.countDocuments({ role: "USER", status: "ACTIVE" }),
      StockMovement.find()
        .populate("item", "name")
        .populate("user", "name")
        .populate("fromUser", "name")
        .populate("toUser", "name")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ]);

    res.json({
      success: true,
      data: {
        totalItemTypes: inventory.totalItemTypes ?? 0,
        totalAvailableUnits: inventory.totalAvailableUnits ?? 0,
        totalAssignedUnits: inventory.totalAssignedUnits ?? 0,
        totalStoredUnits: inventory.totalStoredUnits ?? 0,
        totalInventoryValue: inventory.totalInventoryValue ?? 0,
        totalAssignedInventoryValue:
          inventory.totalAssignedInventoryValue ?? 0,
        totalUsers,
        recentMovements,
      },
    });
  }),
);

dashboardRoutes.get(
  "/my-items",
  authenticate,
  requireRole("USER"),
  asyncHandler(async (req, res) => {
    const holdings = await Holding.find({ user: req.user!.id })
      .populate("item", "name unitPrice")
      .sort({ updatedAt: -1 })
      .lean();

    const rows = holdings.map((holding) => {
      const item = holding.item as unknown as {
        _id: { toString(): string };
        name: string;
        unitPrice: number;
      };
      return {
        _id: holding._id.toString(),
        itemId: item._id.toString(),
        itemName: item.name,
        quantity: holding.quantity,
        unitPrice: item.unitPrice,
        totalValue: holding.quantity * item.unitPrice,
        location: holding.location,
        purpose: holding.purpose ?? "USE",
      };
    });

    const totalItems = rows.reduce((sum, row) => sum + row.quantity, 0);
    const totalValue = rows.reduce((sum, row) => sum + row.totalValue, 0);
    res.json({
      success: true,
      data: { items: rows, totalItems, totalValue },
    });
  }),
);
