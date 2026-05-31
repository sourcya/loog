/**
 * Oak middleware for structured logging and Prometheus metrics.
 *
 * Provides drop-in middleware for Oak applications to add observability:
 * structured JSON request logging (Loki-ready) and automatic HTTP metrics
 * collection (Prometheus-ready).
 *
 * @example
 * ```ts
 * import { Application } from "@oak/oak";
 * import { createLogger, createMetrics } from "@sourcya/loog";
 * import { oakHttpLogger, oakHttpMetrics, oakMetricsEndpoint } from "@sourcya/loog/oak";
 *
 * const logger = createLogger("my-app");
 * const metrics = createMetrics({ prefix: "myapp_" });
 *
 * const app = new Application();
 * app.use(oakHttpLogger({ logger }));
 * app.use(oakHttpMetrics({ metrics }));
 *
 * const metricsRouter = oakMetricsEndpoint(metrics);
 * app.use(metricsRouter.routes());
 * app.use(metricsRouter.allowedMethods());
 * ```
 *
 * @module
 */

export { oakHttpLogger } from "./logger.middleware.ts";
export type { OakHttpLoggerOptions } from "./logger.middleware.ts";
export { oakHttpMetrics, oakMetricsEndpoint } from "./metrics.middleware.ts";
export type { OakHttpMetricsOptions } from "./metrics.middleware.ts";
