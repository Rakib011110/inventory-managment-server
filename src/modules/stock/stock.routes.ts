import { Router } from "express";
import mongoose, { HydratedDocument } from "mongoose";
import { authenticate, requireRole } from "../../middleware/auth";
import { AppError } from "../../utils/AppError";
import { asyncHandler } from "../../utils/asyncHandler";
import { Item } from "../items/item.model";
import { User } from "../users/user.model";
import { Holding, IHolding } from "./holding.model";
import { StockMovement } from "./stockMovement.model";

export const stockRoutes = Router();

stockRoutes.use(authenticate, requireRole("ADMIN"));

type AssignmentPurpose = "STORE" | "USE";

function positiveInteger(value: unknown, field: string) {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new AppError(400, `${field} must be a positive whole number`);
  }
  return quantity;
}

function assignmentPurpose(
  value: unknown,
  fallback: AssignmentPurpose = "USE",
): AssignmentPurpose {
  if (value === undefined || value === null || value === "") return fallback;
  if (value !== "STORE" && value !== "USE") {
    throw new AppError(400, "Purpose must be Store or Use");
  }
  return value;
}

function unallocatedStockExpression(requiredQuantity: number) {
  return {
    $gte: [
      {
        $subtract: [
          "$quantity",
          {
            $add: [
              { $ifNull: ["$assignedQuantity", 0] },
              { $ifNull: ["$storedQuantity", 0] },
            ],
          },
        ],
      },
      requiredQuantity,
    ],
  };
}

async function applyHoldingChange({
  holding,
  newQuantity,
  newPurpose,
  location,
  note,
  performedBy,
  session,
  forcedType,
}: {
  holding: HydratedDocument<IHolding>;
  newQuantity: number;
  newPurpose: AssignmentPurpose;
  location: string;
  note?: string;
  performedBy: string;
  session: mongoose.ClientSession;
  forcedType?: "IN";
}) {
  const previousQuantity = holding.quantity;
  const previousLocation = holding.location;
  const previousPurpose = holding.purpose ?? "USE";
  const quantityDifference = newQuantity - previousQuantity;

  const previousUse = previousPurpose === "USE" ? previousQuantity : 0;
  const previousStore = previousPurpose === "STORE" ? previousQuantity : 0;
  const nextUse = newPurpose === "USE" ? newQuantity : 0;
  const nextStore = newPurpose === "STORE" ? newQuantity : 0;
  const useDifference = nextUse - previousUse;
  const storeDifference = nextStore - previousStore;

  const itemFilter: Record<string, unknown> = { _id: holding.item };
  if (quantityDifference > 0) {
    itemFilter.$expr = unallocatedStockExpression(quantityDifference);
  }
  if (useDifference > 0) {
    itemFilter.availableQuantity = { $gte: useDifference };
  }

  const item = await Item.findOneAndUpdate(
    itemFilter,
    {
      $inc: {
        availableQuantity: -useDifference,
        assignedQuantity: useDifference,
        storedQuantity: storeDifference,
      },
    },
    { session, returnDocument: "after" },
  );
  if (!item) {
    throw new AppError(
      400,
      "Not enough unallocated stock. Reduce or transfer an existing assignment first.",
    );
  }

  const movementType = forcedType
    ? forcedType
    : quantityDifference > 0
      ? newPurpose === "STORE"
        ? "STORE"
        : "OUT"
      : quantityDifference < 0
        ? "IN"
        : "UPDATE";

  await StockMovement.create(
    [
      {
        type: movementType,
        item: holding.item,
        user: holding.user,
        quantity:
          Math.abs(quantityDifference) ||
          (previousPurpose !== newPurpose ? newQuantity : 0),
        location,
        fromLocation: previousLocation,
        toLocation: location,
        purpose: newPurpose,
        fromPurpose: previousPurpose,
        toPurpose: newPurpose,
        previousQuantity,
        newQuantity,
        note,
        performedBy,
      },
    ],
    { session },
  );

  if (newQuantity === 0) {
    await holding.deleteOne({ session });
    return null;
  }

  holding.quantity = newQuantity;
  holding.location = location;
  holding.purpose = newPurpose;
  holding.assignedBy = new mongoose.Types.ObjectId(performedBy);
  await holding.save({ session });
  return holding._id.toString();
}

stockRoutes.get(
  "/history",
  asyncHandler(async (_req, res) => {
    const history = await StockMovement.find()
      .populate("item", "name")
      .populate("user", "name")
      .populate("fromUser", "name")
      .populate("toUser", "name")
      .populate("performedBy", "name")
      .sort({ createdAt: -1 })
      .limit(250)
      .lean();
    res.json({ success: true, data: history });
  }),
);

