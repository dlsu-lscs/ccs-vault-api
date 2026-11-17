export interface AppErrorOptions {
  statusCode: number;
  code: string;
  message: string;
  clientMessage?: string;
  expose?: boolean;
  cause?: unknown;
}

/**
 * Base application error carrying HTTP status, machine-readable error code,
 * and whether the internal message is safe to expose to clients.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly clientMessage: string;
  public readonly expose: boolean;

  constructor(options: AppErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = this.constructor.name;
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.expose = options.expose ?? options.statusCode < 500;
    this.clientMessage =
      options.clientMessage ??
      (this.expose ? options.message : "An unexpected error occurred");
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super({
      statusCode: 400,
      code: "BAD_REQUEST",
      message,
      expose: true,
      cause: options?.cause,
    });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super({
      statusCode: 401,
      code: "UNAUTHORIZED",
      message,
      expose: true,
      cause: options?.cause,
    });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super({
      statusCode: 409,
      code: "CONFLICT",
      message,
      expose: true,
      cause: options?.cause,
    });
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(
    message: string,
    options?: { clientMessage?: string; cause?: unknown }
  ) {
    super({
      statusCode: 503,
      code: "SERVICE_UNAVAILABLE",
      message,
      clientMessage:
        options?.clientMessage ?? "Service is temporarily unavailable",
      expose: false,
      cause: options?.cause,
    });
  }
}

export class ConfigurationError extends ServiceUnavailableError {
  constructor(
    message: string,
    clientMessage = "Service is temporarily unavailable"
  ) {
    super(message, { clientMessage });
  }
}

export class InvalidGoogleTokenError extends UnauthorizedError {}
