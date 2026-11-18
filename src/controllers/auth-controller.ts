import { Request, Response } from "express";
import { verifyGoogleIdToken } from "../services/google-auth-service.js";
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
import { DuplicateEmailError } from "../repositories/user-repository.js";
import { toPublicUser } from "../models/user.js";
import { BadRequestError, ConflictError } from "../utils/errors.js";

export async function signIn(req: Request, res: Response): Promise<void> {
  const idToken = req.body?.idToken ?? req.body?.id_token;

  if (!idToken || typeof idToken !== "string" || !idToken.trim()) {
    throw new BadRequestError("idToken is required");
  }

  const verifiedProfile = await verifyGoogleIdToken(idToken.trim());

  let isNewUser: boolean;
  let userId: string;
  try {
    const existingUser = await getUserByGoogleSub(verifiedProfile.google_sub);
    isNewUser = !existingUser;

    const user = await getOrCreateUserFromGoogle({
      google_sub: verifiedProfile.google_sub,
      email: verifiedProfile.email,
      name: verifiedProfile.name,
    });
    userId = user.id;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid profile:")) {
      throw new BadRequestError(error.message, { cause: error });
    }

    if (error instanceof DuplicateEmailError) {
      throw new ConflictError(error.message, { cause: error });
    }

    throw error;
  }

  const { rawToken } = await createSession(userId);
  setSessionCookie(res, rawToken);

  res.status(isNewUser ? 201 : 200).json({
    message: "Signed in successfully",
  });
}

export async function signOut(req: Request, res: Response): Promise<void> {
  const token = parseSessionTokenFromCookie(req.headers.cookie);

  try {
    if (token) {
      await deleteSession(token);
    }
  } finally {
    clearSessionCookie(res);
  }

  res.status(200).json({
    message: "Signed out successfully",
  });
}

export async function getCurrentUser(req: Request, res: Response): Promise<void> {
  res.status(200).json({
    user: req.user ? toPublicUser(req.user) : undefined,
  });
}
