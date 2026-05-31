import { assertEquals, assertStringIncludes } from "@std/assert";
import { assertThrows } from "@std/assert";
import { createMetrics } from "../metrics.ts";

Deno.test("counter - increments by 1 by default", () => {
  const m = createMetrics();
  const c = m.counter({ name: "test_total", help: "Test counter" });
  c.inc();
  c.inc();
  const out = m.serialize();
  assertStringIncludes(out, "test_total 2");
});

Deno.test("counter - increments by custom value", () => {
  const m = createMetrics();
  const c = m.counter({ name: "test_total", help: "Test" });
  c.inc(undefined, 5);
  const out = m.serialize();
  assertStringIncludes(out, "test_total 5");
});

Deno.test("counter - with labels", () => {
  const m = createMetrics();
  const c = m.counter({
    name: "req_total",
    help: "Requests",
    labels: ["method"],
  });
  c.inc({ method: "GET" });
  c.inc({ method: "POST" });
  c.inc({ method: "GET" }, 2);
  const out = m.serialize();
  assertStringIncludes(out, 'req_total{method="GET"} 3');
  assertStringIncludes(out, 'req_total{method="POST"} 1');
});

Deno.test("counter - rejects negative values", () => {
  const m = createMetrics();
  const c = m.counter({ name: "test_total", help: "Test" });
  assertThrows(() => c.inc(undefined, -1), Error, "non-negative");
});

Deno.test("gauge - set, inc, dec", () => {
  const m = createMetrics();
  const g = m.gauge({ name: "connections", help: "Active connections" });
  g.inc();
  g.inc();
  g.dec();
  const out = m.serialize();
  assertStringIncludes(out, "connections 1");
});

Deno.test("gauge - set with labels", () => {
  const m = createMetrics();
  const g = m.gauge({
    name: "temp",
    help: "Temperature",
    labels: ["location"],
  });
  g.set({ location: "cpu" }, 72.5);
  g.set({ location: "gpu" }, 85.0);
  const out = m.serialize();
  assertStringIncludes(out, 'temp{location="cpu"} 72.5');
  assertStringIncludes(out, 'temp{location="gpu"} 85');
});

Deno.test("histogram - observe distributes into buckets", () => {
  const m = createMetrics();
  const h = m.histogram({
    name: "duration_seconds",
    help: "Duration",
    buckets: [0.1, 0.5, 1],
  });
  h.observe({}, 0.05);
  h.observe({}, 0.3);
  h.observe({}, 0.8);
  const out = m.serialize();
  assertStringIncludes(out, 'duration_seconds_bucket{le="0.1"} 1');
  assertStringIncludes(out, 'duration_seconds_bucket{le="0.5"} 2');
  assertStringIncludes(out, 'duration_seconds_bucket{le="1"} 3');
  assertStringIncludes(out, 'duration_seconds_bucket{le="+Inf"} 3');
  assertStringIncludes(out, "duration_seconds_count 3");
});

Deno.test("histogram - sum tracks total observed values", () => {
  const m = createMetrics();
  const h = m.histogram({
    name: "d",
    help: "Duration",
    buckets: [1],
  });
  h.observe({}, 0.5);
  h.observe({}, 1.5);
  const out = m.serialize();
  assertStringIncludes(out, "d_sum 2");
});

Deno.test("histogram - with labels", () => {
  const m = createMetrics();
  const h = m.histogram({
    name: "latency",
    help: "Latency",
    labels: ["method"],
    buckets: [0.1, 1],
  });
  h.observe({ method: "GET" }, 0.05);
  h.observe({ method: "POST" }, 0.5);
  const out = m.serialize();
  assertStringIncludes(out, 'latency_bucket{le="0.1",method="GET"} 1');
  assertStringIncludes(out, 'latency_bucket{le="1",method="POST"} 1');
});

Deno.test("metrics - prefix is prepended to names", () => {
  const m = createMetrics({ prefix: "myapp_" });
  m.counter({ name: "events_total", help: "Events" });
  const out = m.serialize();
  assertStringIncludes(out, "# HELP myapp_events_total Events");
  assertStringIncludes(out, "# TYPE myapp_events_total counter");
});

Deno.test("metrics - default labels are included", () => {
  const m = createMetrics({ defaultLabels: { env: "test" } });
  const c = m.counter({ name: "req_total", help: "Requests" });
  c.inc();
  const out = m.serialize();
  assertStringIncludes(out, 'req_total{env="test"} 1');
});

Deno.test("metrics - default labels merge with metric labels", () => {
  const m = createMetrics({ defaultLabels: { env: "prod" } });
  const c = m.counter({
    name: "req_total",
    help: "Requests",
    labels: ["method"],
  });
  c.inc({ method: "GET" });
  const out = m.serialize();
  assertStringIncludes(out, 'req_total{env="prod",method="GET"} 1');
});

Deno.test("metrics - HELP and TYPE lines in output", () => {
  const m = createMetrics();
  m.counter({ name: "c", help: "A counter" });
  m.gauge({ name: "g", help: "A gauge" });
  m.histogram({ name: "h", help: "A histogram", buckets: [1] });
  const out = m.serialize();
  assertStringIncludes(out, "# HELP c A counter");
  assertStringIncludes(out, "# TYPE c counter");
  assertStringIncludes(out, "# HELP g A gauge");
  assertStringIncludes(out, "# TYPE g gauge");
  assertStringIncludes(out, "# HELP h A histogram");
  assertStringIncludes(out, "# TYPE h histogram");
});

Deno.test("metrics - label value escaping", () => {
  const m = createMetrics();
  const c = m.counter({
    name: "test",
    help: "Test",
    labels: ["path"],
  });
  c.inc({ path: '/api/"v1"' });
  const out = m.serialize();
  assertStringIncludes(out, 'path="/api/\\"v1\\""');
});

Deno.test("metrics - contentType is correct", () => {
  const m = createMetrics();
  assertEquals(
    m.contentType,
    "text/plain; version=0.0.4; charset=utf-8",
  );
});

Deno.test("metrics - serialize ends with newline", () => {
  const m = createMetrics();
  m.counter({ name: "c", help: "Counter" });
  const out = m.serialize();
  assertEquals(out.endsWith("\n"), true);
});

Deno.test("metrics - labels sorted alphabetically", () => {
  const m = createMetrics();
  const c = m.counter({
    name: "test",
    help: "Test",
    labels: ["z_label", "a_label"],
  });
  c.inc({ z_label: "z", a_label: "a" });
  const out = m.serialize();
  assertStringIncludes(out, 'test{a_label="a",z_label="z"} 1');
});
