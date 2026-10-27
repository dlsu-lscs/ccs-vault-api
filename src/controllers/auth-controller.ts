import { Request, Response } from "express";
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  parseSessionTokenFromCookie,
  setSessionCookie,
} from "../services/session-service.js";
import { getOrCreateUserFromGoogle } from "../services/user-service.js";

export async function signIn(req: Request, res: Response): Promise<void> {
  const { email, name } = req.body ?? {};
  const google_sub = req.body?.google_sub ?? req.body?.googleSub;

  if (!google_sub || !email || !name) {
    res.status(400).json({
      error: {
        code: "BAD_REQUEST",
        message: "google_sub, email, and name are required",
      },
    });
    return;
  }

  try {
    const user = await getOrCreateUserFromGoogle({
      google_sub,
      email,
      name,
    });

    const { rawToken } = await createSession(user.id);
    setSessionCookie(res, rawToken);

    res.status(200).json({
      user,
      message: "Signed in successfully",
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid profile:")) {
      res.status(400).json({
        error: {
          code: "BAD_REQUEST",
          message: error.message,
        },
      });
      return;
    }

    console.error("Sign-in failed:", error);
    res.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to sign in",
      },
    });
  }
}

export async function signOut(req: Request, res: Response): Promise<void> {
  const token = parseSessionTokenFromCookie(req.headers.cookie);

  let deleteError: unknown = null;
  try {
    if (token) {
      await deleteSession(token);
    }
  } catch (error) {
    deleteError = error;
  } finally {
    clearSessionCookie(res);
  }

  if (deleteError) {
    console.error("Failed to delete session during sign out:", deleteError);
    res.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to sign out",
      },
    });
    return;
  }

  res.status(200).json({
    message: "Signed out successfully",
  });
}

export async function getCurrentUser(req: Request, res: Response): Promise<void> {
  res.status(200).json({
    user: req.user,
  });
}
