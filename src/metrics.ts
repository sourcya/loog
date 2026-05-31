/**
 * Native Prometheus metrics — zero npm dependencies.
 *
 * Implements Counter, Gauge, and Histogram metric types with full
 * Prometheus text exposition format serialization. No dependency on
 * `prom-client` or any npm package.
 *
 * @example
 * ```ts
 * import { createMetrics } from "@sourcya/loog/metrics";
 *
 * const metrics = createMetrics({ prefix: "myapp_" });
 *
 * const requests = metrics.counter({
 *   name: "http_requests_total",
 *   help: "Total HTTP requests",
 *   labels: ["method", "status"],
 * });
 * requests.inc({ method: "GET", status: "200" });
 *
 * console.log(metrics.serialize());
 * // # HELP myapp_http_requests_total Total HTTP requests
 * // # TYPE myapp_http_requests_total counter
 * // myapp_http_requests_total{method="GET",status="200"} 1
 * ```
 *
 * @module
 */

import type {
  Counter,
  Gauge,
  Histogram,
  HistogramConfig,
  MetricConfig,
  Metrics,
  MetricsOptions,
} from "./types.ts";

/** Default histogram buckets matching OpenTelemetry HTTP recommendations. */
const DEFAULT_BUCKETS: readonly number[] = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

/** Prometheus text exposition content type. */
const CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

/**
 * Escape a label value for Prometheus text format.
 * Backslash, double-quote, and newline are escaped.
 */
function escapeLabelValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

/**
 * Serialize a label set into Prometheus format: `{key="value",key2="value2"}`.
 * Returns empty string if no labels. Keys are sorted alphabetically for stable output.
 */
function serializeLabels(
  labels: Record<string, string>,
  defaultLabels?: Record<string, string>,
): string {
  const merged: Record<string, string> = { ...defaultLabels, ...labels };
  const keys: string[] = Object.keys(merged).sort();
  if (keys.length === 0) return "";
  const pairs: string = keys
    .map((k) => `${k}="${escapeLabelValue(merged[k])}"`)
    .join(",");
  return `{${pairs}}`;
}

/**
 * Build a cache key from a label set. Used as the map key for per-label-set values.
 */
function labelKey(labels: Record<string, string>): string {
  const keys: string[] = Object.keys(labels).sort();
  if (keys.length === 0) return "";
  return keys.map((k) => `${k}=${labels[k]}`).join(",");
}

/** Format a number for Prometheus output. Integers stay clean, floats keep precision. */
function formatValue(n: number): string {
  if (Number.isNaN(n)) return "NaN";
  if (!Number.isFinite(n)) return n > 0 ? "+Inf" : "-Inf";
  return Object.is(n, -0) ? "0" : String(n);
}

// ─── Internal Metric Types ──────────────────────────────────────

type MetricType = "counter" | "gauge" | "histogram";

interface MetricEntry {
  name: string;
  help: string;
  type: MetricType;
  labelNames: readonly string[];
  serialize(defaultLabels?: Record<string, string>): string;
}

class CounterImpl implements MetricEntry {
  readonly type = "counter" as const;
  readonly labelNames: readonly string[];
  private values: Map<string, { labels: Record<string, string>; value: number }> =
    new Map();

  constructor(
    readonly name: string,
    readonly help: string,
    labels?: readonly string[],
  ) {
    this.labelNames = labels ?? [];
  }

  inc(labels: Record<string, string>, value: number): void {
    if (value < 0) throw new Error("Counter value must be non-negative");
    const key: string = labelKey(labels);
    const existing = this.values.get(key);
    if (existing) {
      existing.value += value;
    } else {
      this.values.set(key, { labels: { ...labels }, value });
    }
  }

  serialize(defaultLabels?: Record<string, string>): string {
    const lines: string[] = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} counter`);
    if (this.values.size === 0 && this.labelNames.length === 0) {
      lines.push(`${this.name}${serializeLabels({}, defaultLabels)} 0`);
    }
    for (const { labels, value } of this.values.values()) {
      lines.push(
        `${this.name}${serializeLabels(labels, defaultLabels)} ${formatValue(value)}`,
      );
    }
    return lines.join("\n");
  }
}

class GaugeImpl implements MetricEntry {
  readonly type = "gauge" as const;
  readonly labelNames: readonly string[];
  private values: Map<string, { labels: Record<string, string>; value: number }> =
    new Map();

  constructor(
    readonly name: string,
    readonly help: string,
    labels?: readonly string[],
  ) {
    this.labelNames = labels ?? [];
  }

  private getOrCreate(labels: Record<string, string>): { labels: Record<string, string>; value: number } {
    const key: string = labelKey(labels);
    let entry = this.values.get(key);
    if (!entry) {
      entry = { labels: { ...labels }, value: 0 };
      this.values.set(key, entry);
    }
    return entry;
  }

  set(labels: Record<string, string>, value: number): void {
    this.getOrCreate(labels).value = value;
  }

  inc(labels: Record<string, string>, value: number): void {
    this.getOrCreate(labels).value += value;
  }

  dec(labels: Record<string, string>, value: number): void {
    this.getOrCreate(labels).value -= value;
  }

  serialize(defaultLabels?: Record<string, string>): string {
    const lines: string[] = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} gauge`);
    if (this.values.size === 0 && this.labelNames.length === 0) {
      lines.push(`${this.name}${serializeLabels({}, defaultLabels)} 0`);
    }
    for (const { labels, value } of this.values.values()) {
      lines.push(
        `${this.name}${serializeLabels(labels, defaultLabels)} ${formatValue(value)}`,
      );
    }
    return lines.join("\n");
  }
}

