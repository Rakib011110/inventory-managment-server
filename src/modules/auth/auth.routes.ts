import { Router } from "express";
import jwt from "jsonwebtoken";
import { config } from "../../config";
import { authenticate } from "../../middleware/auth";
import { AppError } from "../../utils/AppError";
import { asyncHandler } from "../../utils/asyncHandler";
import { User } from "../users/user.model";

export const authRoutes = Router();

authRoutes.post(
  "/login",
  asyncHandler(async (req, res) => {
    const email = String(req.body.email ?? "").toLowerCase().trim();
    const password = String(req.body.password ?? "");
    const user = await User.findOne({ email }).select("+password");

    if (!user || !(await user.comparePassword(password))) {
      throw new AppError(401, "Email or password is incorrect");
    }
    if (user.status !== "ACTIVE") {
      throw new AppError(403, "Account is inactive");
    }

    const token = jwt.sign(
      { id: user._id.toString(), email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: "7d" },
    );

    res.cookie(config.cookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.cookieSecure,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });
    res.json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
      },
    });
  }),
);

authRoutes.post("/logout", (_req, res) => {
  res.clearCookie(config.cookieName, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    path: "/",
  });
  res.json({ success: true, data: null });
});

authRoutes.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user!.id).lean();
    res.json({ success: true, data: user });
  }),
);
