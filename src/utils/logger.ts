/**
 * brain-memory — Structured Logger
 *
 * Unified logging with levels, timestamps, and module labels.
 * Controlled via BM_LOG_LEVEL env var: error | warn | info | debug
 * Default level: info (error + warn + info visible, debug hidden)
 *
 * Usage:
 *   import { logger } from "./utils/logger";
 *   logger.error("module", "something broke", extraData);
 *   logger.warn("module", "something might be wrong");
 *   logger.info("module", "status update");
 *   logger.debug("module", "detailed trace");
 */

// ─── Levels ─────────────────────────────────────────────────────

export type LogLevel = "error" | "warn" | "info" | "debug";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

/**
 * Determine the current minimum log level from BM_LOG_LEVEL env var.
 * Falls back to "info" if not set or invalid.
 */
function getMinLevel(): LogLevel {
  const raw = (process.env.BM_LOG_LEVEL || "").toLowerCase().trim();
  if (raw in LEVEL_PRIORITY) return raw as LogLevel;
  return "info";
}

// ─── Formatting ────────────────────────────────────────────────

function formatTime(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${now.getMilliseconds().toString().padStart(3, "0")}`;
}

function levelLabel(level: LogLevel): string {
  switch (level) {
    case "error": return "ERROR";
    case "warn":  return "WARN ";
    case "info":  return "INFO ";
    case "debug": return "DEBUG";
  }
}

// ─── Public API ────────────────────────────────────────────────

function emit(level: LogLevel, module: string, message: string, ...args: unknown[]): void {
  if (LEVEL_PRIORITY[level] > LEVEL_PRIORITY[getMinLevel()]) return;

  const prefix = `[brain-memory][${formatTime()}][${levelLabel(level)}][${module}]`;
  switch (level) {
    case "error":
      console.error(prefix, message, ...args);
      break;
    case "warn":
      console.warn(prefix, message, ...args);
      break;
    case "info":
      console.log(prefix, message, ...args);
      break;
    case "debug":
      console.log(prefix, message, ...args);
      break;
  }
}

export const logger = {
  error(module: string, message: string, ...args: unknown[]) { emit("error", module, message, ...args); },
  warn(module: string, message: string, ...args: unknown[]) { emit("warn", module, message, ...args); },
  info(module: string, message: string, ...args: unknown[]) { emit("info", module, message, ...args); },
  debug(module: string, message: string, ...args: unknown[]) { emit("debug", module, message, ...args); },
  /** Check if a level is currently enabled */
  isEnabled(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] <= LEVEL_PRIORITY[getMinLevel()];
  },
};
