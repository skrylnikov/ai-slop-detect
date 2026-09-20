import type { Summary } from "@ai-slop-labels/api/contracts";
import type { PublicVote } from "@ai-slop-labels/api/contracts";

export type ClientMessage =
  | { type: "summary"; articleIds: number[] }
  | { type: "votes"; articleId: number; cursor?: string }
  | { type: "ownVote"; articleId: number }
  | { type: "me" }
  | { type: "login" }
  | { type: "vote"; articleId: number; kind: "human" | "partial" | "ai"; comment: string | null }
  | { type: "deleteVote"; articleId: number }
  | { type: "logout" };

export type BackgroundResponse = { ok: true; summaries?: Record<string, Summary>; value?: unknown; votes?: PublicVote[]; nextCursor?: string | null } | { ok: false; error: string };

export function validSender(senderId: string | undefined, extensionId: string): boolean {
  return senderId === extensionId;
}

export function validMessage(value: unknown): value is ClientMessage {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  const message = value as { type?: unknown; articleIds?: unknown; articleId?: unknown; kind?: unknown; comment?: unknown; cursor?: unknown };
  if (message.type === "summary") return Array.isArray(message.articleIds) && message.articleIds.every((id) => Number.isInteger(id) && (id as number) > 0) && message.articleIds.length <= 100;
  if (message.type === "votes") return Number.isInteger(message.articleId) && (message.articleId as number) > 0 && (message.cursor === undefined || typeof message.cursor === "string");
  if (message.type === "ownVote") return Number.isInteger(message.articleId) && (message.articleId as number) > 0;
  if (message.type === "me" || message.type === "login" || message.type === "logout") return true;
  if (message.type === "deleteVote") return Number.isInteger(message.articleId) && (message.articleId as number) > 0;
  if (message.type === "vote") {
    return Number.isInteger(message.articleId) && (message.articleId as number) > 0 && ["human", "partial", "ai"].includes(message.kind as string) && (message.comment === null || typeof message.comment === "string") && (message.comment === null || (message.comment as string).length <= 2000);
  }
  return false;
}
