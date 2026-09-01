import { describe, expect, it, vi } from "vitest";
import { createSilentSupabaseUser, deleteSupabaseUserByEmail, silentAuthUserPayload } from "./silent-supabase.mjs";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key"
};

describe("silent Supabase administration", () => {
  it("creates an already confirmed user without an invitation or magic link", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: "user-1" }), { status: 201 }));

    const result = await createSilentSupabaseUser(env, "Client@Example.test", fetcher);

    expect(result).toEqual({ status: "created", email: "client@example.test" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("https://example.supabase.co/auth/v1/admin/users");
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(silentAuthUserPayload("client@example.test"));
    expect(fetcher.mock.calls[0][1].body).not.toContain("magiclink");
    expect(fetcher.mock.calls[0][1].body).not.toContain("redirect");
  });

  it("permanently deletes only the matched Auth user", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ users: [{ id: "user-1", email: "client@example.test" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = await deleteSupabaseUserByEmail(env, "client@example.test", fetcher);

    expect(result).toEqual({ status: "deleted", email: "client@example.test" });
    expect(fetcher.mock.calls[1][0]).toBe("https://example.supabase.co/auth/v1/admin/users/user-1");
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: "DELETE" });
  });
});
