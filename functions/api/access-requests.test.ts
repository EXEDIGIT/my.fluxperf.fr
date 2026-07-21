import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./access-requests";
import type { AppEnv, PagesContext } from "../lib/types";

function context(payload: Record<string, unknown>, env: AppEnv = {}): PagesContext {
  return {
    request: new Request("https://my.fluxperf.fr/api/access-requests", {
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
  firstName: "Marie",
  lastName: "Martin",
  email: "marie.martin@example.com",
  companyName: "A2-CM",
  referrer: "Anthony Dupont",
  message: "Bonjour, je souhaite acceder a l'espace client MyFluxperf.",
  website: ""
};

describe("POST /api/access-requests", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("rejects an invalid payload", async () => {
    const response = await onRequestPost(context({}));
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({ code: "FIRST_NAME_REQUIRED" });
  });

  it("rejects an invalid email", async () => {
    const response = await onRequestPost(
      context({
        ...validPayload,
        email: "not-an-email"
      })
    );
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({ code: "EMAIL_INVALID" });
  });

  it("rejects a filled honeypot field", async () => {
    const response = await onRequestPost(
      context({
        ...validPayload,
        website: "https://spam.example"
      })
    );
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({ code: "SPAM_DETECTED" });
  });

  it("requires Brevo configuration in production", async () => {
    const response = await onRequestPost(
      context(validPayload, {
        APP_ENV: "production"
      })
    );
    const body = await responseBody(response);

    expect(response.status).toBe(503);
    expect(body.error).toMatchObject({ code: "BREVO_NOT_CONFIGURED" });
  });

  it("accepts a local development request without Brevo configuration", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T10:00:00.000Z"));

    const response = await onRequestPost(context(validPayload));
    const body = await responseBody(response);

    expect(response.status).toBe(202);
    expect(body.status).toBe("received");
    expect(String(body.requestId)).toMatch(/^ACC-17072026-[A-F0-9]{4}$/);
  });

  it("sends the access request to Brevo", async () => {
    const brevoFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ messageId: "brevo-message" })
    );

    vi.stubGlobal("fetch", brevoFetch);

    const response = await onRequestPost(
      context(validPayload, {
        BREVO_API_KEY: "brevo-api-key"
      })
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
        name: "Fluxperf",
        email: "notifications@fluxperf.fr"
      },
      to: [
        {
          email: "support@fluxperf.fr",
          name: "Support Fluxperf"
        }
      ],
      replyTo: {
        email: "marie.martin@example.com",
        name: "Marie Martin"
      },
      subject: "[MyFluxperf] Demande d'accès - A2-CM"
    });
    expect(String(brevoBody.textContent)).toContain("Référent : Anthony Dupont");
  });

  it("escapes HTML content in the Brevo email body", async () => {
    const brevoFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ messageId: "brevo-message" })
    );

    vi.stubGlobal("fetch", brevoFetch);

    await onRequestPost(
      context(
        {
          ...validPayload,
          companyName: "<strong>A2-CM</strong>",
          message: "Bonjour <script>alert('x')</script>, merci de verifier."
        },
        {
          BREVO_API_KEY: "brevo-api-key"
        }
      )
    );

    const [, init] = brevoFetch.mock.calls[0] as [RequestInfo | URL, RequestInit];
    const brevoBody = JSON.parse(String(init.body)) as Record<string, unknown>;
    const htmlContent = String(brevoBody.htmlContent);

    expect(htmlContent).toContain("&lt;strong&gt;A2-CM&lt;/strong&gt;");
    expect(htmlContent).toContain("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
    expect(htmlContent).not.toContain("<script>");
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

  it("returns 502 when Brevo cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("Network unavailable"))));

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