interface BucketData {
  labels: Record<string, string>;
  counts: number[];
  sum: number;
  count: number;
}

class HistogramImpl implements MetricEntry {
  readonly type = "histogram" as const;
  readonly labelNames: readonly string[];
  readonly buckets: readonly number[];
  private observations: Map<string, BucketData> = new Map();

  constructor(
    readonly name: string,
    readonly help: string,
    labels?: readonly string[],
    buckets?: number[],
  ) {
    this.labelNames = labels ?? [];
    this.buckets = buckets
      ? [...buckets].sort((a, b) => a - b)
      : DEFAULT_BUCKETS;
  }

  observe(labels: Record<string, string>, value: number): void {
    const key: string = labelKey(labels);
    let data = this.observations.get(key);
    if (!data) {
      data = {
        labels: { ...labels },
        counts: new Array(this.buckets.length).fill(0) as number[],
        sum: 0,
        count: 0,
      };
      this.observations.set(key, data);
    }
    data.sum += value;
    data.count += 1;
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) {
        data.counts[i] += 1;
        break;
      }
    }
  }

  serialize(defaultLabels?: Record<string, string>): string {
    const lines: string[] = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} histogram`);

    for (const data of this.observations.values()) {
      const baseLabels: Record<string, string> = {
        ...defaultLabels,
        ...data.labels,
      };
      let cumulative = 0;
      for (let i = 0; i < this.buckets.length; i++) {
        cumulative += data.counts[i];
        const bucketLabels: Record<string, string> = {
          ...baseLabels,
          le: formatValue(this.buckets[i]),
        };
        lines.push(
          `${this.name}_bucket${serializeLabels(bucketLabels)} ${cumulative}`,
        );
      }
      cumulative += 0;
      const infLabels: Record<string, string> = {
        ...baseLabels,
        le: "+Inf",
      };
      lines.push(
        `${this.name}_bucket${serializeLabels(infLabels)} ${data.count}`,
      );
      lines.push(
        `${this.name}_sum${serializeLabels({ ...defaultLabels, ...data.labels })} ${formatValue(data.sum)}`,
      );
      lines.push(
        `${this.name}_count${serializeLabels({ ...defaultLabels, ...data.labels })} ${data.count}`,
      );
    }
    return lines.join("\n");
  }
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Create a Prometheus metrics registry.
 *
 * @param options - Registry configuration (prefix, default labels).
 * @returns A {@link Metrics} instance for creating and serializing metrics.
 *
 * @example
 * ```ts
 * import { createMetrics } from "@sourcya/loog/metrics";
 *
 * const metrics = createMetrics({ prefix: "myapp_", defaultLabels: { env: "prod" } });
 * const counter = metrics.counter({ name: "events_total", help: "Total events" });
 * counter.inc();
 * console.log(metrics.serialize());
 * ```
 */
export function createMetrics(options?: MetricsOptions): Metrics {
  const prefix: string = options?.prefix ?? "";
  const defaultLabels: Record<string, string> | undefined =
    options?.defaultLabels;
  const registry: MetricEntry[] = [];

  return {
    counter<Labels extends string = string>(
      config: MetricConfig<Labels>,
    ): Counter<Labels> {
      const impl = new CounterImpl(
        prefix + config.name,
        config.help,
        config.labels,
      );
      registry.push(impl);
      return {
        inc(labels?: Record<Labels, string>, value?: number): void {
          impl.inc(
            (labels ?? {}) as Record<string, string>,
            value ?? 1,
          );
        },
      };
    },

    histogram<Labels extends string = string>(
      config: HistogramConfig<Labels>,
    ): Histogram<Labels> {
      const impl = new HistogramImpl(
        prefix + config.name,
        config.help,
        config.labels,
        config.buckets,
      );
      registry.push(impl);
      return {
        observe(labels: Record<Labels, string>, value: number): void {
          impl.observe(labels as Record<string, string>, value);
        },
      };
    },

    gauge<Labels extends string = string>(
      config: MetricConfig<Labels>,
    ): Gauge<Labels> {
      const impl = new GaugeImpl(
        prefix + config.name,
        config.help,
        config.labels,
      );
      registry.push(impl);
      return {
        set(labels: Record<Labels, string>, value: number): void {
          impl.set(labels as Record<string, string>, value);
        },
        inc(labels?: Record<Labels, string>, value?: number): void {
          impl.inc(
            (labels ?? {}) as Record<string, string>,
            value ?? 1,
          );
        },
        dec(labels?: Record<Labels, string>, value?: number): void {
          impl.dec(
            (labels ?? {}) as Record<string, string>,
            value ?? 1,
          );
        },
      };
    },

    serialize(): string {
      return registry.map((m) => m.serialize(defaultLabels)).join("\n\n") +
        "\n";
    },

    contentType: CONTENT_TYPE,
  };
}

export type {
  Counter,
  Gauge,
  Histogram,
  HistogramConfig,
  MetricConfig,
  Metrics,
  MetricsOptions,
} from "./types.ts";
