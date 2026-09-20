import { describe, expect, it } from "vitest";
import { decrypt, encrypt, hashToken } from "./security.js";

describe("OAuth secrets", () => {
  it("round-trips encrypted verifiers without exposing plaintext", () => {
    const value = "client-verifier-123";
    const encrypted = encrypt(value, undefined);
    expect(encrypted).not.toContain(value);
    expect(decrypt(encrypted, undefined)).toBe(value);
  });

  it("hashes the same token deterministically", () => {
    expect(hashToken("token")).toBe(hashToken("token"));
    expect(hashToken("token")).not.toBe(hashToken("other"));
  });
});
