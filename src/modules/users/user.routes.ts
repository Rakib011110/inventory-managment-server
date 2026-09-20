import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth";
import { AppError } from "../../utils/AppError";
import { asyncHandler } from "../../utils/asyncHandler";
import { Holding } from "../stock/holding.model";
import { User } from "./user.model";

export const userRoutes = Router();

userRoutes.use(authenticate, requireRole("ADMIN"));

userRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    const search = String(req.query.search ?? "").trim();
    const filter = search
      ? {
          $or: [
            { name: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
          ],
        }
      : {};
    const users = await User.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: users });
  }),
);

userRoutes.post(
  "/",
  asyncHandler(async (req, res) => {
    const { name, email, password, phone, role = "USER" } = req.body;
    if (!name || !email || !password) {
      throw new AppError(400, "Name, email, and password are required");
    }
    const user = await User.create({ name, email, password, phone, role });
    res.status(201).json({ success: true, data: user });
  }),
);

userRoutes.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).lean();
    if (!user) throw new AppError(404, "User not found");
    const holdings = await Holding.find({ user: user._id })
      .populate("item", "name unitPrice location")
      .sort({ updatedAt: -1 })
      .lean();
    res.json({ success: true, data: { user, holdings } });
  }),
);

userRoutes.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).select("+password");
    if (!user) throw new AppError(404, "User not found");

    for (const key of ["name", "email", "phone", "role", "status"] as const) {
      if (req.body[key] !== undefined) {
        (user as unknown as Record<string, unknown>)[key] = req.body[key];
      }
    }
    if (req.body.password) user.password = req.body.password;
    await user.save();
    res.json({ success: true, data: user });
  }),
);

userRoutes.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (req.user?.id === req.params.id) {
      throw new AppError(400, "You cannot deactivate your own account");
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status: "INACTIVE" },
      { returnDocument: "after" },
    );
    if (!user) throw new AppError(404, "User not found");
    res.json({ success: true, data: user });
  }),
);
