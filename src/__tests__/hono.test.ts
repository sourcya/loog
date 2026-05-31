import { assertEquals, assertStringIncludes } from "@std/assert";
import { Hono } from "hono";
import { createLogger } from "../logger.ts";
import { createMetrics } from "../metrics.ts";
import { httpLogger } from "../hono/logger.middleware.ts";
import { httpMetrics, metricsEndpoint } from "../hono/metrics.middleware.ts";

function createTestApp(): {
  app: Hono;
  metrics: ReturnType<typeof createMetrics>;
  logs: string[];
} {
  const logs: string[] = [];
  const logger = createLogger("test", {
    timestamp: () => "T",
  });
  const origInfo = logger.info.bind(logger);
  const captureLogger = {
    ...logger,
    info(msg: string, fields?: Record<string, unknown>): void {
      logs.push(JSON.stringify({ level: "info", msg, ...fields }));
      origInfo(msg, fields);
    },
    warn(msg: string, fields?: Record<string, unknown>): void {
      logs.push(JSON.stringify({ level: "warn", msg, ...fields }));
    },
    error(msg: string, fields?: Record<string, unknown>): void {
      logs.push(JSON.stringify({ level: "error", msg, ...fields }));
    },
    debug(msg: string, fields?: Record<string, unknown>): void {
      logs.push(JSON.stringify({ level: "debug", msg, ...fields }));
    },
    child: logger.child.bind(logger),
  };

  const metrics = createMetrics({ prefix: "test_" });
  const app = new Hono();

  const origLog = console.log;
  const origError = console.error;
  console.log = () => {};
  console.error = () => {};
  app.use("*", httpLogger({ logger: captureLogger }));
  app.use("*", httpMetrics({ metrics }));
  app.get("/metrics", metricsEndpoint(metrics));
  app.get("/healthz", (c) => c.json({ status: "ok" }));
  app.get("/api/users", (c) => c.json({ users: [] }));
  app.get("/api/users/:id", (c) => c.json({ id: c.req.param("id") }));
  app.post("/api/users", (c) => c.json({ created: true }, 201));
  console.log = origLog;
  console.error = origError;

  return { app, metrics, logs };
}

Deno.test("hono - httpLogger logs requests with method, path, status, duration", async () => {
  const { app, logs } = createTestApp();
  const origLog = console.log;
  console.log = () => {};
  await app.request("/api/users");
  console.log = origLog;
  assertEquals(logs.length, 1);
  const entry = JSON.parse(logs[0]) as Record<string, unknown>;
  assertEquals(entry.method, "GET");
  assertEquals(entry.path, "/api/users");
  assertEquals(entry.status, 200);
  assertEquals(typeof entry.duration, "number");
});

Deno.test("hono - httpLogger skips health check paths", async () => {
  const { app, logs } = createTestApp();
  await app.request("/healthz");
  assertEquals(logs.length, 0);
});

Deno.test("hono - httpMetrics records request count", async () => {
  const { app, metrics } = createTestApp();
  const origLog = console.log;
  console.log = () => {};
  await app.request("/api/users");
  await app.request("/api/users");
  console.log = origLog;
  const out = metrics.serialize();
  assertStringIncludes(out, "test_http_requests_total");
});

Deno.test("hono - httpMetrics records duration histogram", async () => {
  const { app, metrics } = createTestApp();
  const origLog = console.log;
  console.log = () => {};
  await app.request("/api/users");
  console.log = origLog;
  const out = metrics.serialize();
  assertStringIncludes(out, "test_http_request_duration_seconds_bucket");
  assertStringIncludes(out, "test_http_request_duration_seconds_count");
  assertStringIncludes(out, "test_http_request_duration_seconds_sum");
});

Deno.test("hono - httpMetrics skips /metrics path", async () => {
  const { app, metrics } = createTestApp();
  await app.request("/metrics");
  const out = metrics.serialize();
  const lines = out.split("\n").filter((l) =>
    l.startsWith("test_http_requests_total{")
  );
  assertEquals(lines.length, 0);
});

Deno.test("hono - metricsEndpoint returns prometheus text format", async () => {
  const { app, metrics } = createTestApp();
  metrics.counter({ name: "custom_total", help: "Custom" }).inc();
  const res = await app.request("/metrics");
  assertEquals(res.status, 200);
  const body = await res.text();
  assertStringIncludes(body, "# HELP test_custom_total Custom");
  assertStringIncludes(body, "# TYPE test_custom_total counter");
  const contentType = res.headers.get("content-type");
  assertEquals(contentType, "text/plain; version=0.0.4; charset=utf-8");
});

Deno.test("hono - httpMetrics includes route labels", async () => {
  const { app, metrics } = createTestApp();
  const origLog = console.log;
  console.log = () => {};
  await app.request("/api/users/123");
  console.log = origLog;
  const out = metrics.serialize();
  assertStringIncludes(out, 'method="GET"');
  assertStringIncludes(out, 'status_code="200"');
});
