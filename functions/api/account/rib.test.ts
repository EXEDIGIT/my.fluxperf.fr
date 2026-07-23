import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./rib";
import type { AppEnv, PagesContext } from "../../lib/types";

function buildFormData(files: File[] = []): FormData {
  const formData = new FormData();
  files.forEach((file) => formData.append("rib", file, file.name));
  return formData;
}

function context(formData: FormData, env: AppEnv = {}): PagesContext {
  return {
    request: new Request("https://my.fluxperf.fr/api/account/rib?email=contact@a2-cm.fr", {
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

describe("POST /api/account/rib", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns 401 when the user is not authenticated", async () => {
    const response = await onRequestPost({
      request: new Request("https://my.fluxperf.fr/api/account/rib", {
        method: "POST",
        body: buildFormData()
      }),
      env: {
        APP_ENV: "development"
      }
    });

    expect(response.status).toBe(401);
  });

  it("accepts one supported file in local development without a webhook", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T10:00:00.000Z"));

    const response = await onRequestPost(
      context(buildFormData([new File(["rib"], "rib.pdf", { type: "application/pdf" })]))
    );
    const body = await responseBody(response);

    expect(response.status).toBe(202);
    expect(body.status).toBe("received");
    expect(body.documentId).toMatch(/^RIB-23072026-[A-F0-9]{4}$/);
    expect(body.submittedAt).toBe("2026-07-23T10:00:00.000Z");
  });

  it("rejects invalid document types", async () => {
    const response = await onRequestPost(
      context(buildFormData([new File(["rib"], "rib.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })]))
    );
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({ code: "RIB_FILE_TYPE_INVALID" });
  });

  it("rejects more than one document", async () => {
    const response = await onRequestPost(
      context(
        buildFormData([
          new File(["one"], "one.pdf", { type: "application/pdf" }),
          new File(["two"], "two.png", { type: "image/png" })
        ])
      )
    );
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({ code: "RIB_FILE_REQUIRED" });
  });

  it("rejects documents larger than 10 MB", async () => {
    const file = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "rib.pdf", {
      type: "application/pdf"
    });
    const response = await onRequestPost(context(buildFormData([file])));
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({ code: "RIB_FILE_TOO_LARGE" });
  });

  it("forwards only server-derived client metadata and the document to n8n", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T10:00:00.000Z"));
    const webhookFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ status: "stored" })
    );
    vi.stubGlobal("fetch", webhookFetch);

    const response = await onRequestPost(
      context(buildFormData([new File(["rib"], "client-rib.png", { type: "image/png" })]), {
        N8N_RIB_WEBHOOK_URL: "https://n8n.example.test/webhook/myfluxperf/rib",
        N8N_RIB_WEBHOOK_SECRET: "secret"
      })
    );

    expect(response.status).toBe(202);
    expect(webhookFetch).toHaveBeenCalledOnce();
    const [url, init] = webhookFetch.mock.calls[0] as [RequestInfo | URL, RequestInit];

    expect(url).toBe("https://n8n.example.test/webhook/myfluxperf/rib");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        "X-Fluxperf-Webhook-Secret": "secret"
      }
    });
    expect(init.body).toBeInstanceOf(FormData);

    const payload = JSON.parse(String((init.body as FormData).get("payload"))) as Record<string, unknown>;
    expect(payload).toMatchObject({
      documentId: expect.stringMatching(/^RIB-23072026-[A-F0-9]{4}$/),
      requester: { email: "contact@a2-cm.fr" },
      client: { id: "a2cm", companyName: "A2-CM" },
      document: { type: "rib_iban" }
    });
    expect((init.body as FormData).get("rib")).toBeInstanceOf(File);
  });
});
