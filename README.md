# @sourcya/loog

[![JSR](https://jsr.io/badges/@sourcya/loog)](https://jsr.io/@sourcya/loog)

Zero-dependency observability for Deno — structured JSON logging for
[Loki](https://grafana.com/oss/loki/) and native
[Prometheus](https://prometheus.io/) metrics, with drop-in middleware for
**Hono**, **Oak**, and **Fresh**.

## Features

- **Structured JSON Logger** — Loki/Promtail-ready JSON lines to stdout/stderr
- **Native Prometheus Metrics** — Counter, Gauge, Histogram with text exposition
  format. No `prom-client` or npm dependencies.
- **Framework Middleware** — Request logging + HTTP metrics for Hono, Oak, and
  Fresh 2.x
- **Request ID Correlation** — Integrates with Hono's built-in `requestId()`
  middleware
- **Child Loggers** — Inherit parent context, add request-scoped fields
- **Zero Dependencies** — Core logger and metrics have no external dependencies.
  Framework adapters depend only on their respective framework.

## Installation

```bash
deno add jsr:@sourcya/loog
```

Or add to your import map in `deno.json`:

```json
{
  "imports": {
    "@sourcya/loog": "jsr:@sourcya/loog@^0.1",
    "@sourcya/loog/": "jsr:/@sourcya/loog@^0.1/"
  }
}
```

## Quick Start

```ts
import { createLogger, createMetrics } from "@sourcya/loog";

// Structured logging
const log = createLogger("my-service");
log.info("Server started", { port: 3000 });
// → {"ts":"2026-05-31T12:00:00.000Z","level":"info","module":"my-service","msg":"Server started","port":3000}

// Prometheus metrics
const metrics = createMetrics({ prefix: "myapp_" });
const counter = metrics.counter({
  name: "requests_total",
  help: "Total requests",
});
counter.inc();
console.log(metrics.serialize());
// → # HELP myapp_requests_total Total requests
// → # TYPE myapp_requests_total counter
// → myapp_requests_total 1
```

---

## Logger Guide

### Creating a Logger

```ts
import { createLogger } from "@sourcya/loog/logger";

const log = createLogger("my-module");
log.info("Hello");
```

The first argument is the **module name**, included as the `module` field in
every log entry.

### Log Levels

Four levels in ascending severity: `debug` → `info` → `warn` → `error`.

```ts
const log = createLogger("app", { level: "warn" });
log.debug("skipped"); // not emitted
log.info("skipped"); // not emitted
log.warn("emitted"); // ✓
log.error("emitted"); // ✓
```

Default level is `"info"`.

### Extra Fields

Pass a record of extra fields as the second argument to any log method:

```ts
log.info("User login", { userId: 42, ip: "192.168.1.1" });
```

Output:

```json
{
  "ts": "2026-05-31T12:00:00.000Z",
  "level": "info",
  "module": "auth",
  "msg": "User login",
  "userId": 42,
  "ip": "192.168.1.1"
}
```

### Child Loggers

Create child loggers that inherit parent fields and add their own. Useful for
adding request-scoped context:

```ts
const log = createLogger("api", { fields: { service: "payments" } });
const reqLog = log.child({ requestId: "abc-123" });
reqLog.info("Processing payment", { amount: 99.99 });
// → {..., "service":"payments", "requestId":"abc-123", "amount":99.99}
```

Child fields override parent fields on key collision. Children inherit the
parent's log level.

### Output Format

Every log call emits exactly one JSON line. Field reference:

| Field    | Type   | Description                      |
| -------- | ------ | -------------------------------- |
| `ts`     | string | ISO 8601 timestamp               |
| `level`  | string | Log level (debug/info/warn/error) |
| `module` | string | Module name from `createLogger`  |
| `msg`    | string | Log message                      |
| `...`    | any    | Extra fields from args or parent |

`error`-level messages go to **stderr**; all others go to **stdout**.

### Error Serialization

`Error` objects in fields are automatically serialized to plain objects with
`name`, `message`, and `stack` — they won't silently become `{}`:

```ts
log.error("Failed", { err: new Error("connection timeout") });
// → { ..., "err": { "name": "Error", "message": "connection timeout", "stack": "..." } }
```

### Custom Timestamp

```ts
const log = createLogger("app", {
  timestamp: () => String(Date.now()),
});
```

---

## Metrics Guide

### Creating a Registry

```ts
import { createMetrics } from "@sourcya/loog/metrics";

const metrics = createMetrics({
  prefix: "myapp_", // prepended to all metric names
  defaultLabels: { env: "production", service: "api" },
});
```

### Counter

A monotonically increasing metric. Use for: total requests, events processed,
errors.

```ts
const requests = metrics.counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labels: ["method", "status"],
});

requests.inc({ method: "GET", status: "200" }); // +1
requests.inc({ method: "POST", status: "201" }, 5); // +5
requests.inc(); // +1 (no labels)
```

### Gauge

A metric that can go up and down. Use for: active connections, queue depth,
temperature.

```ts
const connections = metrics.gauge({
  name: "active_connections",
  help: "Current active connections",
  labels: ["pool"],
});

connections.set({ pool: "primary" }, 10);
connections.inc({ pool: "primary" }); // 11
connections.dec({ pool: "primary" }, 3); // 8
```

### Histogram

Tracks the distribution of observed values in configurable buckets. Use for:
request duration, response size.

```ts
const duration = metrics.histogram({
  name: "request_duration_seconds",
  help: "Request duration in seconds",
  labels: ["method"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5], // custom buckets
});

duration.observe({ method: "GET" }, 0.042);
```

Default buckets: `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]`

### Serialization

```ts
const output = metrics.serialize();
// Returns Prometheus text exposition format:
// # HELP myapp_http_requests_total Total HTTP requests
// # TYPE myapp_http_requests_total counter
// myapp_http_requests_total{env="production",method="GET",service="api",status="200"} 1
```

The `contentType` property returns the correct MIME type for Prometheus:

```ts
metrics.contentType;
// "text/plain; version=0.0.4; charset=utf-8"
```

---

## Hono Middleware

```ts
import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { createLogger, createMetrics } from "@sourcya/loog";
import { httpLogger, httpMetrics, metricsEndpoint } from "@sourcya/loog/hono";

const logger = createLogger("my-app");
const metrics = createMetrics({ prefix: "myapp_" });

const app = new Hono();

// 1. Generate request IDs (Hono built-in)
app.use("*", requestId());

// 2. Structured request logging (one JSON line per response)
app.use("*", httpLogger({ logger }));

// 3. HTTP metrics (request count + duration histogram)
app.use("*", httpMetrics({ metrics }));

// 4. Expose /metrics for Prometheus
app.get("/metrics", metricsEndpoint(metrics));
```

### `httpLogger(options?)`

Logs one structured JSON line per request on response completion.

**Options:**

| Option   | Type                        | Default                                             |
| -------- | --------------------------- | --------------------------------------------------- |
| `logger` | `Logger`                    | `createLogger("http")`                              |
| `skip`   | `(path: string) => boolean` | Skips `/healthz`, `/ready`, `/health`, `/metrics`    |

**Output:**

```json
{
  "ts": "...",
  "level": "info",
  "module": "http",
  "msg": "GET /api/users 200 42ms",
  "method": "GET",
  "path": "/api/users",
  "status": 200,
  "duration": 42,
  "requestId": "550e8400-..."
}
```

- 5xx responses → `error` level
- 4xx responses → `warn` level
- Others → `info` level
- `requestId` is included if Hono's `requestId()` middleware is active

### `httpMetrics(options?)`

Records two metrics per request:

| Metric                           | Type      | Labels                          |
| -------------------------------- | --------- | ------------------------------- |
| `http_request_duration_seconds`  | Histogram | `method`, `route`, `status_code` |
| `http_requests_total`            | Counter   | `method`, `route`, `status_code` |

The `route` label uses `c.req.routePath` for the normalized route pattern (e.g.
`/api/users/:id`), not the raw URL.

**Options:**

| Option    | Type                        | Default                                             |
| --------- | --------------------------- | --------------------------------------------------- |
| `metrics` | `Metrics`                   | Creates a new registry                              |
| `skip`    | `(path: string) => boolean` | Skips `/metrics`, `/healthz`, `/ready`, `/health`    |
| `buckets` | `number[]`                  | Default histogram buckets                           |

### `metricsEndpoint(metrics)`

Returns a Hono handler that serves `metrics.serialize()` with the correct
`Content-Type` header.

---

## Oak Middleware

```ts
import { Application, Router } from "@oak/oak";
import { createLogger, createMetrics } from "@sourcya/loog";
import {
  oakHttpLogger,
  oakHttpMetrics,
  oakMetricsEndpoint,
} from "@sourcya/loog/oak";

const logger = createLogger("my-app");
const metrics = createMetrics({ prefix: "myapp_" });

const app = new Application();

// Request ID middleware (Oak doesn't have one built-in)
app.use(async (ctx, next) => {
  const requestId =
    ctx.request.headers.get("X-Request-ID") ?? crypto.randomUUID();
  ctx.state.requestId = requestId;
  ctx.response.headers.set("X-Request-ID", requestId);
  await next();
});

// Structured request logging
app.use(oakHttpLogger({ logger }));

// HTTP metrics collection
app.use(oakHttpMetrics({ metrics }));

// Expose /metrics
const metricsRouter = oakMetricsEndpoint(metrics);
app.use(metricsRouter.routes());
app.use(metricsRouter.allowedMethods());
```

### `oakHttpLogger(options?)`

Same behavior as the Hono `httpLogger` but for Oak. Reads `ctx.state.requestId`
for correlation.

### `oakHttpMetrics(options?)`

Same metrics as the Hono adapter. Uses `ctx.request.url.pathname` for the `path`
label.

### `oakMetricsEndpoint(metrics, path?)`

Returns an Oak `Router` with a GET handler at the specified path (defaults to
`"/metrics"`).

---

## Fresh Middleware

Fresh 2.x uses Hono as its underlying HTTP framework. The `@sourcya/loog/fresh`
subpath provides Hono middleware with Fresh-idiomatic naming.

```ts
import { App } from "@fresh/core";
import { createLogger, createMetrics } from "@sourcya/loog";
import {
  freshHttpLogger,
  freshHttpMetrics,
  freshMetricsEndpoint,
} from "@sourcya/loog/fresh";

const logger = createLogger("my-fresh-app");
const metrics = createMetrics({ prefix: "myapp_" });

const app = new App();
app.use(freshHttpLogger({ logger }));
app.use(freshHttpMetrics({ metrics }));
app.get("/metrics", freshMetricsEndpoint(metrics));
```

Since Fresh 2.x is built on Hono, you can also use `@sourcya/loog/hono`
directly — the middleware is identical.

---

## Grafana Stack Integration

### Prometheus Scrape Config

Add this to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: "my-service"
    scrape_interval: 15s
    static_configs:
      - targets: ["my-service:3000"]
    metrics_path: "/metrics"
```

### Promtail / Grafana Alloy — Log Ingestion

Since loog outputs structured JSON to stdout, configure Promtail or Grafana
Alloy to scrape container logs and parse JSON fields:

**Promtail `config.yaml`:**

```yaml
scrape_configs:
  - job_name: my-service
    static_configs:
      - targets: [localhost]
        labels:
          job: my-service
          __path__: /var/log/containers/my-service*.log
    pipeline_stages:
      - json:
          expressions:
            level: level
            module: module
            msg: msg
            requestId: requestId
      - labels:
          level:
          module:
```

### Sample Grafana Queries

**PromQL (Metrics):**

```promql
# Request rate per second
rate(myapp_http_requests_total[5m])

# 95th percentile request duration
histogram_quantile(0.95, rate(myapp_http_request_duration_seconds_bucket[5m]))

# Error rate (5xx responses)
rate(myapp_http_requests_total{status_code=~"5.."}[5m])
```

**LogQL (Loki):**

```logql
# All error logs from my-service
{job="my-service"} | json | level="error"

# Slow requests (duration > 1000ms)
{job="my-service"} | json | module="http" | duration > 1000

# Logs for a specific request
{job="my-service"} | json | requestId="550e8400-e29b-41d4-a716-446655440000"
```

---

## API Reference

### `@sourcya/loog` (default)

```ts
export function createLogger(module: string, options?: LoggerOptions): Logger;
export function createMetrics(options?: MetricsOptions): Metrics;
```

### `@sourcya/loog/logger`

```ts
export function createLogger(module: string, options?: LoggerOptions): Logger;

interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

interface LoggerOptions {
  level?: "debug" | "info" | "warn" | "error";
  fields?: Record<string, unknown>;
  timestamp?: () => string;
}
```

### `@sourcya/loog/metrics`

```ts
export function createMetrics(options?: MetricsOptions): Metrics;

interface Metrics {
  counter<L extends string>(config: MetricConfig<L>): Counter<L>;
  histogram<L extends string>(config: HistogramConfig<L>): Histogram<L>;
  gauge<L extends string>(config: MetricConfig<L>): Gauge<L>;
  serialize(): string;
  contentType: string;
}

interface Counter<L extends string> {
  inc(labels?: Record<L, string>, value?: number): void;
}

interface Gauge<L extends string> {
  set(labels: Record<L, string>, value: number): void;
  inc(labels?: Record<L, string>, value?: number): void;
  dec(labels?: Record<L, string>, value?: number): void;
}

interface Histogram<L extends string> {
  observe(labels: Record<L, string>, value: number): void;
}

interface MetricConfig<L extends string> {
  name: string;
  help: string;
  labels?: readonly L[];
}

interface HistogramConfig<L extends string> extends MetricConfig<L> {
  buckets?: number[];
}

interface MetricsOptions {
  prefix?: string;
  defaultLabels?: Record<string, string>;
}
```

### `@sourcya/loog/hono`

```ts
export function httpLogger(options?: HttpLoggerOptions): MiddlewareHandler;
export function httpMetrics(options?: HttpMetricsOptions): MiddlewareHandler;
export function metricsEndpoint(metrics: Metrics): Handler;
```

### `@sourcya/loog/oak`

```ts
export function oakHttpLogger(
  options?: OakHttpLoggerOptions,
): (ctx: Context, next: Next) => Promise<void>;
export function oakHttpMetrics(
  options?: OakHttpMetricsOptions,
): (ctx: Context, next: Next) => Promise<void>;
export function oakMetricsEndpoint(
  metrics: Metrics,
  path?: string,
): Router;
```

### `@sourcya/loog/fresh`

```ts
export function freshHttpLogger(
  options?: FreshHttpLoggerOptions,
): MiddlewareHandler;
export function freshHttpMetrics(
  options?: FreshHttpMetricsOptions,
): MiddlewareHandler;
export function freshMetricsEndpoint(metrics: Metrics): Handler;
```

---

## Examples

Runnable examples in the [`examples/`](examples/) directory:

| Example                                        | Description                             |
| ---------------------------------------------- | --------------------------------------- |
| [`basic-logger.ts`](examples/basic-logger.ts)  | Standalone structured logging           |
| [`custom-metrics.ts`](examples/custom-metrics.ts) | Creating and observing metrics       |
| [`hono-app.ts`](examples/hono-app.ts)          | Full Hono app with all middleware       |
| [`oak-app.ts`](examples/oak-app.ts)            | Full Oak app with all middleware        |
| [`fresh-app.ts`](examples/fresh-app.ts)        | Fresh 2.x app with middleware           |

Run any example:

```bash
deno run --allow-net examples/hono-app.ts
```

---

## Contributing

```bash
# Run tests
deno task test

# Lint (including JSR rules)
deno task lint

# Type check
deno task check

# Dry-run publish (verify no slow types)
deno task publish:dry
```

## License

[MIT](LICENSE)
