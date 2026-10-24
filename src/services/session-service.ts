import crypto from "node:crypto";
import { CookieOptions, Response } from "express";
import { Session, SessionWithUser } from "../models/session.js";
import * as sessionRepository from "../repositories/session-repository.js";

export const SESSION_COOKIE_NAME = "vault_session";
export const SESSION_DURATION_DAYS = 30;
export const SESSION_DURATION_MS = SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;

export const SESSION_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_DURATION_MS,
};

export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function createSession(
  userId: string
): Promise<{ session: Session; rawToken: string }> {
  const rawToken = generateSessionToken();
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  const session = await sessionRepository.createSession({
    id: tokenHash,
    user_id: userId,
    expires_at: expiresAt,
  });

  return { session, rawToken };
}

export async function validateSession(
  rawToken: string
): Promise<SessionWithUser | null> {
  if (!rawToken || typeof rawToken !== "string") {
    return null;
  }

  const tokenHash = hashSessionToken(rawToken);
  const sessionWithUser = await sessionRepository.findSessionWithUserById(tokenHash);

  if (!sessionWithUser) {
    return null;
  }

  if (new Date(sessionWithUser.expires_at).getTime() <= Date.now()) {
    await sessionRepository.deleteSessionById(tokenHash);
    return null;
  }

  return sessionWithUser;
}

export async function deleteSession(rawToken: string): Promise<boolean> {
  if (!rawToken || typeof rawToken !== "string") {
    return false;
  }

  const tokenHash = hashSessionToken(rawToken);
  return sessionRepository.deleteSessionById(tokenHash);
}

export async function cleanupExpiredSessions(): Promise<number> {
  return sessionRepository.deleteExpiredSessions();
}

export function setSessionCookie(res: Response, rawToken: string): void {
  res.cookie(SESSION_COOKIE_NAME, rawToken, SESSION_COOKIE_OPTIONS);
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: SESSION_COOKIE_OPTIONS.httpOnly,
    secure: SESSION_COOKIE_OPTIONS.secure,
    sameSite: SESSION_COOKIE_OPTIONS.sameSite,
    path: SESSION_COOKIE_OPTIONS.path,
  });
}

export function parseSessionTokenFromCookie(
  cookieHeader: string | undefined
): string | null {
  if (!cookieHeader) {
    return null;
  }

  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]*)`)
  );

  return match ? decodeURIComponent(match[1]) : null;
}

export function startSessionCleanupJob(
  intervalMs = 60 * 60 * 1000
): NodeJS.Timeout {
  const timer = setInterval(async () => {
    try {
      const deletedCount = await cleanupExpiredSessions();
      if (deletedCount > 0) {
        console.log(`Cleaned up ${deletedCount} expired session(s).`);
      }
    } catch (error) {
      console.error("Failed to clean up expired sessions:", error);
    }
  }, intervalMs);

  timer.unref();
  return timer;
}
