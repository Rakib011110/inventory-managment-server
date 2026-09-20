import { config } from "./index";
import { User } from "../modules/users/user.model";

export async function seedAdmin() {
  if (!config.adminEmail || !config.adminPassword) return;
  const existing = await User.findOne({
    email: config.adminEmail.toLowerCase(),
  });
  if (!existing) {
    await User.create({
      name: config.adminName,
      email: config.adminEmail,
      password: config.adminPassword,
      role: "ADMIN",
      status: "ACTIVE",
    });
    console.log(`Created initial Admin: ${config.adminEmail}`);
  }
}
