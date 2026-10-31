export interface VerifiedGoogleUser {
  google_sub: string;
  email: string;
  name: string;
}

type TokenVerifier = (idToken: string) => Promise<VerifiedGoogleUser>;

let customVerifier: TokenVerifier | null = null;

export function setGoogleTokenVerifier(verifier: TokenVerifier | null): void {
  customVerifier = verifier;
}

export async function verifyGoogleIdToken(
  idToken: string
): Promise<VerifiedGoogleUser> {
  if (!idToken || typeof idToken !== "string" || !idToken.trim()) {
    throw new Error("Google ID token is required");
  }

  const token = idToken.trim();

  if (customVerifier) {
    return customVerifier(token);
  }

  // Support offline verification in test environments
  if (process.env.NODE_ENV === "test") {
    if (token === "invalid-token" || token === "invalid") {
      throw new Error("Invalid Google ID token");
    }

    if (token.startsWith("test-token:")) {
      const parts = token.split(":");
      const [, sub, email, name] = parts;
      if (!sub || !email) {
        throw new Error("Invalid test token format");
      }
      return {
        google_sub: sub,
        email,
        name: name || email.split("@")[0],
      };
    }

    const jwtParts = token.split(".");
    if (jwtParts.length === 3) {
      try {
        const payloadJson = Buffer.from(jwtParts[1], "base64url").toString("utf8");
        const payload = JSON.parse(payloadJson);

        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (clientId && payload.aud && payload.aud !== clientId) {
          throw new Error("Google ID token audience does not match GOOGLE_CLIENT_ID");
        }

        if (
          payload.iss &&
          payload.iss !== "accounts.google.com" &&
          payload.iss !== "https://accounts.google.com"
        ) {
          throw new Error("Google ID token issuer is invalid");
        }

        if (payload.exp && Number(payload.exp) * 1000 < Date.now()) {
          throw new Error("Google ID token has expired");
        }

        if (!payload.sub || !payload.email) {
          throw new Error("Google ID token missing required claims (sub or email)");
        }

        return {
          google_sub: payload.sub,
          email: payload.email,
          name: payload.name || payload.email.split("@")[0],
        };
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("Google ID token")) {
          throw err;
        }
        throw new Error("Invalid Google ID token");
      }
    }

    throw new Error("Invalid Google ID token");
  }

  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  if (!googleClientId) {
    throw new Error("GOOGLE_CLIENT_ID environment variable is not configured");
  }

  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`
  );

  if (!response.ok) {
    throw new Error("Invalid or expired Google ID token");
  }

  const payload = (await response.json()) as {
    sub?: string;
    email?: string;
    name?: string;
    aud?: string;
    iss?: string;
    exp?: string | number;
    email_verified?: string | boolean;
  };

  if (payload.aud !== googleClientId) {
    throw new Error("Google ID token audience does not match GOOGLE_CLIENT_ID");
  }

  if (
    payload.iss !== "accounts.google.com" &&
    payload.iss !== "https://accounts.google.com"
  ) {
    throw new Error("Google ID token issuer is invalid");
  }

  if (payload.exp && Number(payload.exp) * 1000 < Date.now()) {
    throw new Error("Google ID token has expired");
  }

  if (!payload.sub || !payload.email) {
    throw new Error("Google ID token missing required claims (sub or email)");
  }

  return {
    google_sub: payload.sub,
    email: payload.email,
    name: payload.name || payload.email.split("@")[0],
  };
}
