import { json } from "../lib/response";

export function onRequestGet(): Response {
  return json({
    status: "ok",
    app: "my-fluxperf"
  });
}

