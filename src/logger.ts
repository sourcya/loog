/**
 * Structured JSON logger for Loki/Promtail ingestion.
 *
 * Outputs one JSON line per log call to stdout (debug/info/warn) or stderr (error).
 * Designed for structured log aggregation — every field is a top-level JSON key,
 * making it trivially parseable by Promtail, Grafana Alloy, or any JSON log pipeline.
 *
 * @example
 * ```ts
 * import { createLogger } from "@sourcya/loog/logger";
 *
 * const log = createLogger("my-service");
 * log.info("Server started", { port: 3000 });
 * // {"ts":"2026-05-31T12:00:00.000Z","level":"info","module":"my-service","msg":"Server started","port":3000}
 *
 * const child = log.child({ requestId: "abc-123" });
 * child.warn("Slow query", { duration: 1200 });
 * // {"ts":"...","level":"warn","module":"my-service","msg":"Slow query","requestId":"abc-123","duration":1200}
 * ```
 *
 * @module
 */

import type { Logger, LoggerOptions, LogLevel } from "./types.ts";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Safely serialize a value for JSON output. Converts Error objects into
 * plain objects with `message`, `name`, and `stack` fields so they survive
 * `JSON.stringify` (which normally serializes Errors as `{}`).
 */
function safeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  return value;
}

/**
 * Build a flat record of fields with Error objects converted to plain objects.
 */
function safeFields(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(fields)) {
    result[key] = safeValue(fields[key]);
  }
  return result;
}

/**
 * Create a structured JSON logger.
 *
 * @param module - Module name included in every log entry as the `module` field.
 * @param options - Logger configuration.
 * @returns A {@link Logger} instance.
 *
 * @example
 * ```ts
 * import { createLogger } from "@sourcya/loog/logger";
 *
 * const log = createLogger("app", { level: "debug" });
 * log.debug("initializing");
 * log.info("ready", { port: 3000 });
 * log.error("crash", { err: new Error("boom") });
 * ```
 */
export function createLogger(
  module: string,
  options?: LoggerOptions,
): Logger {
  const minLevel: LogLevel = options?.level ?? "info";
  const baseFields: Record<string, unknown> = options?.fields ?? {};
  const timestamp: () => string =
    options?.timestamp ?? (() => new Date().toISOString());

  function emit(
    level: LogLevel,
    msg: string,
    fields?: Record<string, unknown>,
  ): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minLevel]) return;

    const entry: Record<string, unknown> = {
      ts: timestamp(),
      level,
      module,
      msg,
      ...safeFields(baseFields),
      ...(fields ? safeFields(fields) : undefined),
    };

    const line: string = JSON.stringify(entry);

    if (level === "error") {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  return {
    debug(msg: string, fields?: Record<string, unknown>): void {
      emit("debug", msg, fields);
    },
    info(msg: string, fields?: Record<string, unknown>): void {
      emit("info", msg, fields);
    },
    warn(msg: string, fields?: Record<string, unknown>): void {
      emit("warn", msg, fields);
    },
    error(msg: string, fields?: Record<string, unknown>): void {
      emit("error", msg, fields);
    },
    child(fields: Record<string, unknown>): Logger {
      return createLogger(module, {
        level: minLevel,
        fields: { ...baseFields, ...fields },
        timestamp,
      });
    },
  };
}

export type { Logger, LoggerOptions, LogLevel } from "./types.ts";
