import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./support-requests";
import type { AppEnv, PagesContext } from "../lib/types";

function context(payload: Record<string, unknown>, env: AppEnv = {}): PagesContext {
  return {
    request: new Request("https://my.fluxperf.fr/api/support-requests?email=contact@a2-cm.fr", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }),
    env: {
      APP_ENV: "development",
      ...env
    }
  };
}

async function responseBody(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

const validPayload = {
  subject: "Question support",
  message: "Merci de nous aider sur ce sujet Fluxperf."
};

describe("POST /api/support-requests", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 401 when the user is not authenticated", async () => {
    const response = await onRequestPost({
      request: new Request("https://my.fluxperf.fr/api/support-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(validPayload)
      }),
      env: {
        APP_ENV: "development"
      }
    });

    expect(response.status).toBe(401);
  });

  it("rejects an invalid payload", async () => {
    const response = await onRequestPost(context({ subject: "", message: "Trop court" }));
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({ code: "SUBJECT_REQUIRED" });
  });

  it("returns 403 when the authenticated email has no configured client", async () => {
    const response = await onRequestPost({
      request: new Request("https://my.fluxperf.fr/api/support-requests?email=unknown@example.com", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(validPayload)
      }),
      env: {
        APP_ENV: "development"
      }
    });
    const body = await responseBody(response);

    expect(response.status).toBe(403);
    expect(body.error).toMatchObject({ code: "CLIENT_NOT_CONFIGURED" });
  });

  it("requires Brevo configuration in production", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          email: "contact@a2-cm.fr"
        })
      )
    );

    const response = await onRequestPost({
      request: new Request("https://my.fluxperf.fr/api/support-requests", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(validPayload)
      }),
      env: {
        APP_ENV: "production",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test"
      }
    });
    const body = await responseBody(response);

    expect(response.status).toBe(503);
    expect(body.error).toMatchObject({ code: "BREVO_NOT_CONFIGURED" });
  });

  it("accepts a local development request without Brevo configuration", async () => {
    const response = await onRequestPost(context(validPayload));
    const body = await responseBody(response);

    expect(response.status).toBe(202);
    expect(body.status).toBe("received");
    expect(String(body.requestId)).toMatch(/^SUP-\d{8}-[A-F0-9]{4}$/);
  });

  it("sends the support request to Brevo", async () => {
    const brevoFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ messageId: "brevo-message" })
    );

    vi.stubGlobal("fetch", brevoFetch);

    const response = await onRequestPost(
      context(
        {
          ...validPayload,
          email: "spoof@example.com"
        },
        {
          BREVO_API_KEY: "brevo-api-key"
        }
      )
    );
    const body = await responseBody(response);

    expect(response.status).toBe(202);
    expect(body.status).toBe("received");
    expect(brevoFetch).toHaveBeenCalledOnce();

    const [url, init] = brevoFetch.mock.calls[0] as [RequestInfo | URL, RequestInit];
    const brevoBody = JSON.parse(String(init.body)) as Record<string, unknown>;

    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        "api-key": "brevo-api-key"
      }
    });
    expect(brevoBody).toMatchObject({
      sender: {
        email: "notifications@fluxperf.fr"
      },
      subject: "[MyFluxperf] A2-CM - Question support",
      replyTo: {
        email: "contact@a2-cm.fr"
      }
    });
    expect(JSON.stringify(brevoBody)).not.toContain("spoof@example.com");
  });

  it("returns 502 when Brevo rejects the email", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Bad request", { status: 400 })));

    const response = await onRequestPost(
      context(validPayload, {
        BREVO_API_KEY: "brevo-api-key"
      })
    );
    const body = await responseBody(response);

    expect(response.status).toBe(502);
    expect(body.error).toMatchObject({ code: "BREVO_FAILED" });
  });
});
