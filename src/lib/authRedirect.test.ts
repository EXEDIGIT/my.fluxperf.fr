import { describe, expect, it } from "vitest";
import { resolveAuthRedirectPath } from "./authRedirect";

const origin = "https://my.fluxperf.fr";

describe("resolveAuthRedirectPath", () => {
  it("keeps a local admin destination", () => {
    expect(resolveAuthRedirectPath("/fp-console", origin)).toBe("/fp-console");
  });

  it("unwraps the admin destination from the Supabase callback", () => {
    expect(
      resolveAuthRedirectPath(
        "https://my.fluxperf.fr/auth/callback?next=%2Ffp-console",
        origin
      )
    ).toBe("/fp-console");
  });

  it("falls back to the client home when the callback has no destination", () => {
    expect(resolveAuthRedirectPath("/auth/callback", origin)).toBe("/");
  });

  it("rejects external and protocol-relative destinations", () => {
    expect(resolveAuthRedirectPath("https://example.com/fp-console", origin)).toBe("/");
    expect(resolveAuthRedirectPath("//example.com/fp-console", origin)).toBe("/");
  });
});
