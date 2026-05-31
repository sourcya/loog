/**
 * Basic logger example — standalone structured logging without any framework.
 *
 * Run: deno run examples/basic-logger.ts
 */

import { createLogger } from "../src/logger.ts";

// Create a logger with a module name
const log = createLogger("my-service", { level: "debug" });

// Log at different levels
log.debug("Initializing service");
log.info("Server started", { port: 3000, env: "development" });
log.warn("Deprecated endpoint called", { path: "/api/v1/legacy" });

// Error objects are serialized safely (message, name, stack)
try {
  throw new Error("Connection refused");
} catch (err) {
  log.error("Database connection failed", { err, retryIn: 5000 });
}

// Child loggers inherit parent fields and add their own
const dbLog = log.child({ component: "database" });
dbLog.info("Connected", { host: "localhost", db: "mydb" });

const queryLog = dbLog.child({ queryId: "q-123" });
queryLog.debug("Executing query", { sql: "SELECT * FROM users" });

// Level filtering — only "warn" and above
const prodLog = createLogger("prod-service", { level: "warn" });
prodLog.debug("This won't appear");
prodLog.info("This won't appear either");
prodLog.warn("This will appear");
prodLog.error("This will appear too");
