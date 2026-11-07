import { NextFunction, Request, Response } from "express";
import { User } from "../models/user.js";
import {
  parseSessionTokenFromCookie,
  validateSession,
} from "../services/session-service.js";

declare global {
  namespace Express {
    interface Request {
      user?: User;
      sessionId?: string;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = parseSessionTokenFromCookie(req.headers.cookie);

  if (!token) {
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    });
    return;
  }

  const sessionWithUser = await validateSession(token);

  if (!sessionWithUser) {
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid or expired session",
      },
    });
    return;
  }

  req.user = sessionWithUser.user;
  req.sessionId = sessionWithUser.id;
  next();
}
