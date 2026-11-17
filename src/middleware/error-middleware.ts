import { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/errors.js";

interface HttpErrorPayload {
  statusCode: number;
  code: string;
  message: string;
}

const BODY_PARSER_ERROR_MAP: Record<string, HttpErrorPayload> = {
  "entity.parse.failed": {
    statusCode: 400,
    code: "BAD_REQUEST",
    message: "Invalid JSON payload",
  },
  "entity.too.large": {
    statusCode: 413,
    code: "PAYLOAD_TOO_LARGE",
    message: "Request payload is too large",
  },
  "encoding.unsupported": {
    statusCode: 415,
    code: "UNSUPPORTED_MEDIA_TYPE",
    message: "Unsupported content encoding",
  },
  "charset.unsupported": {
    statusCode: 415,
    code: "UNSUPPORTED_MEDIA_TYPE",
    message: "Unsupported charset",
  },
  "request.aborted": {
    statusCode: 400,
    code: "BAD_REQUEST",
    message: "Request was aborted",
  },
};

function getBodyParserErrorPayload(err: unknown): HttpErrorPayload | null {
  if (typeof err === "object" && err !== null && "type" in err) {
    const errorType = (err as { type?: unknown }).type;
    if (typeof errorType === "string" && errorType in BODY_PARSER_ERROR_MAP) {
      return BODY_PARSER_ERROR_MAP[errorType];
    }
  }

  if (err instanceof SyntaxError && "body" in err) {
    return BODY_PARSER_ERROR_MAP["entity.parse.failed"];
  }

  return null;
}

/**
 * Fallback middleware for unmatched routes so 404 responses stay in JSON format.
 */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Route not found",
    },
  });
}

/**
 * Centralized Express error-handling middleware.
 * Ensures all errors return structured JSON without exposing stack traces,
 * file paths, or internal configuration details to clients.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof AppError) {
    if (!err.expose || err.statusCode >= 500) {
      console.error(`[${req.method} ${req.path}] ${err.name}:`, err);
    }

    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.expose ? err.message : err.clientMessage,
      },
    });
    return;
  }

  const bodyParserPayload = getBodyParserErrorPayload(err);
  if (bodyParserPayload) {
    res.status(bodyParserPayload.statusCode).json({
      error: {
        code: bodyParserPayload.code,
        message: bodyParserPayload.message,
      },
    });
    return;
  }

  console.error(`[${req.method} ${req.path}] Unhandled error:`, err);
  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
    },
  });
}
