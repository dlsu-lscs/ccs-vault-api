import assert from "node:assert/strict";
import http from "node:http";
import { AddressInfo } from "node:net";
import { after, afterEach, before, describe, it, mock } from "node:test";
import express from "express";
import app, { resolveTrustProxy } from "../src/app.js";
import { errorHandler, notFoundHandler } from "../src/middleware/error-middleware.js";
import { createTestServer } from "./helpers.js";

describe("App Configuration, Error Handling, and Proxy Rate Limiting", () => {
  const testServer = createTestServer();
  let baseUrl: string;

  before(async () => {
    baseUrl = await testServer.start();
  });

  after(async () => {
    await testServer.close();
  });

  afterEach(() => {
    mock.restoreAll();
  });

  describe("Trust proxy configuration", () => {
    it("defaults trust proxy to 1 hop for Dokploy/Traefik", () => {
      assert.strictEqual(resolveTrustProxy(undefined), 1);
      assert.strictEqual(resolveTrustProxy(""), 1);
      assert.strictEqual(resolveTrustProxy("  "), 1);
      assert.strictEqual(app.get("trust proxy"), 1);
    });

    it("parses explicit hop counts, false, and subnet strings", () => {
      assert.strictEqual(resolveTrustProxy("1"), 1);
      assert.strictEqual(resolveTrustProxy("2"), 2);
      assert.strictEqual(resolveTrustProxy("0"), false);
      assert.strictEqual(resolveTrustProxy("false"), false);
      assert.strictEqual(
        resolveTrustProxy("loopback, linklocal, uniquelocal"),
        "loopback, linklocal, uniquelocal"
      );
    });

    it("rejects permissive TRUST_PROXY=true", () => {
      assert.throws(() => resolveTrustProxy("true"), /must not be "true"/);
    });

    it("isolates sign-in rate-limit buckets per client IP via X-Forwarded-For", async () => {
      const clientA = "198.51.100.10";
      const clientB = "198.51.100.11";

      for (let i = 0; i < 10; i++) {
        const res = await fetch(`${baseUrl}/api/auth/sign-in`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Forwarded-For": clientA,
          },
          body: JSON.stringify({}),
        });
        assert.strictEqual(res.status, 400);
      }

      // 11th request for clientA should be rate-limited
      const blockedRes = await fetch(`${baseUrl}/api/auth/sign-in`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": clientA,
        },
        body: JSON.stringify({}),
      });
      assert.strictEqual(blockedRes.status, 429);
      const blockedBody = await blockedRes.json();
      assert.strictEqual(blockedBody.error.code, "TOO_MANY_REQUESTS");

      // Spoofing a leftmost IP cannot bypass 1-hop trust proxy
      const spoofRes = await fetch(`${baseUrl}/api/auth/sign-in`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": `203.0.113.99, ${clientA}`,
        },
        body: JSON.stringify({}),
      });
      assert.strictEqual(spoofRes.status, 429);

      // A different client IP keeps an independent rate-limit bucket
      const otherClientRes = await fetch(`${baseUrl}/api/auth/sign-in`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": clientB,
        },
        body: JSON.stringify({}),
      });
      assert.strictEqual(otherClientRes.status, 400);
    });
  });

  describe("Centralized JSON error handling", () => {
    it("returns structured JSON 400 on malformed JSON without HTML, stack traces, or paths", async () => {
      const res = await fetch(`${baseUrl}/api/auth/sign-in`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": "198.51.100.20",
        },
        body: "{ malformed json",
      });

      assert.strictEqual(res.status, 400);
      const contentType = res.headers.get("content-type") ?? "";
      assert.ok(contentType.includes("application/json"));

      const rawText = await res.text();
      assert.ok(!rawText.includes("<html"));
      assert.ok(!rawText.includes("<!DOCTYPE"));
      assert.ok(!rawText.includes("SyntaxError"));
      assert.ok(!rawText.includes("node_modules"));
      assert.ok(!rawText.includes("ccs-vault-api"));

      const body = JSON.parse(rawText);
      assert.deepStrictEqual(body, {
        error: {
          code: "BAD_REQUEST",
          message: "Invalid JSON payload",
        },
      });
    });

    it("returns structured JSON 404 for unknown routes", async () => {
      const res = await fetch(`${baseUrl}/api/does-not-exist`);

      assert.strictEqual(res.status, 404);
      const contentType = res.headers.get("content-type") ?? "";
      assert.ok(contentType.includes("application/json"));

      const body = await res.json();
      assert.deepStrictEqual(body, {
        error: {
          code: "NOT_FOUND",
          message: "Route not found",
        },
      });
    });

    it("logs unhandled async errors on the server and returns generic JSON 500", async () => {
      const consoleErrors: unknown[][] = [];
      mock.method(console, "error", (...args: unknown[]) => {
        consoleErrors.push(args);
      });

      const testApp = express();
      testApp.use(express.json());
      testApp.get("/boom", async () => {
        throw new Error("internal database secret at /app/src/db.ts");
      });
      testApp.use(notFoundHandler);
      testApp.use(errorHandler);

      const server = await new Promise<http.Server>((resolve) => {
        const s = testApp.listen(0, () => resolve(s));
      });
      const port = (server.address() as AddressInfo).port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/boom`);
        assert.strictEqual(res.status, 500);

        const rawText = await res.text();
        assert.ok(!rawText.includes("internal database secret"));
        assert.ok(!rawText.includes("/app/src/db.ts"));

        assert.deepStrictEqual(JSON.parse(rawText), {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "An unexpected error occurred",
          },
        });

        assert.ok(consoleErrors.length >= 1);
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((err) => (err ? reject(err) : resolve()))
        );
      }
    });
  });

  describe("Production configuration and upstream auth errors", () => {
    it("returns 503 with generic message and logs actual error when GOOGLE_CLIENT_ID is missing", async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalClientId = process.env.GOOGLE_CLIENT_ID;
      const consoleErrors: unknown[][] = [];

      mock.method(console, "error", (...args: unknown[]) => {
        consoleErrors.push(args);
      });

      process.env.NODE_ENV = "production";
      delete process.env.GOOGLE_CLIENT_ID;

      try {
        const res = await fetch(`${baseUrl}/api/auth/sign-in`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Forwarded-For": "198.51.100.30",
          },
          body: JSON.stringify({ idToken: "some-token" }),
        });

        assert.strictEqual(res.status, 503);
        const rawText = await res.text();
        assert.ok(!rawText.includes("GOOGLE_CLIENT_ID"));
        assert.ok(!rawText.includes("configured"));

        const body = JSON.parse(rawText);
        assert.strictEqual(body.error.code, "SERVICE_UNAVAILABLE");
        assert.strictEqual(
          body.error.message,
          "Authentication service is temporarily unavailable"
        );

        assert.strictEqual(consoleErrors.length, 1);
        const loggedError = consoleErrors[0][1];
        assert.ok(loggedError instanceof Error);
        assert.ok(loggedError.message.includes("GOOGLE_CLIENT_ID"));
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
        if (originalClientId === undefined) {
          delete process.env.GOOGLE_CLIENT_ID;
        } else {
          process.env.GOOGLE_CLIENT_ID = originalClientId;
        }
      }
    });

    it("returns 503 with generic message and logs error when Google tokeninfo times out", async () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalClientId = process.env.GOOGLE_CLIENT_ID;
      const originalFetch = globalThis.fetch;
      const consoleErrors: unknown[][] = [];

      mock.method(console, "error", (...args: unknown[]) => {
        consoleErrors.push(args);
      });

      mock.method(
        globalThis,
        "fetch",
        async (input: string | URL | Request, init?: RequestInit) => {
          const url = String(input);
          if (url.startsWith("https://oauth2.googleapis.com/")) {
            throw new DOMException(
              "The operation was aborted due to timeout",
              "TimeoutError"
            );
          }
          return originalFetch(input, init);
        }
      );

      process.env.NODE_ENV = "production";
      process.env.GOOGLE_CLIENT_ID = "test-prod-client-id";

      try {
        const res = await fetch(`${baseUrl}/api/auth/sign-in`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Forwarded-For": "198.51.100.31",
          },
          body: JSON.stringify({ idToken: "some-token" }),
        });

        assert.strictEqual(res.status, 503);
        const body = await res.json();
        assert.strictEqual(body.error.code, "SERVICE_UNAVAILABLE");
        assert.strictEqual(
          body.error.message,
          "Authentication service is temporarily unavailable"
        );

        assert.strictEqual(consoleErrors.length, 1);
        const loggedError = consoleErrors[0][1];
        assert.ok(loggedError instanceof Error);
        assert.ok(loggedError.message.includes("timed out"));
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
        if (originalClientId === undefined) {
          delete process.env.GOOGLE_CLIENT_ID;
        } else {
          process.env.GOOGLE_CLIENT_ID = originalClientId;
        }
      }
    });
  });
});
