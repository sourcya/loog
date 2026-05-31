import { assertEquals, assertStringIncludes } from "@std/assert";
import { createLogger } from "../logger.ts";
import { createMetrics } from "../metrics.ts";
import { oakHttpLogger } from "../oak/logger.middleware.ts";
import { oakHttpMetrics } from "../oak/metrics.middleware.ts";

function createMockContext(
  method: string,
  path: string,
  responseStatus: number = 200,
): { request: { url: URL; method: string }; response: { status: number; headers: Headers; body: unknown }; state: Record<string, unknown> } {
  return {
    request: {
      url: new URL(`http://localhost${path}`),
      method,
    },
    response: {
      status: responseStatus,
      headers: new Headers(),
      body: undefined,
    },
    state: {},
  };
}

// deno-lint-ignore no-explicit-any
type AnyCtx = any;

Deno.test("oak - oakHttpLogger logs requests with method, path, status, duration", async () => {
  const logs: string[] = [];
  const logger = createLogger("test", { timestamp: () => "T" });
  const captureLogger = {
    ...logger,
    info(msg: string, fields?: Record<string, unknown>): void {
      logs.push(JSON.stringify({ level: "info", msg, ...fields }));
    },
    warn: logger.warn,
    error: logger.error,
    debug: logger.debug,
    child: logger.child,
  };

  const middleware = oakHttpLogger({ logger: captureLogger });
  const ctx = createMockContext("GET", "/api/users");

  await middleware(ctx as AnyCtx, async () => {});

  assertEquals(logs.length, 1);
  const entry = JSON.parse(logs[0]) as Record<string, unknown>;
  assertEquals(entry.method, "GET");
  assertEquals(entry.path, "/api/users");
  assertEquals(entry.status, 200);
  assertEquals(typeof entry.duration, "number");
});

Deno.test("oak - oakHttpLogger skips health check paths", async () => {
  const logs: string[] = [];
  const logger = createLogger("test", { timestamp: () => "T" });
  const captureLogger = {
    ...logger,
    info(msg: string, fields?: Record<string, unknown>): void {
      logs.push(JSON.stringify({ msg, ...fields }));
    },
    warn: logger.warn,
    error: logger.error,
    debug: logger.debug,
    child: logger.child,
  };

  const middleware = oakHttpLogger({ logger: captureLogger });
  const ctx = createMockContext("GET", "/healthz");

  await middleware(ctx as AnyCtx, async () => {});

  assertEquals(logs.length, 0);
});

Deno.test("oak - oakHttpLogger includes requestId from state", async () => {
  const logs: string[] = [];
  const logger = createLogger("test", { timestamp: () => "T" });
  const captureLogger = {
    ...logger,
    info(msg: string, fields?: Record<string, unknown>): void {
      logs.push(JSON.stringify({ msg, ...fields }));
    },
    warn: logger.warn,
    error: logger.error,
    debug: logger.debug,
    child: logger.child,
  };

  const middleware = oakHttpLogger({ logger: captureLogger });
  const ctx = createMockContext("GET", "/api/data");
  ctx.state.requestId = "test-req-id";

  await middleware(ctx as AnyCtx, async () => {});

  assertEquals(logs.length, 1);
  const entry = JSON.parse(logs[0]) as Record<string, unknown>;
  assertEquals(entry.requestId, "test-req-id");
});

Deno.test("oak - oakHttpLogger logs warn for 4xx", async () => {
  const logs: string[] = [];
  const logger = createLogger("test", { timestamp: () => "T" });
  const captureLogger = {
    ...logger,
    info: logger.info,
    warn(msg: string, fields?: Record<string, unknown>): void {
      logs.push(JSON.stringify({ level: "warn", msg, ...fields }));
    },
    error: logger.error,
    debug: logger.debug,
    child: logger.child,
  };

  const middleware = oakHttpLogger({ logger: captureLogger });
  const ctx = createMockContext("GET", "/api/missing", 404);

  await middleware(ctx as AnyCtx, async () => {});

  assertEquals(logs.length, 1);
  const entry = JSON.parse(logs[0]) as Record<string, unknown>;
  assertEquals(entry.level, "warn");
});

Deno.test("oak - oakHttpMetrics records request count and duration", async () => {
  const metrics = createMetrics({ prefix: "test_" });
  const middleware = oakHttpMetrics({ metrics });
  const ctx = createMockContext("GET", "/api/data");

  await middleware(ctx as AnyCtx, async () => {});
  await middleware(ctx as AnyCtx, async () => {});

  const out = metrics.serialize();
  assertStringIncludes(out, "test_http_requests_total");
  assertStringIncludes(out, "test_http_request_duration_seconds");
});

Deno.test("oak - oakHttpMetrics skips /metrics path", async () => {
  const metrics = createMetrics({ prefix: "test_" });
  const middleware = oakHttpMetrics({ metrics });
  const ctx = createMockContext("GET", "/metrics");

  await middleware(ctx as AnyCtx, async () => {});

  const out = metrics.serialize();
  const lines = out
    .split("\n")
    .filter((l) => l.startsWith("test_http_requests_total{"));
  assertEquals(lines.length, 0);
});

Deno.test("oak - oakHttpMetrics includes method and status labels", async () => {
  const metrics = createMetrics({ prefix: "test_" });
  const middleware = oakHttpMetrics({ metrics });
  const ctx = createMockContext("POST", "/api/create", 201);

  await middleware(ctx as AnyCtx, async () => {});

  const out = metrics.serialize();
  assertStringIncludes(out, 'method="POST"');
  assertStringIncludes(out, 'status_code="201"');
});
