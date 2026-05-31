/**
 * Structured HTTP request logging middleware for Hono.
 *
 * @module
 */

import type { MiddlewareHandler } from "hono";
import type { Logger } from "../types.ts";
import { createLogger } from "../logger.ts";

/** Configuration for the HTTP logger middleware. */
export interface HttpLoggerOptions {
  /** Logger instance to use. Defaults to `createLogger("http")`. */
  logger?: Logger;
  /**
   * Predicate to skip logging for certain paths.
   * Defaults to skipping `/healthz`, `/ready`, `/health`, and `/metrics`.
   */
  skip?: (path: string) => boolean;
}

const DEFAULT_SKIP_PATHS: ReadonlySet<string> = new Set([
  "/healthz",
  "/ready",
  "/health",
  "/metrics",
]);

/**
 * Create a Hono middleware that logs one structured JSON line per request on response completion.
 *
 * Integrates with Hono's built-in `requestId()` middleware — if active, the `requestId`
 * field is included in every log entry automatically.
 *
 * @param options - Middleware configuration.
 * @returns A Hono {@link MiddlewareHandler}.
 *
 * @example
 * ```ts
 * import { Hono } from "hono";
 * import { requestId } from "hono/request-id";
 * import { httpLogger } from "@sourcya/loog/hono";
 *
 * const app = new Hono();
 * app.use("*", requestId());
 * app.use("*", httpLogger());
 * ```
 */
export function httpLogger(options?: HttpLoggerOptions): MiddlewareHandler {
  const logger: Logger = options?.logger ?? createLogger("http");
  const skip: (path: string) => boolean =
    options?.skip ?? ((path: string): boolean => DEFAULT_SKIP_PATHS.has(path));

  return async (c, next) => {
    const path: string = c.req.path;
    if (skip(path)) {
      await next();
      return;
    }

    const start: number = performance.now();
    await next();
    const duration: number = Math.round(performance.now() - start);

    const method: string = c.req.method;
    const status: number = c.res.status;

    const fields: Record<string, unknown> = {
      method,
      path,
      status,
      duration,
    };

    try {
      const requestId: string | undefined = c.get("requestId");
      if (requestId) {
        fields.requestId = requestId;
      }
    } catch {
      // requestId middleware not active — no-op
    }

    const msg = `${method} ${path} ${status} ${duration}ms`;
    if (status >= 500) {
      logger.error(msg, fields);
    } else if (status >= 400) {
      logger.warn(msg, fields);
    } else {
      logger.info(msg, fields);
    }
  };
}
