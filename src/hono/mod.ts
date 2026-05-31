/**
 * Hono middleware for structured logging and Prometheus metrics.
 *
 * Provides drop-in middleware for Hono applications to add observability:
 * structured JSON request logging (Loki-ready) and automatic HTTP metrics
 * collection (Prometheus-ready).
 *
 * @example
 * ```ts
 * import { Hono } from "hono";
 * import { requestId } from "hono/request-id";
 * import { createLogger, createMetrics } from "@sourcya/loog";
 * import { httpLogger, httpMetrics, metricsEndpoint } from "@sourcya/loog/hono";
 *
 * const logger = createLogger("my-app");
 * const metrics = createMetrics({ prefix: "myapp_" });
 *
 * const app = new Hono();
 * app.use("*", requestId());
 * app.use("*", httpLogger({ logger }));
 * app.use("*", httpMetrics({ metrics }));
 * app.get("/metrics", metricsEndpoint(metrics));
 * ```
 *
 * @module
 */

export { httpLogger } from "./logger.middleware.ts";
export type { HttpLoggerOptions } from "./logger.middleware.ts";
export { httpMetrics, metricsEndpoint } from "./metrics.middleware.ts";
export type { HttpMetricsOptions } from "./metrics.middleware.ts";
