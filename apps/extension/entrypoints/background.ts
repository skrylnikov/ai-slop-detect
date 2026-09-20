import { defineBackground } from "wxt/utils/define-background";
import { browser } from "wxt/browser";
import { validMessage, validSender, type BackgroundResponse, type ClientMessage } from "../src/messages.js";
import type { PublicVote } from "@ai-slop-labels/api/contracts";
import { readToken, writeToken } from "../src/storage.js";

const apiOrigin = import.meta.env.WXT_API_ORIGIN ?? "http://127.0.0.1:4310";
function verifier(): string { const bytes = new Uint8Array(32); crypto.getRandomValues(bytes); return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
async function challenge(value: string): Promise<string> { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
async function request(path: string, init: RequestInit = {}): Promise<Response> { const token = await readToken(); const headers = new Headers(init.headers); if (token) headers.set("authorization", `Bearer ${token}`); headers.set("content-type", "application/json"); return fetch(`${apiOrigin}${path}`, { ...init, headers }); }
async function handle(message: ClientMessage): Promise<BackgroundResponse> {
  if (message.type === "summary") { const response = await request("/api/articles/summary", { method: "POST", body: JSON.stringify({ articleIds: message.articleIds }) }); return response.ok ? { ok: true, summaries: await response.json() as Record<string, never> } : { ok: false, error: "Оценка недоступна" }; }
  if (message.type === "votes") { const suffix = message.cursor ? `?limit=20&cursor=${encodeURIComponent(message.cursor)}` : "?limit=20"; const response = await request(`/api/articles/${message.articleId}/votes${suffix}`); const page = await response.json() as { votes: PublicVote[]; nextCursor: string | null }; return response.ok ? { ok: true, votes: page.votes, nextCursor: page.nextCursor } : { ok: false, error: "Список голосов недоступен" }; }
  if (message.type === "ownVote") { const response = await request(`/api/articles/${message.articleId}/vote`); return response.ok ? { ok: true, value: await response.json() } : { ok: false, error: "Текущий голос недоступен" }; }
  if (message.type === "me") { const response = await request("/api/me"); return response.ok ? { ok: true, value: await response.json() } : { ok: false, error: "Вход не выполнен" }; }
  if (message.type === "login") {
    const clientVerifier = verifier(); const clientChallenge = await challenge(clientVerifier); const redirectUri = browser.identity.getRedirectURL("callback");
    const start = await request("/api/auth/github/start", { method: "POST", body: JSON.stringify({ redirectUri, challenge: clientChallenge, verifier: clientVerifier }) });
    if (!start.ok) return { ok: false, error: "GitHub-вход не настроен" };
    const flow = await browser.identity.launchWebAuthFlow({ url: ((await start.json()) as { url: string }).url, interactive: true });
    const callback = new URL(flow); const code = callback.searchParams.get("code"); const state = callback.searchParams.get("state");
    if (!code || !state) return { ok: false, error: "Неверный callback GitHub" };
    const exchange = await request("/api/auth/github/exchange", { method: "POST", body: JSON.stringify({ code, state, verifier: clientVerifier }) });
    if (!exchange.ok) return { ok: false, error: "GitHub-вход не завершён" };
    await writeToken(((await exchange.json()) as { token: string }).token); return { ok: true };
  }
  if (message.type === "logout") { const response = await request("/api/auth/logout", { method: "POST" }); if (response.ok) await writeToken(null); return response.ok ? { ok: true } : { ok: false, error: "Выход не завершён" }; }
  const init: RequestInit = { method: message.type === "deleteVote" ? "DELETE" : "PUT" }; if (message.type === "vote") init.body = JSON.stringify({ kind: message.kind, comment: message.comment }); const response = await request(`/api/articles/${message.articleId}/vote`, init); return response.ok ? { ok: true, value: await response.json() } : { ok: false, error: response.status === 401 ? "Сначала войдите через GitHub" : "Операция не выполнена" };
}
export default defineBackground(() => { browser.runtime.onMessage.addListener((message: unknown, sender: chrome.runtime.MessageSender) => { if (!validSender(sender.id, browser.runtime.id) || !validMessage(message)) return Promise.resolve({ ok: false, error: "invalid message" }); return handle(message).catch(() => ({ ok: false, error: "Сервис недоступен" })); }); });
