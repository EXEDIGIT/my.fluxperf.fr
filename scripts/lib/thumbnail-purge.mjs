function text(value) {
  return String(value ?? "").trim();
}

function validSolutionId(solutionId) {
  return /^SOL-[A-Z0-9][A-Z0-9-]{0,127}$/i.test(text(solutionId));
}

export function thumbnailPurgeUrl(workerUrl, solutionId) {
  const configuredUrl = text(workerUrl);
  if (!configuredUrl) throw new Error("URL du service de vignettes manquante.");
  if (!validSolutionId(solutionId)) throw new Error(`Identifiant de solution invalide pour la purge : ${solutionId}.`);

  const baseUrl = (/^https?:\/\//i.test(configuredUrl) ? configuredUrl : `https://${configuredUrl}`).replace(/\/+$/, "");

  return `${baseUrl}/thumbnail/${encodeURIComponent(text(solutionId))}`;
}

export async function purgeThumbnail(env, solutionId, fetcher = fetch) {
  const secret = text(env.THUMBNAIL_INTERNAL_SECRET);
  if (!secret) throw new Error("Secret interne du service de vignettes manquant.");

  const response = await fetcher(thumbnailPurgeUrl(env.THUMBNAIL_WORKER_URL, solutionId), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${secret}` }
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `Purge de vignette impossible (${response.status}).`;
    throw new Error(message);
  }

  return { solutionId: text(solutionId), status: text(payload?.status) || "purged" };
}
