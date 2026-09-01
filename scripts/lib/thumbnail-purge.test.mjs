import { describe, expect, it, vi } from "vitest";
import { purgeThumbnail, thumbnailPurgeUrl } from "./thumbnail-purge.mjs";

const env = {
  THUMBNAIL_WORKER_URL: "https://thumbnail-worker.example/",
  THUMBNAIL_INTERNAL_SECRET: "internal-secret"
};

describe("thumbnail purge client", () => {
  it("uses the one-solution internal delete endpoint", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ status: "purged" }), { status: 200 }));

    const result = await purgeThumbnail(env, "SOL-0001", fetcher);

    expect(result).toEqual({ solutionId: "SOL-0001", status: "purged" });
    expect(fetcher).toHaveBeenCalledWith("https://thumbnail-worker.example/thumbnail/SOL-0001", {
      method: "DELETE",
      headers: { Authorization: "Bearer internal-secret" }
    });
  });

  it("rejects an unsafe solution identifier before calling the worker", () => {
    expect(() => thumbnailPurgeUrl(env.THUMBNAIL_WORKER_URL, "../../all")).toThrow("Identifiant de solution invalide");
  });

  it("accepts a configured worker hostname without a protocol", () => {
    expect(thumbnailPurgeUrl("thumbnail-worker.example", "SOL-0001")).toBe("https://thumbnail-worker.example/thumbnail/SOL-0001");
  });
});
