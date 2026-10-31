import { Request, Response } from "express";
import {
  verifyGoogleIdToken,
  VerifiedGoogleUser,
} from "../services/google-auth-service.js";
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  parseSessionTokenFromCookie,
  setSessionCookie,
} from "../services/session-service.js";
import {
  getOrCreateUserFromGoogle,
  getUserByGoogleSub,
} from "../services/user-service.js";

export async function signIn(req: Request, res: Response): Promise<void> {
  const idToken = req.body?.idToken ?? req.body?.id_token;

  if (!idToken || typeof idToken !== "string" || !idToken.trim()) {
    res.status(400).json({
      error: {
        code: "BAD_REQUEST",
        message: "idToken is required",
      },
    });
    return;
  }

  let verifiedProfile: VerifiedGoogleUser;
  try {
    verifiedProfile = await verifyGoogleIdToken(idToken.trim());
  } catch (error) {
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message:
          error instanceof Error ? error.message : "Invalid Google ID token",
      },
    });
    return;
  }

  try {
    const existingUser = await getUserByGoogleSub(verifiedProfile.google_sub);
    const isNewUser = !existingUser;

    const user = await getOrCreateUserFromGoogle({
      google_sub: verifiedProfile.google_sub,
      email: verifiedProfile.email,
      name: verifiedProfile.name,
    });

    const { rawToken } = await createSession(user.id);
    setSessionCookie(res, rawToken);

    res.status(isNewUser ? 201 : 200).json({
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
