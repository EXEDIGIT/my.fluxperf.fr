const securityHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'self'; frame-src https://form.jotform.com https://www.jotform.com https://eu.jotform.com https://lookerstudio.google.com https://datastudio.google.com; object-src 'none'; base-uri 'self'; frame-ancestors 'self'"
};

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      ...securityHeaders,
      ...(init.headers ?? {})
    }
  });
}

export function jsonError(status: number, code: string, message: string): Response {
  return json(
    {
      error: {
        code,
        message
      }
    },
    { status }
  );
}

