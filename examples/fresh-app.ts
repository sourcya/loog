/**
 * Fresh 2.x app example — structured logging + Prometheus metrics middleware.
 *
 * Fresh 2.x uses Hono internally, so loog's Hono middleware works directly.
 * This example uses the `@sourcya/loog/fresh` adapter for idiomatic naming.
 *
 * Run: deno run --allow-net --allow-env --allow-read examples/fresh-app.ts
 * Then: curl http://localhost:8082/api/tasks
 *       curl http://localhost:8082/metrics
 *
 * Note: This is a minimal Fresh example for demonstration.
 * In a real Fresh project, middleware is typically placed in routes/_middleware.ts.
 */

import { Hono } from "hono";
import { createLogger } from "../src/logger.ts";
import { createMetrics } from "../src/metrics.ts";
import {
  freshHttpLogger,
  freshHttpMetrics,
  freshMetricsEndpoint,
} from "../src/fresh/mod.ts";

// Since Fresh 2.x uses Hono under the hood, we demonstrate with a Hono app
// that mirrors how Fresh middleware works. In a real Fresh project, you'd use
// App from @fresh/core instead.
const logger = createLogger("fresh-example", { level: "debug" });
const metrics = createMetrics({ prefix: "fresh_example_" });

const app = new Hono();

// Wire up Fresh-compatible middleware (these are the Hono middleware under the hood)
app.use("*", freshHttpLogger({ logger }));
app.use("*", freshHttpMetrics({ metrics }));
app.get("/metrics", freshMetricsEndpoint(metrics));

app.get("/healthz", (c) => c.json({ status: "ok" }));

app.get("/api/tasks", (c) => {
  logger.info("Fetching tasks");
  return c.json({
    tasks: [
      { id: 1, title: "Setup monitoring", done: true },
      { id: 2, title: "Deploy to production", done: false },
    ],
  });
});

logger.info("Starting Fresh-compatible server", { port: 8082 });
Deno.serve({ port: 8082 }, app.fetch);
