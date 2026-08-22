import jwt from "jsonwebtoken";
import "dotenv/config";

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error("JWT_SECRET is not set");

export const signToken = (userId) =>
  jwt.sign({ sub: userId }, SECRET, { expiresIn: "7d" });

export const verifyToken = (token) => jwt.verify(token, SECRET);
