import { describe, expect, it, vi } from "vitest";
import { getAuthenticatedEmail } from "./auth";
import type { AppEnv } from "./types";

const supabaseEnv: AppEnv = {
  APP_ENV: "production",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test"
};

describe("Supabase auth", () => {
  it("reads the authenticated email from a valid Supabase bearer token", async () => {
    const request = new Request("https://my.fluxperf.fr/api/me", {
      headers: {
        Authorization: "Bearer valid-token"
      }
    });
    const fetcher = vi.fn(async () =>
      Response.json({
        email: "TDACUNHA@EXEDIGIT.FR"
      })
    );

    await expect(getAuthenticatedEmail(request, supabaseEnv, fetcher)).resolves.toBe(
      "tdacunha@exedigit.fr"
    );
    expect(fetcher).toHaveBeenCalledWith("https://example.supabase.co/auth/v1/user", {
      headers: {
        apikey: "sb_publishable_test",
        Authorization: "Bearer valid-token"
      }
    });
  });

  it("returns null in production when the token is missing", async () => {
    const request = new Request("https://my.fluxperf.fr/api/me");

    await expect(getAuthenticatedEmail(request, supabaseEnv)).resolves.toBeNull();
  });

  it("returns null in production when Supabase rejects the token", async () => {
    const request = new Request("https://my.fluxperf.fr/api/me", {
      headers: {
        Authorization: "Bearer invalid-token"
      }
    });
    const fetcher = vi.fn(async () => Response.json({ message: "Unauthorized" }, { status: 401 }));

    await expect(getAuthenticatedEmail(request, supabaseEnv, fetcher)).resolves.toBeNull();
  });

  it("uses the local demo email only outside production", async () => {
    const request = new Request("https://my.fluxperf.fr/api/me?email=CONTACT@A2-CM.FR");

    await expect(getAuthenticatedEmail(request, { APP_ENV: "development" })).resolves.toBe(
      "contact@a2-cm.fr"
    );
  });
});
