/**
 * Full Oak app example — structured logging + Prometheus metrics middleware.
 *
 * Run: deno run --allow-net examples/oak-app.ts
 * Then: curl http://localhost:8081/api/items
 *       curl http://localhost:8081/metrics
 */

import { Application, Router } from "@oak/oak";
import { createLogger } from "../src/logger.ts";
import { createMetrics } from "../src/metrics.ts";
import {
  oakHttpLogger,
  oakHttpMetrics,
  oakMetricsEndpoint,
} from "../src/oak/mod.ts";

// Create observability instances
const logger = createLogger("oak-example", { level: "debug" });
const metrics = createMetrics({ prefix: "oak_example_" });

// Custom business metric
const itemsServed = metrics.counter({
  name: "items_served_total",
  help: "Total items served from the API",
});

const app = new Application();

// Request ID middleware (Oak doesn't have one built-in)
app.use(async (ctx, next) => {
  const requestId = ctx.request.headers.get("X-Request-ID") ??
    crypto.randomUUID();
  ctx.state.requestId = requestId;
  ctx.response.headers.set("X-Request-ID", requestId);
  await next();
});

// Wire up loog middleware
app.use(oakHttpLogger({ logger }));
app.use(oakHttpMetrics({ metrics }));

// Metrics endpoint
const metricsRouter = oakMetricsEndpoint(metrics);
app.use(metricsRouter.routes());
app.use(metricsRouter.allowedMethods());

// Application routes
const router = new Router();

router.get("/healthz", (ctx) => {
  ctx.response.body = { status: "ok" };
});

router.get("/api/items", (ctx) => {
  const log = logger.child({ requestId: ctx.state.requestId as string });
  log.info("Fetching items");
  itemsServed.inc(undefined, 3);
  ctx.response.body = {
    items: [
      { id: 1, name: "Widget" },
      { id: 2, name: "Gadget" },
      { id: 3, name: "Doohickey" },
    ],
  };
});

router.get("/api/items/:id", (ctx) => {
  const id = ctx.params.id;
  const log = logger.child({
    requestId: ctx.state.requestId as string,
    itemId: id,
  });
  log.info("Fetching item details");
  itemsServed.inc();
  ctx.response.body = { id, name: "Widget", price: 9.99 };
});

app.use(router.routes());
app.use(router.allowedMethods());

// Start server
logger.info("Starting Oak server", { port: 8081 });
await app.listen({ port: 8081 });
