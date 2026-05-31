/**
 * Full Hono app example — structured logging + Prometheus metrics middleware.
 *
 * Run: deno run --allow-net examples/hono-app.ts
 * Then: curl http://localhost:8080/api/users
 *       curl http://localhost:8080/metrics
 */

import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { createLogger } from "../src/logger.ts";
import { createMetrics } from "../src/metrics.ts";
import { httpLogger, httpMetrics, metricsEndpoint } from "../src/hono/mod.ts";

// Create observability instances
const logger = createLogger("example-app", { level: "debug" });
const metrics = createMetrics({ prefix: "example_" });

// Custom business metrics
const usersCreated = metrics.counter({
  name: "users_created_total",
  help: "Total users created",
});

const app = new Hono();

// Wire up middleware — order matters:
// 1. Request ID (generates correlation ID)
// 2. HTTP logger (logs each request as structured JSON)
// 3. HTTP metrics (records Prometheus request metrics)
app.use("*", requestId());
app.use("*", httpLogger({ logger }));
app.use("*", httpMetrics({ metrics }));

// Expose /metrics for Prometheus scraping
app.get("/metrics", metricsEndpoint(metrics));

// Health check (skipped by logger and metrics by default)
app.get("/healthz", (c) => c.json({ status: "ok" }));

// Sample routes
app.get("/api/users", (c) => {
  const log = logger.child({ requestId: c.get("requestId") });
  log.info("Fetching users list");
  return c.json({ users: [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }] });
});

app.get("/api/users/:id", (c) => {
  const id = c.req.param("id");
  const log = logger.child({ requestId: c.get("requestId"), userId: id });
  log.info("Fetching user details");
  return c.json({ id, name: "Alice", email: "alice@example.com" });
});

app.post("/api/users", async (c) => {
  const body = await c.req.json();
  const log = logger.child({ requestId: c.get("requestId") });
  log.info("Creating user", { name: body.name });
  usersCreated.inc();
  return c.json({ id: 3, ...body }, 201);
});

// Start server
logger.info("Starting server", { port: 8080 });
Deno.serve({ port: 8080 }, app.fetch);
