/**
 * Fresh middleware for structured logging and Prometheus metrics.
 *
 * Fresh 2.x uses Hono as its underlying HTTP framework, so this module
 * re-exports the Hono middleware with Fresh-specific documentation and naming.
 * All middleware functions are fully compatible with `app.use()` in Fresh.
 *
 * @example
 * ```ts
 * import { App } from "@fresh/core";
 * import { createLogger, createMetrics } from "@sourcya/loog";
 * import { freshHttpLogger, freshHttpMetrics, freshMetricsEndpoint } from "@sourcya/loog/fresh";
 *
 * const logger = createLogger("my-fresh-app");
 * const metrics = createMetrics({ prefix: "myapp_" });
 *
 * const app = new App();
 * app.use(freshHttpLogger({ logger }));
 * app.use(freshHttpMetrics({ metrics }));
 * app.get("/metrics", freshMetricsEndpoint(metrics));
 * ```
 *
 * @module
 */

import type { Metrics } from "../types.ts";
import type { MiddlewareHandler, Handler } from "hono";
import {
  httpLogger,
  type HttpLoggerOptions,
} from "../hono/logger.middleware.ts";
import {
  httpMetrics,
  metricsEndpoint,
  type HttpMetricsOptions,
} from "../hono/metrics.middleware.ts";

/** Configuration for the Fresh HTTP logger middleware. Identical to the Hono options. */
export type FreshHttpLoggerOptions = HttpLoggerOptions;

/** Configuration for the Fresh HTTP metrics middleware. Identical to the Hono options. */
export type FreshHttpMetricsOptions = HttpMetricsOptions;

/**
 * Create a Fresh middleware that logs one structured JSON line per request.
 *
 * This is the Hono `httpLogger` middleware, which is directly compatible with Fresh 2.x.
 *
 * @param options - Middleware configuration.
 * @returns A middleware function compatible with `app.use()`.
 *
 * @example
 * ```ts
 * import { App } from "@fresh/core";
 * import { freshHttpLogger } from "@sourcya/loog/fresh";
 *
 * const app = new App();
 * app.use(freshHttpLogger());
 * ```
 */
export function freshHttpLogger(
  options?: FreshHttpLoggerOptions,
): MiddlewareHandler {
  return httpLogger(options);
}

/**
 * Create a Fresh middleware that records HTTP request metrics for Prometheus.
 *
 * This is the Hono `httpMetrics` middleware, which is directly compatible with Fresh 2.x.
 *
 * @param options - Middleware configuration.
 * @returns A middleware function compatible with `app.use()`.
 *
 * @example
 * ```ts
 * import { App } from "@fresh/core";
 * import { createMetrics } from "@sourcya/loog/metrics";
 * import { freshHttpMetrics } from "@sourcya/loog/fresh";
 *
 * const metrics = createMetrics();
 * const app = new App();
 * app.use(freshHttpMetrics({ metrics }));
 * ```
 */
export function freshHttpMetrics(
  options?: FreshHttpMetricsOptions,
): MiddlewareHandler {
  return httpMetrics(options);
}

/**
 * Create a Fresh handler that serves Prometheus metrics in text exposition format.
 *
 * This is the Hono `metricsEndpoint` handler, which is directly compatible with Fresh 2.x.
 *
 * @param metrics - The metrics registry to serialize.
 * @returns A handler function compatible with `app.get()`.
 *
 * @example
 * ```ts
 * import { App } from "@fresh/core";
 * import { createMetrics } from "@sourcya/loog/metrics";
 * import { freshMetricsEndpoint } from "@sourcya/loog/fresh";
 *
 * const metrics = createMetrics();
 * const app = new App();
 * app.get("/metrics", freshMetricsEndpoint(metrics));
 * ```
 */
export function freshMetricsEndpoint(metrics: Metrics): Handler {
  return metricsEndpoint(metrics);
}
