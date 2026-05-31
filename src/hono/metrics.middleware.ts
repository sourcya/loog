/**
 * Prometheus HTTP metrics middleware and endpoint handler for Hono.
 *
 * @module
 */

import type { Context, Handler, MiddlewareHandler } from "hono";
import type { Metrics } from "../types.ts";
import { createMetrics } from "../metrics.ts";

/** Configuration for the HTTP metrics middleware. */
export interface HttpMetricsOptions {
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
 * Create a Hono middleware that records HTTP request metrics for Prometheus.
 *
 * Collects two metrics:
 * - `http_request_duration_seconds` (Histogram) — request latency by method, route, and status code
 * - `http_requests_total` (Counter) — total request count by method, route, and status code
 *
 * Uses `c.req.routePath` for the `route` label to get the normalized route pattern
 * (e.g. `/api/v1/users/:id`) rather than the raw URL.
 *
 * @param options - Middleware configuration.
 * @returns A Hono {@link MiddlewareHandler}.
 *
 * @example
 * ```ts
 * import { Hono } from "hono";
 * import { createMetrics } from "@sourcya/loog/metrics";
 * import { httpMetrics, metricsEndpoint } from "@sourcya/loog/hono";
 *
 * const metrics = createMetrics({ prefix: "myapp_" });
 * const app = new Hono();
 * app.use("*", httpMetrics({ metrics }));
 * app.get("/metrics", metricsEndpoint(metrics));
 * ```
 */
export function httpMetrics(options?: HttpMetricsOptions): MiddlewareHandler {
  const metrics: Metrics = options?.metrics ?? createMetrics();
  const skip: (path: string) => boolean =
    options?.skip ?? ((path: string): boolean => DEFAULT_SKIP_PATHS.has(path));

  type HttpLabel = "method" | "route" | "status_code";

  const duration = metrics.histogram<HttpLabel>({
    name: "http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labels: ["method", "route", "status_code"] as const,
    buckets: options?.buckets,
  });

  const total = metrics.counter<HttpLabel>({
    name: "http_requests_total",
    help: "Total HTTP requests",
    labels: ["method", "route", "status_code"] as const,
  });

  return async (c, next) => {
    const path: string = c.req.path;
    if (skip(path)) {
      await next();
      return;
    }

    const start: number = performance.now();
    await next();
    const elapsed: number = (performance.now() - start) / 1000;

    const labels: Record<HttpLabel, string> = {
      method: c.req.method,
      route: c.req.routePath,
      status_code: String(c.res.status),
    };

    duration.observe(labels, elapsed);
    total.inc(labels);
  };
}

/**
 * Create a Hono handler that serves Prometheus metrics in text exposition format.
 *
 * @param metrics - The metrics registry to serialize.
 * @returns A Hono {@link Handler}.
 *
 * @example
 * ```ts
 * import { Hono } from "hono";
 * import { createMetrics } from "@sourcya/loog/metrics";
 * import { metricsEndpoint } from "@sourcya/loog/hono";
 *
 * const metrics = createMetrics();
 * const app = new Hono();
 * app.get("/metrics", metricsEndpoint(metrics));
 * ```
 */
export function metricsEndpoint(metrics: Metrics): Handler {
  return (c: Context): Response => {
    return c.text(metrics.serialize(), 200, {
      "Content-Type": metrics.contentType,
    });
  };
}
