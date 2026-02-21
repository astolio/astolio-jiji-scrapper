// src/telemetry/telemetry.ts
import { Bot } from "grammy";

type Level = "INFO" | "WARN" | "ERROR" | "SUCCESS";

export type LogPayload = {
  title: string;
  level?: Level;
  details?: Record<string, unknown>;
  tags?: string[];
  hint?: string;
};

export type ErrorPayload = {
  title: string;
  err: unknown;
  details?: Record<string, unknown>;
  tags?: string[];
};

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID_RAW = process.env.TELEGRAM_CHAT_ID;

const APP_NAME = process.env.APP_NAME ?? "worker";
const RUN_ENV = process.env.RUN_ENV ?? "dev";

const enabled = Boolean(BOT_TOKEN && CHAT_ID_RAW);

const bot = enabled ? new Bot(String(BOT_TOKEN)) : null;

// If TELEGRAM_CHAT_ID is numeric (-100...), prefer number for stricter typing.
// Otherwise it might be @channelusername (string).
const chatId: number | string | null = !enabled
  ? null
  : (() => {
      const raw = String(CHAT_ID_RAW);
      const n = Number(raw);
      return Number.isFinite(n) ? n : raw;
    })();

// Simple spam control: coalesce repeats within window
const recent = new Map<string, number>();
const COALESCE_WINDOW_MS = 20_000;

function nowIso() {
  return new Date().toISOString();
}

function levelEmoji(level: Level) {
  switch (level) {
    case "SUCCESS":
      return "✅";
    case "WARN":
      return "⚠️";
    case "ERROR":
      return "🧨";
    case "INFO":
    default:
      return "ℹ️";
  }
}

function safeJson(v: unknown) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function formatKv(details?: Record<string, unknown>) {
  if (!details || Object.keys(details).length === 0) return "";
  return Object.entries(details)
    .map(([k, v]) => `• ${k}: ${String(v)}`)
    .join("\n");
}

function toErrorLike(err: unknown): { name?: string; message: string; stack?: string } {
  if (err instanceof Error) {
    return { name: err.name, message: err.message || String(err), stack: err.stack };
  }
  return { message: typeof err === "string" ? err : safeJson(err) };
}

function shouldCoalesce(key: string) {
  const t = Date.now();
  const last = recent.get(key) ?? 0;
  if (t - last < COALESCE_WINDOW_MS) return true;
  recent.set(key, t);
  return false;
}

function trimStack(stack: string) {
  // keep it readable; telegram messages have limits
  return stack.split("\n").slice(0, 25).join("\n");
}

function escapeHtml(s: string) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function send(text: string) {
  if (!enabled || !bot || chatId == null) return;

  try {
    await bot.api.sendMessage(chatId, text, {
      parse_mode: "HTML",
      // Bot API 7+ (grammY types): disable previews the correct way
      link_preview_options: { is_disabled: true },
    });
  } catch (e) {
    // never crash your app because Telegram is down
    console.error("telemetry.send failed:", e);
  }
}

export const telemetry = {
  enabled,

  async log(p: LogPayload) {
    const level: Level = p.level ?? "INFO";
    const emoji = levelEmoji(level);

    const header = `<b>${emoji} ${escapeHtml(APP_NAME)} • ${level}</b>`;
    const meta = `<i>${escapeHtml(nowIso())} • ${escapeHtml(RUN_ENV)}</i>`;
    const title = `<b>${escapeHtml(p.title)}</b>`;

    const tags = p.tags?.length ? `\n<i>tags:</i> ${p.tags.map((t) => `#${escapeHtml(t)}`).join(" ")}` : "";
    const hint = p.hint ? `\n<i>hint:</i> ${escapeHtml(p.hint)}` : "";
    const kv = p.details ? `\n\n${escapeHtml(formatKv(p.details))}` : "";

    const body = `${header}\n${meta}\n\n${title}${tags}${hint}${kv}`;

    // coalesce identical title+level to avoid spam (except errors)
    const key = `${level}:${p.title}`;
    if (level !== "ERROR" && shouldCoalesce(key)) return;

    await send(body);
  },

  async error(p: ErrorPayload) {
    const e = toErrorLike(p.err);

    const header = `<b>${levelEmoji("ERROR")} ${escapeHtml(APP_NAME)} • ERROR</b>`;
    const meta = `<i>${escapeHtml(nowIso())} • ${escapeHtml(RUN_ENV)}</i>`;
    const title = `<b>${escapeHtml(p.title)}</b>`;

    const tags = p.tags?.length ? `\n<i>tags:</i> ${p.tags.map((t) => `#${escapeHtml(t)}`).join(" ")}` : "";
    const kv = p.details ? `\n\n${escapeHtml(formatKv(p.details))}` : "";

    const errName = e.name ? `\n\n<b>name:</b> ${escapeHtml(e.name)}` : "";
    const errMsg = `\n<b>message:</b>\n${escapeHtml(e.message)}`;
    const errStack = e.stack ? `\n\n<b>stack:</b>\n<pre>${escapeHtml(trimStack(e.stack))}</pre>` : "";

    const body = `${header}\n${meta}\n\n${title}${tags}${kv}${errName}${errMsg}${errStack}`;

    await send(body);
  },
};