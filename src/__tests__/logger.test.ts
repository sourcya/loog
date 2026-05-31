import { assertEquals } from "@std/assert";
import { createLogger } from "../logger.ts";

function captureOutput(
  fn: () => void,
): { stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const origLog = console.log;
  const origError = console.error;
  console.log = (msg: string) => stdout.push(msg);
  console.error = (msg: string) => stderr.push(msg);
  try {
    fn();
  } finally {
    console.log = origLog;
    console.error = origError;
  }
  return { stdout, stderr };
}

function parseLog(line: string): Record<string, unknown> {
  return JSON.parse(line) as Record<string, unknown>;
}

Deno.test("logger - emits JSON with required fields", () => {
  const log = createLogger("test-module", {
    timestamp: () => "2026-01-01T00:00:00.000Z",
  });
  const { stdout } = captureOutput(() => log.info("hello"));
  assertEquals(stdout.length, 1);
  const entry = parseLog(stdout[0]);
  assertEquals(entry.ts, "2026-01-01T00:00:00.000Z");
  assertEquals(entry.level, "info");
  assertEquals(entry.module, "test-module");
  assertEquals(entry.msg, "hello");
});

Deno.test("logger - includes extra fields", () => {
  const log = createLogger("mod", {
    timestamp: () => "T",
  });
  const { stdout } = captureOutput(() =>
    log.info("req", { method: "GET", status: 200 })
  );
  const entry = parseLog(stdout[0]);
  assertEquals(entry.method, "GET");
  assertEquals(entry.status, 200);
});

Deno.test("logger - level filtering drops lower levels", () => {
  const log = createLogger("mod", { level: "warn", timestamp: () => "T" });
  const { stdout, stderr } = captureOutput(() => {
    log.debug("nope");
    log.info("nope");
    log.warn("yes");
    log.error("yes");
  });
  assertEquals(stdout.length, 1);
  assertEquals(stderr.length, 1);
  assertEquals(parseLog(stdout[0]).level, "warn");
  assertEquals(parseLog(stderr[0]).level, "error");
});

Deno.test("logger - error level writes to stderr", () => {
  const log = createLogger("mod", { timestamp: () => "T" });
  const { stdout, stderr } = captureOutput(() => {
    log.info("info msg");
    log.error("error msg");
  });
  assertEquals(stdout.length, 1);
  assertEquals(stderr.length, 1);
  assertEquals(parseLog(stderr[0]).msg, "error msg");
});

Deno.test("logger - child merges fields", () => {
  const log = createLogger("mod", {
    timestamp: () => "T",
    fields: { service: "api" },
  });
  const child = log.child({ requestId: "abc" });
  const { stdout } = captureOutput(() => child.info("hi"));
  const entry = parseLog(stdout[0]);
  assertEquals(entry.service, "api");
  assertEquals(entry.requestId, "abc");
  assertEquals(entry.module, "mod");
});

Deno.test("logger - child fields override parent fields", () => {
  const log = createLogger("mod", {
    timestamp: () => "T",
    fields: { env: "dev" },
  });
  const child = log.child({ env: "prod" });
  const { stdout } = captureOutput(() => child.info("hi"));
  assertEquals(parseLog(stdout[0]).env, "prod");
});

Deno.test("logger - child inherits level", () => {
  const log = createLogger("mod", { level: "error", timestamp: () => "T" });
  const child = log.child({ x: 1 });
  const { stdout, stderr } = captureOutput(() => {
    child.info("nope");
    child.error("yes");
  });
  assertEquals(stdout.length, 0);
  assertEquals(stderr.length, 1);
});

Deno.test("logger - serializes Error objects safely", () => {
  const log = createLogger("mod", { timestamp: () => "T" });
  const err = new Error("boom");
  const { stderr } = captureOutput(() => log.error("failed", { err }));
  const entry = parseLog(stderr[0]);
  const serializedErr = entry.err as Record<string, unknown>;
  assertEquals(serializedErr.message, "boom");
  assertEquals(serializedErr.name, "Error");
  assertEquals(typeof serializedErr.stack, "string");
});

Deno.test("logger - debug level allows all messages", () => {
  const log = createLogger("mod", { level: "debug", timestamp: () => "T" });
  const { stdout } = captureOutput(() => {
    log.debug("d");
    log.info("i");
    log.warn("w");
  });
  assertEquals(stdout.length, 3);
});
