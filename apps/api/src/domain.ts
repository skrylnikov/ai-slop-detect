import type { Counts, Label, Summary, VoteKind } from "./contracts.js";
import { voteKinds } from "./contracts.js";

export function classify(counts: Counts): Label {
  if (counts.total === 0) return "grey";
  if (counts.human === counts.total) return "green";
  return counts.ai >= 3 && counts.ai * 5 >= counts.total * 4 ? "red" : "yellow";
}

export function summary(counts: Omit<Counts, "total">): Summary {
  const total = counts.human + counts.partial + counts.ai;
  return { ...counts, total, label: classify({ ...counts, total }) };
}

export function isVoteKind(value: unknown): value is VoteKind {
  return typeof value === "string" && voteKinds.includes(value as VoteKind);
}

export function parseArticleId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) return Number(value);
  return null;
}

export function validateComment(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  return typeof value === "string" && value.length <= 2000 ? value : undefined;
}

export function encodeCursor(updatedAt: string, id: string): string {
  return Buffer.from(JSON.stringify({ updatedAt, id }), "utf8").toString("base64url");
}

export function decodeCursor(value: unknown): { updatedAt: string; id: string } | null {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "updatedAt" in parsed &&
      "id" in parsed &&
      typeof parsed.updatedAt === "string" &&
      typeof parsed.id === "string"
    ) return { updatedAt: parsed.updatedAt, id: parsed.id };
  } catch {}
  return null;
}
