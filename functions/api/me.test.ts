import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestGet } from "./me";
import type { AppEnv, PagesContext } from "../lib/types";

function context(url: string, env: AppEnv = {}, headers: HeadersInit = {}): PagesContext {
  return {
    request: new Request(url, { headers }),
    env
  };
}

async function bodyOf(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("GET /api/me", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 401 when no Supabase session or local demo email exists", async () => {
    const response = await onRequestGet(
      context("https://my.fluxperf.fr/api/me", { APP_ENV: "development" })
    );

    expect(response.status).toBe(401);
  });

  it("ignores query email in production", async () => {
    const response = await onRequestGet(
      context("https://my.fluxperf.fr/api/me?email=contact@a2-cm.fr", {
        APP_ENV: "production"
      })
    );

    expect(response.status).toBe(401);
  });

  it("returns the local demo client in development", async () => {
    const response = await onRequestGet(
      context("https://my.fluxperf.fr/api/me", {
        APP_ENV: "development",
        DEV_AUTH_EMAIL: "contact@a2-cm.fr"
      })
    );
    const body = await bodyOf(response);

    expect(response.status).toBe(200);
    expect(body.user).toEqual({ email: "contact@a2-cm.fr" });
  });

  it("returns 403 when authenticated email has no configured client", async () => {
    const response = await onRequestGet(
      context("https://my.fluxperf.fr/api/me?email=unknown@example.com", {
        APP_ENV: "development"
      })
    );
    const body = await bodyOf(response);

    expect(response.status).toBe(403);
    expect(body.error).toMatchObject({ code: "CLIENT_NOT_CONFIGURED" });
  });

  it("uses the Supabase bearer token when present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          email: "direction@a2-cm.fr"
        })
      )
    );

    const response = await onRequestGet(
      context(
        "https://my.fluxperf.fr/api/me",
        {
          APP_ENV: "development",
          SUPABASE_URL: "https://example.supabase.co",
          SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test"
        },
        { Authorization: "Bearer valid-token" }
      )
    );
    const body = await bodyOf(response);

    expect(response.status).toBe(200);
    expect(body.user).toEqual({ email: "direction@a2-cm.fr" });
  });
});
