/**
 * Shared type definitions for the loog observability library.
 *
 * @module
 */

/** Supported log levels in ascending severity order. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Configuration options for creating a logger instance. */
export interface LoggerOptions {
  /** Minimum log level to emit. Messages below this level are silently dropped. Defaults to `"info"`. */
  level?: LogLevel;
  /** Base fields included in every log entry produced by this logger. */
  fields?: Record<string, unknown>;
  /** Custom timestamp function. Defaults to `() => new Date().toISOString()`. */
  timestamp?: () => string;
}

/** A structured JSON logger that writes one JSON line per log call. */
export interface Logger {
  /** Emit a debug-level log entry. */
  debug(msg: string, fields?: Record<string, unknown>): void;
  /** Emit an info-level log entry. */
  info(msg: string, fields?: Record<string, unknown>): void;
  /** Emit a warn-level log entry. */
  warn(msg: string, fields?: Record<string, unknown>): void;
  /** Emit an error-level log entry. Written to stderr. */
  error(msg: string, fields?: Record<string, unknown>): void;
  /**
   * Create a child logger that inherits this logger's module, level, and fields,
   * with additional fields merged in. Child fields override parent fields on key collision.
   */
  child(fields: Record<string, unknown>): Logger;
}

/** Configuration for creating a metrics registry. */
export interface MetricsOptions {
  /** String prepended to all metric names (e.g. `"myapp_"`). */
  prefix?: string;
  /** Labels applied to every metric in the registry. */
  defaultLabels?: Record<string, string>;
}

/** Configuration for creating a counter or gauge metric. */
export interface MetricConfig<L extends string = string> {
  /** Metric name (e.g. `"http_requests_total"`). Must match `[a-zA-Z_:][a-zA-Z0-9_:]*`. */
  name: string;
  /** Human-readable description shown in `# HELP`. */
  help: string;
  /** Label names for this metric. */
  labels?: readonly L[];
}

/** Configuration for creating a histogram metric. */
export interface HistogramConfig<L extends string = string>
  extends MetricConfig<L> {
  /** Observation bucket boundaries. Defaults to `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]`. */
  buckets?: number[];
}

/** A monotonically increasing counter metric. */
export interface Counter<L extends string = string> {
  /** Increment the counter. Value must be non-negative (defaults to 1). */
  inc(labels?: Record<L, string>, value?: number): void;
}

/** A metric that can go up and down. */
export interface Gauge<L extends string = string> {
  /** Set the gauge to an arbitrary value. */
  set(labels: Record<L, string>, value: number): void;
  /** Increment the gauge (defaults to 1). */
  inc(labels?: Record<L, string>, value?: number): void;
  /** Decrement the gauge (defaults to 1). */
  dec(labels?: Record<L, string>, value?: number): void;
}

/** A metric that tracks the distribution of observed values in configurable buckets. */
export interface Histogram<L extends string = string> {
  /** Record an observed value. */
  observe(labels: Record<L, string>, value: number): void;
}

/** A Prometheus metrics registry that manages metric instances and serializes them. */
export interface Metrics {
  /**
   * Create and register a counter metric.
   *
   * @example
   * ```ts
   * const requests = metrics.counter({ name: "http_requests_total", help: "Total requests" });
   * requests.inc();
   * ```
   */
  counter<Labels extends string = string>(
    config: MetricConfig<Labels>,
  ): Counter<Labels>;

  /**
   * Create and register a histogram metric.
   *
   * @example
   * ```ts
   * const duration = metrics.histogram({
   *   name: "request_duration_seconds",
   *   help: "Request duration",
   *   labels: ["method"],
   *   buckets: [0.1, 0.5, 1, 5],
   * });
   * duration.observe({ method: "GET" }, 0.42);
   * ```
   */
  histogram<Labels extends string = string>(
    config: HistogramConfig<Labels>,
  ): Histogram<Labels>;

  /**
   * Create and register a gauge metric.
   *
   * @example
   * ```ts
   * const connections = metrics.gauge({ name: "active_connections", help: "Open connections" });
   * connections.inc();
   * ```
   */
  gauge<Labels extends string = string>(
    config: MetricConfig<Labels>,
  ): Gauge<Labels>;

  /** Serialize all registered metrics to Prometheus text exposition format. */
  serialize(): string;

  /** The MIME content type for the Prometheus text format. */
  contentType: string;
}
