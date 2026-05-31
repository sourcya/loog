/**
 * Custom metrics example — creating and observing Prometheus metrics.
 *
 * Run: deno run examples/custom-metrics.ts
 */

import { createMetrics } from "../src/metrics.ts";

// Create a registry with a prefix and default labels
const metrics = createMetrics({
  prefix: "myapp_",
  defaultLabels: { service: "payment-api", env: "production" },
});

// Counter — track total events
const ordersTotal = metrics.counter({
  name: "orders_total",
  help: "Total orders processed",
  labels: ["status", "payment_method"],
});

// Simulate some orders
ordersTotal.inc({ status: "completed", payment_method: "credit_card" });
ordersTotal.inc({ status: "completed", payment_method: "credit_card" });
ordersTotal.inc({ status: "completed", payment_method: "paypal" });
ordersTotal.inc({ status: "failed", payment_method: "credit_card" });

// Gauge — track current state
const activeConnections = metrics.gauge({
  name: "active_connections",
  help: "Current number of active connections",
  labels: ["pool"],
});

activeConnections.set({ pool: "primary" }, 15);
activeConnections.set({ pool: "replica" }, 8);
activeConnections.inc({ pool: "primary" }); // now 16
activeConnections.dec({ pool: "replica" }, 3); // now 5

// Histogram — track distributions
const requestDuration = metrics.histogram({
  name: "request_duration_seconds",
  help: "HTTP request duration in seconds",
  labels: ["method", "route"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
});

// Simulate some request durations
requestDuration.observe({ method: "GET", route: "/api/orders" }, 0.023);
requestDuration.observe({ method: "GET", route: "/api/orders" }, 0.045);
requestDuration.observe({ method: "GET", route: "/api/orders" }, 0.112);
requestDuration.observe({ method: "POST", route: "/api/orders" }, 0.350);
requestDuration.observe({ method: "POST", route: "/api/orders" }, 2.100);

// Serialize to Prometheus text format
console.log("=== Prometheus Text Format ===\n");
console.log(metrics.serialize());
