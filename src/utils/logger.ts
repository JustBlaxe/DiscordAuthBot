type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  message?: string;
  [key: string]: unknown;
}

const c = {
  r: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

const LOG_JSON = process.env.LOG_FORMAT === "json";

function formatTimestamp(): string {
  return new Date().toISOString();
}

function output(level: LogLevel, event: string, data: Record<string, unknown> = {}) {
  const entry: LogEntry = {
    timestamp: formatTimestamp(),
    level,
    event,
    ...data,
  };

  if (LOG_JSON) {
    console.log(JSON.stringify(entry));
    return;
  }

  const ts = `${c.gray}${entry.timestamp}${c.r}`;
  const levelColors: Record<LogLevel, string> = {
    debug: c.gray,
    info: c.blue,
    warn: c.yellow,
    error: c.red,
  };
  const lvl = `${levelColors[level]}${level.toUpperCase().padEnd(5)}${c.r}`;

  const extra = Object.keys(data).length > 0
    ? ` ${c.gray}${JSON.stringify(data)}${c.r}`
    : "";

  console.log(`${ts} ${lvl} ${event}${extra}`);
}

export const log = {
  debug: (event: string, data?: Record<string, unknown>) => output("debug", event, data),
  info: (event: string, data?: Record<string, unknown>) => output("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) => output("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) => output("error", event, data),

  ok: (msg: string) => output("info", msg),

  verified: (user: string, ip: string) =>
    output("info", "user_verified", { user, ip }),

  blocked: (user: string, reason: string) =>
    output("warn", "user_blocked", { user, reason }),

  vpn: (ip: string, isp: string) =>
    output("info", "vpn_detected", { ip, isp }),
};
