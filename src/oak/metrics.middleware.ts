/**
 * Prometheus HTTP metrics middleware and endpoint handler for Oak.
 *
 * @module
 */

import type { Context, Next } from "@oak/oak";
import { Router } from "@oak/oak";
import type { Metrics } from "../types.ts";
import { createMetrics } from "../metrics.ts";

/** Configuration for the Oak HTTP metrics middleware. */
export interface OakHttpMetricsOptions {
  /** Metrics registry instance. Defaults to a new registry. */
  metrics?: Metrics;
  /**
   * Predicate to skip metrics collection for certain paths.
   * Defaults to skipping `/metrics`, `/healthz`, `/ready`, and `/health`.
   */
  skip?: (path: string) => boolean;
  /** Custom histogram bucket boundaries for request duration. */
  buckets?: number[];
}

const DEFAULT_SKIP_PATHS: ReadonlySet<string> = new Set([
  "/metrics",
  "/healthz",
  "/ready",
  "/health",
]);

/**
 * Create an Oak middleware that records HTTP request metrics for Prometheus.
 *
 * Collects two metrics:
 * - `http_request_duration_seconds` (Histogram) — request latency by method, path, and status code
 * - `http_requests_total` (Counter) — total request count by method, path, and status code
 *
 * @param options - Middleware configuration.
 * @returns An Oak middleware function.
 *
 * @example
 * ```ts
 * import { Application } from "@oak/oak";
 * import { createMetrics } from "@sourcya/loog/metrics";
 * import { oakHttpMetrics } from "@sourcya/loog/oak";
 *
 * const metrics = createMetrics({ prefix: "myapp_" });
 * const app = new Application();
 * app.use(oakHttpMetrics({ metrics }));
 * ```
 */
export function oakHttpMetrics(
  options?: OakHttpMetricsOptions,
): (ctx: Context, next: Next) => Promise<void> {
  const metrics: Metrics = options?.metrics ?? createMetrics();
  const skip: (path: string) => boolean =
    options?.skip ??
      ((path: string): boolean => DEFAULT_SKIP_PATHS.has(path));

  type HttpLabel = "method" | "path" | "status_code";

  const duration = metrics.histogram<HttpLabel>({
    name: "http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labels: ["method", "path", "status_code"] as const,
    buckets: options?.buckets,
  });

  const total = metrics.counter<HttpLabel>({
    name: "http_requests_total",
    help: "Total HTTP requests",
    labels: ["method", "path", "status_code"] as const,
  });

  return async (ctx: Context, next: Next): Promise<void> => {
    const path: string = ctx.request.url.pathname;
    if (skip(path)) {
      await next();
      return;
    }

    const start: number = performance.now();
    await next();
    const elapsed: number = (performance.now() - start) / 1000;

    const labels: Record<HttpLabel, string> = {
      method: ctx.request.method,
      path,
      status_code: String(ctx.response.status),
    };

    duration.observe(labels, elapsed);
    total.inc(labels);
  };
}

/**
 * Create an Oak router that serves Prometheus metrics at the specified path.
 *
 * @param metrics - The metrics registry to serialize.
 * @param path - The route path. Defaults to `"/metrics"`.
 * @returns An Oak {@link Router}.
 *
 * @example
 * ```ts
 * import { Application } from "@oak/oak";
 * import { createMetrics } from "@sourcya/loog/metrics";
 * import { oakMetricsEndpoint } from "@sourcya/loog/oak";
 *
 * const metrics = createMetrics();
 * const app = new Application();
 * const metricsRouter = oakMetricsEndpoint(metrics);
 * app.use(metricsRouter.routes());
 * app.use(metricsRouter.allowedMethods());
 * ```
 */
export function oakMetricsEndpoint(
  metrics: Metrics,
  path: string = "/metrics",
): Router {
  const router = new Router();
  router.get(path, (ctx: Context) => {
    ctx.response.headers.set("Content-Type", metrics.contentType);
    ctx.response.body = metrics.serialize();
  });
  return router;
}
