import bcrypt from "bcryptjs";
import { HydratedDocument, Model, Schema, model } from "mongoose";

export type UserRole = "ADMIN" | "USER";
export type UserStatus = "ACTIVE" | "INACTIVE";

export interface IUser {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface UserMethods {
  comparePassword(password: string): Promise<boolean>;
}

type UserModel = Model<IUser, object, UserMethods>;

const userSchema = new Schema<IUser, UserModel, UserMethods>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, minlength: 6, select: false },
    phone: { type: String, trim: true },
    role: { type: String, enum: ["ADMIN", "USER"], default: "USER" },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_document, returnedObject) => {
        delete (returnedObject as Record<string, unknown>).password;
      },
    },
  },
);

userSchema.pre("save", async function () {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
  }
});

userSchema.methods.comparePassword = function (password: string) {
  return bcrypt.compare(password, this.password);
};

export type UserDocument = HydratedDocument<IUser, UserMethods>;
export const User = model<IUser, UserModel>("User", userSchema);