stockRoutes.post(
  "/out",
  asyncHandler(async (req, res) => {
    const { itemId, userId, location, note } = req.body;
    const quantity = positiveInteger(req.body.quantity, "Quantity");
    const purpose = assignmentPurpose(req.body.purpose);
    if (!itemId || !userId || !String(location ?? "").trim()) {
      throw new AppError(400, "Item, user, and location are required");
    }

    const session = await mongoose.startSession();
    let holdingId = "";
    try {
      await session.withTransaction(async () => {
        const user = await User.findOne({
          _id: userId,
          role: "USER",
          status: "ACTIVE",
        }).session(session);
        if (!user) throw new AppError(404, "Active user not found");

        let holding = await Holding.findOne({ item: itemId, user: userId }).session(
          session,
        );
        if (holding && holding.purpose !== purpose) {
          throw new AppError(
            400,
            "This person already holds the item for another purpose. Edit that assignment first.",
          );
        }

        const itemFilter: Record<string, unknown> = {
          _id: itemId,
          status: "ACTIVE",
          $expr: unallocatedStockExpression(quantity),
        };
        if (purpose === "USE") {
          itemFilter.availableQuantity = { $gte: quantity };
        }

        const item = await Item.findOneAndUpdate(
          itemFilter,
          {
            $inc:
              purpose === "USE"
                ? { availableQuantity: -quantity, assignedQuantity: quantity }
                : { storedQuantity: quantity },
          },
          { returnDocument: "after", session },
        );
        if (!item) {
          throw new AppError(
            400,
            "Not enough unallocated stock. Reduce or transfer an existing assignment first.",
          );
        }

        const previousQuantity = holding?.quantity ?? 0;
        const previousLocation = holding?.location;

        if (holding) {
          holding.quantity += quantity;
          holding.location = String(location).trim();
          holding.purpose = purpose;
          holding.assignedBy = new mongoose.Types.ObjectId(req.user!.id);
          await holding.save({ session });
        } else {
          [holding] = await Holding.create(
            [
              {
                item: itemId,
                user: userId,
                quantity,
                location: String(location).trim(),
                purpose,
                assignedBy: req.user!.id,
              },
            ],
            { session },
          );
        }
        holdingId = holding._id.toString();

        await StockMovement.create(
          [
            {
              type: purpose === "STORE" ? "STORE" : "OUT",
              item: itemId,
              user: userId,
              quantity,
              location: String(location).trim(),
              fromLocation: previousLocation,
              purpose,
              fromPurpose: purpose,
              toPurpose: purpose,
              previousQuantity,
              newQuantity: previousQuantity + quantity,
              note,
              performedBy: req.user!.id,
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    const holding = await Holding.findById(holdingId).populate(
      "user",
      "name email",
    );
    res.status(201).json({ success: true, data: holding });
  }),
);

stockRoutes.post(
  "/in",
  asyncHandler(async (req, res) => {
    const { holdingId, note } = req.body;
    const quantity = positiveInteger(req.body.quantity, "Quantity");
    if (!holdingId) throw new AppError(400, "Holding is required");

    const session = await mongoose.startSession();
    let remainingQuantity = 0;
    try {
      await session.withTransaction(async () => {
        const holding = await Holding.findById(holdingId).session(session);
        if (!holding) throw new AppError(404, "Assigned item not found");
        if (quantity > holding.quantity) {
          throw new AppError(400, "IN quantity cannot exceed assigned quantity");
        }

        remainingQuantity = holding.quantity - quantity;
        const location = String(req.body.location ?? holding.location).trim();
        if (!location) throw new AppError(400, "Location is required");
        await applyHoldingChange({
          holding,
          newQuantity: remainingQuantity,
          newPurpose: holding.purpose ?? "USE",
          location,
          note,
          performedBy: req.user!.id,
          session,
          forcedType: "IN",
        });
      });
    } finally {
      await session.endSession();
    }

    res.json({ success: true, data: { holdingId, remainingQuantity } });
  }),
);

stockRoutes.patch(
  "/holdings/:id",
  asyncHandler(async (req, res) => {
    const newQuantity = Number(req.body.quantity);
    if (!Number.isInteger(newQuantity) || newQuantity < 0) {
      throw new AppError(400, "Quantity must be a whole number of zero or more");
    }

    const session = await mongoose.startSession();
    let savedHoldingId: string | null = null;
    try {
      await session.withTransaction(async () => {
        const holding = await Holding.findById(req.params.id).session(session);
        if (!holding) throw new AppError(404, "Assigned item not found");

        const location = String(req.body.location ?? holding.location).trim();
        if (!location) throw new AppError(400, "Location is required");
        const purpose = assignmentPurpose(req.body.purpose, holding.purpose ?? "USE");

        savedHoldingId = await applyHoldingChange({
          holding,
          newQuantity,
          newPurpose: purpose,
          location,
          note: req.body.note,
          performedBy: req.user!.id,
          session,
        });
      });
    } finally {
      await session.endSession();
    }

    const holding = savedHoldingId
      ? await Holding.findById(savedHoldingId).populate("user", "name email")
      : null;
    res.json({ success: true, data: holding });
  }),
);

stockRoutes.delete(
  "/holdings/:id",
  asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    let returnedQuantity = 0;
    let purpose: AssignmentPurpose = "USE";
    try {
      await session.withTransaction(async () => {
        const holding = await Holding.findById(req.params.id).session(session);
        if (!holding) throw new AppError(404, "Assigned person entry not found");

        returnedQuantity = holding.quantity;
        purpose = holding.purpose ?? "USE";
        await Item.findByIdAndUpdate(
          holding.item,
          {
            $inc:
              purpose === "USE"
                ? {
                    availableQuantity: returnedQuantity,
                    assignedQuantity: -returnedQuantity,
                  }
                : { storedQuantity: -returnedQuantity },
          },
          { session },
        );

        await StockMovement.create(
          [
            {
              type: "DELETE",
              item: holding.item,
              user: holding.user,
              quantity: returnedQuantity,
              location: holding.location,
              purpose,
              fromPurpose: purpose,
              previousQuantity: returnedQuantity,
              newQuantity: 0,
              note: String(req.body?.note ?? "Assignment removed").trim(),
              performedBy: req.user!.id,
            },
          ],
          { session },
        );

        await holding.deleteOne({ session });
      });
    } finally {
      await session.endSession();
    }

    res.json({
      success: true,
      data: {
        holdingId: req.params.id,
        returnedQuantity,
        purpose,
        availableChange: purpose === "USE" ? returnedQuantity : 0,
      },
    });
  }),
);

stockRoutes.post(
  "/transfer",
  asyncHandler(async (req, res) => {
    const { holdingId, toUserId, location, note } = req.body;
    const quantity = positiveInteger(req.body.quantity, "Quantity");
    if (!holdingId || !toUserId || !String(location ?? "").trim()) {
      throw new AppError(400, "Holding, receiving user, and location are required");
    }

    const session = await mongoose.startSession();
    let destinationId = "";
    try {
      await session.withTransaction(async () => {
        const source = await Holding.findById(holdingId).session(session);
        if (!source) throw new AppError(404, "Source assignment not found");
        if (source.user.toString() === toUserId) {
          throw new AppError(400, "Choose a different receiving user");
        }
        if (quantity > source.quantity) {
          throw new AppError(400, "Transfer quantity exceeds assigned quantity");
        }

        const destinationUser = await User.findOne({
          _id: toUserId,
          role: "USER",
          status: "ACTIVE",
        }).session(session);
        if (!destinationUser) {
          throw new AppError(404, "Receiving user is not active");
        }

        const sourcePurpose = source.purpose ?? "USE";
        const destinationPurpose = assignmentPurpose(req.body.purpose, sourcePurpose);
        const sourceLocation = source.location;
        const sourcePreviousQuantity = source.quantity;
        const sourceRemaining = source.quantity - quantity;

        let destination = await Holding.findOne({
          item: source.item,
          user: toUserId,
        }).session(session);
        if (destination && destination.purpose !== destinationPurpose) {
          throw new AppError(
            400,
            "The receiving person already holds this item for another purpose.",
          );
        }

        const useDifference =
          (destinationPurpose === "USE" ? quantity : 0) -
          (sourcePurpose === "USE" ? quantity : 0);
        const storeDifference =
          (destinationPurpose === "STORE" ? quantity : 0) -
          (sourcePurpose === "STORE" ? quantity : 0);
        const itemFilter: Record<string, unknown> = { _id: source.item };
        if (useDifference > 0) {
          itemFilter.availableQuantity = { $gte: useDifference };
        }
        const item = await Item.findOneAndUpdate(
          itemFilter,
          {
            $inc: {
              availableQuantity: -useDifference,
              assignedQuantity: useDifference,
              storedQuantity: storeDifference,
            },
          },
          { session, returnDocument: "after" },
        );
        if (!item) throw new AppError(400, "Not enough available stock");

        if (sourceRemaining === 0) {
          await source.deleteOne({ session });
        } else {
          source.quantity = sourceRemaining;
          await source.save({ session });
        }

        if (destination) {
          destination.quantity += quantity;
          destination.location = String(location).trim();
          destination.purpose = destinationPurpose;
          destination.assignedBy = new mongoose.Types.ObjectId(req.user!.id);
          await destination.save({ session });
        } else {
          [destination] = await Holding.create(
            [
              {
                item: source.item,
                user: toUserId,
                quantity,
                location: String(location).trim(),
                purpose: destinationPurpose,
                assignedBy: req.user!.id,
              },
            ],
            { session },
          );
        }
        destinationId = destination._id.toString();

        await StockMovement.create(
          [
            {
              type: "TRANSFER",
              item: source.item,
              quantity,
              fromUser: source.user,
              toUser: toUserId,
              fromLocation: sourceLocation,
              toLocation: String(location).trim(),
              purpose: destinationPurpose,
              fromPurpose: sourcePurpose,
              toPurpose: destinationPurpose,
              previousQuantity: sourcePreviousQuantity,
              newQuantity: sourceRemaining,
              note,
              performedBy: req.user!.id,
            },
          ],
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    const destination = await Holding.findById(destinationId).populate(
      "user",
      "name email",
    );
    res.json({ success: true, data: destination });
  }),
);
