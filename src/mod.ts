/**
 * @sourcya/loog — Zero-dependency observability for Deno.
 *
 * Structured JSON logging for Loki and native Prometheus metrics,
 * with optional Hono middleware via `@sourcya/loog/hono`.
 *
 * @example
 * ```ts
 * import { createLogger, createMetrics } from "@sourcya/loog";
 *
 * const log = createLogger("my-service", { level: "info" });
 * log.info("Started", { port: 3000 });
 *
 * const metrics = createMetrics({ prefix: "myapp_" });
 * const counter = metrics.counter({ name: "events_total", help: "Events processed" });
 * counter.inc();
 * ```
 *
 * @module
 */

export { createLogger } from "./logger.ts";
export { createMetrics } from "./metrics.ts";

export type {
  Counter,
  Gauge,
  Histogram,
  HistogramConfig,
  Logger,
  LoggerOptions,
  LogLevel,
  MetricConfig,
  Metrics,
  MetricsOptions,
} from "./types.ts";
