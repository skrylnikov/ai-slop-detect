import { describe, expect, it } from "vitest";
import { validMessage, validSender } from "./messages.js";

describe("background message boundary", () => {
  it("accepts bounded summary requests", () => expect(validMessage({ type: "summary", articleIds: [1, 2] })).toBe(true));
  it("accepts only messages from this extension", () => {
    expect(validSender("extension-id", "extension-id")).toBe(true);
    expect(validSender("other-extension", "extension-id")).toBe(false);
    expect(validSender(undefined, "extension-id")).toBe(false);
  });
  it("rejects arbitrary proxy payloads and oversized comments", () => {
    expect(validMessage({ type: "fetch", url: "https://example.test" })).toBe(false);
    expect(validMessage({ type: "vote", articleId: 1, kind: "ai", comment: "x".repeat(2001) })).toBe(false);
  });
});
