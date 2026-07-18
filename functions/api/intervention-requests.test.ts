import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./intervention-requests";
import type { AppEnv, PagesContext } from "../lib/types";

function buildFormData(payload: Record<string, unknown>, files: File[] = []): FormData {
  const formData = new FormData();

  formData.append("payload", JSON.stringify(payload));
  files.forEach((file) => formData.append("files[]", file, file.name));

  return formData;
}

function context(formData: FormData, env: AppEnv = {}): PagesContext {
  return {
    request: new Request("https://my.fluxperf.fr/api/intervention-requests?email=contact@a2-cm.fr", {
      method: "POST",
      body: formData
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
  service: "automation_ai",
  solutionIds: ["SOL-DEMO-2"],
  needs: ["process_automation"],
  priority: "normal",
  message: "Merci de verifier cette automatisation client."
};

describe("POST /api/intervention-requests", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns 401 when the user is not authenticated", async () => {
    const response = await onRequestPost({
      request: new Request("https://my.fluxperf.fr/api/intervention-requests", {
        method: "POST",
        body: buildFormData(validPayload)
      }),
      env: {
        APP_ENV: "development"
      }
    });

    expect(response.status).toBe(401);
  });

  it("accepts a valid local development request without webhook configuration", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T10:00:00.000Z"));

    const response = await onRequestPost(context(buildFormData(validPayload)));
    const body = await responseBody(response);

    expect(response.status).toBe(202);
    expect(body.status).toBe("received");
    expect(String(body.requestId)).toMatch(/^FP-17072026-[A-F0-9]{4}$/);
  });

  it("rejects a solution id that is not attached to the authenticated client", async () => {
    const response = await onRequestPost(
      context(
        buildFormData({
          ...validPayload,
          service: "visibility_acquisition",
          solutionIds: ["unknown-solution"],
          needs: ["seo"]
        })
      )
    );
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({ code: "SOLUTION_NOT_ALLOWED" });
  });

  it("rejects files larger than 10 MB", async () => {
    const largeFile = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.pdf", {
      type: "application/pdf"
    });
    const response = await onRequestPost(context(buildFormData(validPayload, [largeFile])));
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({ code: "FILE_TOO_LARGE" });
  });

  it("rejects files larger than 15 MB in total", async () => {
    const firstFile = new File([new Uint8Array(8 * 1024 * 1024)], "first.pdf", {
      type: "application/pdf"
    });
    const secondFile = new File([new Uint8Array(8 * 1024 * 1024)], "second.pdf", {
      type: "application/pdf"
    });
    const response = await onRequestPost(
      context(buildFormData(validPayload, [firstFile, secondFile]))
    );
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({ code: "FILES_TOTAL_TOO_LARGE" });
  });

  it("forwards the structured payload and files to the n8n webhook", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T10:00:00.000Z"));

    const webhookFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ ok: true })
    );
    const file = new File(["capture"], "capture.png", { type: "image/png" });

    vi.stubGlobal("fetch", webhookFetch);

    const response = await onRequestPost(
      context(buildFormData(validPayload, [file]), {
        N8N_INTERVENTION_WEBHOOK_URL: "https://n8n.example.test/webhook/intervention",
        N8N_INTERVENTION_WEBHOOK_SECRET: "secret"
      })
    );

    expect(response.status).toBe(202);
    expect(webhookFetch).toHaveBeenCalledOnce();
    const [url, init] = webhookFetch.mock.calls[0] as [RequestInfo | URL, RequestInit];

    expect(url).toBe("https://n8n.example.test/webhook/intervention");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        "X-Fluxperf-Webhook-Secret": "secret"
      }
    });
    expect(init.body).toBeInstanceOf(FormData);

    const forwardedPayload = JSON.parse(
      String((init.body as FormData).get("payload"))
    ) as Record<string, unknown>;

    expect(forwardedPayload.requestId).toMatch(/^FP-17072026-[A-F0-9]{4}$/);
    expect(forwardedPayload.submittedAt).toBe("2026-07-17T10:00:00.000Z");
  });
});
