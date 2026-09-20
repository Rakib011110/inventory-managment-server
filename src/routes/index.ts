import { Router } from "express";
import { authRoutes } from "../modules/auth/auth.routes";
import { dashboardRoutes } from "../modules/dashboard/dashboard.routes";
import { itemRoutes } from "../modules/items/item.routes";
import { stockRoutes } from "../modules/stock/stock.routes";
import { systemRoutes } from "../modules/system/system.routes";
import { userRoutes } from "../modules/users/user.routes";

export const apiRoutes = Router();

apiRoutes.use("/auth", authRoutes);
apiRoutes.use("/users", userRoutes);
apiRoutes.use("/items", itemRoutes);
apiRoutes.use("/stock", stockRoutes);
apiRoutes.use("/dashboard", dashboardRoutes);
apiRoutes.use("/system", systemRoutes);
