/**
 * Structured HTTP request logging middleware for Oak.
 *
 * @module
 */

import type { Context, Next } from "@oak/oak";
import type { Logger } from "../types.ts";
import { createLogger } from "../logger.ts";

/** Configuration for the Oak HTTP logger middleware. */
export interface OakHttpLoggerOptions {
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
 * Create an Oak middleware that logs one structured JSON line per request on response completion.
 *
 * Reads `ctx.state.requestId` if set by upstream middleware for correlation.
 *
 * @param options - Middleware configuration.
 * @returns An Oak middleware function.
 *
 * @example
 * ```ts
 * import { Application } from "@oak/oak";
 * import { oakHttpLogger } from "@sourcya/loog/oak";
 *
 * const app = new Application();
 * app.use(oakHttpLogger());
 * ```
 */
export function oakHttpLogger(
  options?: OakHttpLoggerOptions,
): (ctx: Context, next: Next) => Promise<void> {
  const logger: Logger = options?.logger ?? createLogger("http");
  const skip: (path: string) => boolean =
    options?.skip ??
      ((path: string): boolean => DEFAULT_SKIP_PATHS.has(path));

  return async (ctx: Context, next: Next): Promise<void> => {
    const path: string = ctx.request.url.pathname;
    if (skip(path)) {
      await next();
      return;
    }

    const start: number = performance.now();
    await next();
    const duration: number = Math.round(performance.now() - start);

    const method: string = ctx.request.method;
    const status: number = ctx.response.status;

    const fields: Record<string, unknown> = {
      method,
      path,
      status,
      duration,
    };

    const requestId = (ctx.state as Record<string, unknown>)?.requestId;
    if (requestId) {
      fields.requestId = requestId;
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
