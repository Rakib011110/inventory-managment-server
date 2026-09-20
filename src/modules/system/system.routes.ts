import { Router } from "express";
import mongoose from "mongoose";
import { authenticate, requireRole } from "../../middleware/auth";
import { AppError } from "../../utils/AppError";
import { asyncHandler } from "../../utils/asyncHandler";
import { Item } from "../items/item.model";
import { Holding } from "../stock/holding.model";
import { StockMovement } from "../stock/stockMovement.model";
import { User } from "../users/user.model";

export const systemRoutes = Router();

systemRoutes.use(authenticate, requireRole("ADMIN"));

systemRoutes.delete(
  "/database",
  asyncHandler(async (req, res) => {
    if (req.body?.confirmation !== "CLEAR DATABASE") {
      throw new AppError(400, 'Type "CLEAR DATABASE" to confirm this action');
    }

    const session = await mongoose.startSession();
    let deletedItems = 0;
    let deletedAssignments = 0;
    let deletedMovements = 0;
    let deletedUsers = 0;

    try {
      await session.withTransaction(async () => {
        const movements = await StockMovement.deleteMany({}).session(session);
        const assignments = await Holding.deleteMany({}).session(session);
        const items = await Item.deleteMany({}).session(session);
        const users = await User.deleteMany({
          _id: { $ne: req.user!.id },
        }).session(session);

        deletedMovements = movements.deletedCount;
        deletedAssignments = assignments.deletedCount;
        deletedItems = items.deletedCount;
        deletedUsers = users.deletedCount;
      });
    } finally {
      await session.endSession();
    }

    res.json({
      success: true,
      data: {
        deletedItems,
        deletedAssignments,
        deletedMovements,
        deletedUsers,
        retainedAdminId: req.user!.id,
      },
    });
  }),
);
