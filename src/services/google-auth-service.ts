import {
  AppError,
  ConfigurationError,
  InvalidGoogleTokenError,
  ServiceUnavailableError,
} from "../utils/errors.js";

export interface VerifiedGoogleUser {
  google_sub: string;
  email: string;
  name: string;
  email_verified: boolean;
  hd?: string;
}

export const GOOGLE_TOKENINFO_TIMEOUT_MS = 5000;

type TokenVerifier = (idToken: string) => Promise<VerifiedGoogleUser>;

let customVerifier: TokenVerifier | null = null;

export function setGoogleTokenVerifier(verifier: TokenVerifier | null): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("setGoogleTokenVerifier must not be called in production");
  }
  customVerifier = verifier;
}

const ALLOWED_HD = "dlsu.edu.ph";
const AUTH_UNAVAILABLE_MESSAGE = "Authentication service is temporarily unavailable";

interface GoogleTokenPayload {
  sub?: string;
  email?: string;
  name?: string;
  aud?: string;
  iss?: string;
  exp?: string | number;
  email_verified?: string | boolean;
  hd?: string;
}

function assertDlsuAccount(emailVerified: boolean | string, hd?: string): void {
  if (emailVerified !== true && emailVerified !== "true") {
    throw new InvalidGoogleTokenError("Google account email is not verified");
  }
  if (hd !== ALLOWED_HD) {
    throw new InvalidGoogleTokenError(
      "Sign-in is restricted to DLSU accounts (@dlsu.edu.ph)"
    );
  }
}

function validateTokenPayload(
  payload: GoogleTokenPayload,
  options: { clientId?: string; strict: boolean }
): VerifiedGoogleUser {
  if (options.strict) {
    if (payload.aud !== options.clientId) {
      throw new InvalidGoogleTokenError(
        "Google ID token audience does not match GOOGLE_CLIENT_ID"
      );
    }
    if (
      payload.iss !== "accounts.google.com" &&
      payload.iss !== "https://accounts.google.com"
    ) {
      throw new InvalidGoogleTokenError("Google ID token issuer is invalid");
    }
  } else {
    if (options.clientId && payload.aud && payload.aud !== options.clientId) {
      throw new InvalidGoogleTokenError(
        "Google ID token audience does not match GOOGLE_CLIENT_ID"
      );
    }
    if (
      payload.iss &&
      payload.iss !== "accounts.google.com" &&
      payload.iss !== "https://accounts.google.com"
    ) {
      throw new InvalidGoogleTokenError("Google ID token issuer is invalid");
    }
  }

  if (payload.exp && Number(payload.exp) * 1000 < Date.now()) {
    throw new InvalidGoogleTokenError("Google ID token has expired");
  }

  if (!payload.sub || !payload.email) {
    throw new InvalidGoogleTokenError(
      "Google ID token missing required claims (sub or email)"
    );
  }

  assertDlsuAccount(payload.email_verified ?? false, payload.hd);

  return {
    google_sub: payload.sub,
    email: payload.email,
    name: payload.name || payload.email.split("@")[0],
    email_verified:
      payload.email_verified === true || payload.email_verified === "true",
    hd: payload.hd,
  };
}

function isAbortOrTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

export async function verifyGoogleIdToken(
  idToken: string
): Promise<VerifiedGoogleUser> {
  if (!idToken || typeof idToken !== "string" || !idToken.trim()) {
    throw new InvalidGoogleTokenError("Google ID token is required");
  }

  const token = idToken.trim();

  if (customVerifier) {
    try {
      return await customVerifier(token);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new InvalidGoogleTokenError(
        error instanceof Error ? error.message : "Invalid Google ID token",
        { cause: error }
      );
    }
  }

  // Support offline verification in test environments
  if (process.env.NODE_ENV === "test") {
    if (token === "invalid-token" || token === "invalid") {
      throw new InvalidGoogleTokenError("Invalid Google ID token");
    }

    if (token.startsWith("test-token:")) {
      const parts = token.split(":");
      const [, sub, email, name] = parts;
      if (!sub || !email) {
        throw new InvalidGoogleTokenError("Invalid test token format");
      }
      return {
        google_sub: sub,
        email,
        name: name || email.split("@")[0],
        email_verified: true,
        hd: email.split("@")[1],
      };
    }

    const jwtParts = token.split(".");
    if (jwtParts.length === 3) {
      let payload: GoogleTokenPayload;
      try {
        const payloadJson = Buffer.from(jwtParts[1], "base64url").toString("utf8");
        payload = JSON.parse(payloadJson) as GoogleTokenPayload;
      } catch {
        throw new InvalidGoogleTokenError("Invalid Google ID token");
      }

      return validateTokenPayload(payload, {
        clientId: process.env.GOOGLE_CLIENT_ID,
        strict: false,
      });
    }

    throw new InvalidGoogleTokenError("Invalid Google ID token");
  }

  const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!googleClientId) {
    throw new ConfigurationError(
      "GOOGLE_CLIENT_ID environment variable is not configured",
      AUTH_UNAVAILABLE_MESSAGE
    );
  }

  let response: Response;
  try {
    response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`,
      {
        signal: AbortSignal.timeout(GOOGLE_TOKENINFO_TIMEOUT_MS),
      }
    );
  } catch (error) {
    throw new ServiceUnavailableError(
      isAbortOrTimeoutError(error)
        ? `Google token verification timed out after ${GOOGLE_TOKENINFO_TIMEOUT_MS}ms`
        : "Failed to reach Google token verification service",
      {
        clientMessage: AUTH_UNAVAILABLE_MESSAGE,
        cause: error,
      }
    );
  }

  if (typeof response.status === "number" && response.status >= 500) {
    throw new ServiceUnavailableError(
      `Google tokeninfo service returned status ${response.status}`,
      {
        clientMessage: AUTH_UNAVAILABLE_MESSAGE,
      }
    );
  }

  if (!response.ok) {
    throw new InvalidGoogleTokenError("Invalid or expired Google ID token");
  }

  let payload: GoogleTokenPayload;
  try {
    payload = (await response.json()) as GoogleTokenPayload;
  } catch (error) {
    throw new ServiceUnavailableError(
      isAbortOrTimeoutError(error)
        ? `Google token verification response timed out after ${GOOGLE_TOKENINFO_TIMEOUT_MS}ms`
        : "Google tokeninfo returned an invalid JSON payload",
      {
        clientMessage: AUTH_UNAVAILABLE_MESSAGE,
        cause: error,
      }
    );
  }

  return validateTokenPayload(payload, {
    clientId: googleClientId,
    strict: true,
  });
}
