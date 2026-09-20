import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { User } from "../modules/users/user.model";
import { AppError } from "../utils/AppError";
import { asyncHandler } from "../utils/asyncHandler";

type TokenPayload = {
  id: string;
  email: string;
  role: "ADMIN" | "USER";
};

function readCookie(req: Request, name: string) {
  const cookies = req.headers.cookie?.split(";") ?? [];
  for (const cookie of cookies) {
    const [key, ...value] = cookie.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

export const authenticate = asyncHandler(async (req, _res, next) => {
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : undefined;
  const token = readCookie(req, config.cookieName) ?? bearer;

  if (!token) throw new AppError(401, "Please log in");

  const payload = jwt.verify(token, config.jwtSecret) as TokenPayload;
  const user = await User.findById(payload.id).lean();

  if (!user || user.status !== "ACTIVE") {
    throw new AppError(401, "Your account is not active");
  }

  req.user = { id: user._id.toString(), email: user.email, role: user.role };
  next();
});

export function requireRole(...roles: Array<"ADMIN" | "USER">) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError(403, "You do not have permission"));
    }
    next();
  };
}
