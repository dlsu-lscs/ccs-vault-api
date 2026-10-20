import { Request, Response } from "express";
import {
  clearSessionCookie,
  deleteSession,
  parseSessionTokenFromCookie,
} from "../services/session-service.js";

export async function signOut(req: Request, res: Response): Promise<void> {
  const token = parseSessionTokenFromCookie(req.headers.cookie);

  if (token) {
    await deleteSession(token);
  }

  clearSessionCookie(res);

  res.status(200).json({
    message: "Signed out successfully",
  });
}
