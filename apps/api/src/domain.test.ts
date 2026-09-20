import { describe, expect, it } from "vitest";
import { classify, decodeCursor, encodeCursor, summary } from "./domain.js";

describe("community labels", () => {
  it.each([
    [{ human: 0, partial: 0, ai: 0 }, "grey"],
    [{ human: 1, partial: 0, ai: 0 }, "green"],
    [{ human: 0, partial: 1, ai: 0 }, "yellow"],
    [{ human: 0, partial: 0, ai: 2 }, "yellow"],
    [{ human: 0, partial: 0, ai: 3 }, "red"],
    [{ human: 1, partial: 0, ai: 3 }, "yellow"],
    [{ human: 1, partial: 0, ai: 4 }, "red"],
    [{ human: 0, partial: 1, ai: 4 }, "red"],
    [{ human: 0, partial: 2, ai: 4 }, "yellow"],
  ])("classifies %j", (counts, label) => expect(summary(counts).label).toBe(label));

  it("round-trips cursors", () => expect(decodeCursor(encodeCursor("2026-01-01T00:00:00.000Z", "vote-1"))).toEqual({ updatedAt: "2026-01-01T00:00:00.000Z", id: "vote-1" }));
  it("does not classify partial as ai", () => expect(classify({ human: 0, partial: 4, ai: 0, total: 4 })).toBe("yellow"));
});
