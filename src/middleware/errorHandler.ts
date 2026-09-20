import { ErrorRequestHandler, RequestHandler } from "express";
import { AppError } from "../utils/AppError";

export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError(404, `Route not found: ${req.method} ${req.path}`));
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  let statusCode = error instanceof AppError ? error.statusCode : 500;
  let message = error instanceof Error ? error.message : "Something went wrong";

  if (error?.name === "ValidationError" || error?.name === "CastError") {
    statusCode = 400;
  }

  if (error?.code === 11000) {
    statusCode = 409;
    message = "A record with that value already exists";
  }

  if (error?.name === "JsonWebTokenError" || error?.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Your session is invalid or expired";
  }

  res.status(statusCode).json({ success: false, message });
};
