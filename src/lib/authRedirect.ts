const defaultRedirectPath = "/";
const callbackPath = "/auth/callback";
const maxRedirectDepth = 3;

function pathFromUrl(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`;
}

function resolveRedirectPath(value: string | null, origin: string, depth: number): string {
  if (!value || depth >= maxRedirectDepth) {
    return defaultRedirectPath;
  }

  let target: URL;

  try {
    target = new URL(value, origin);
  } catch {
    return defaultRedirectPath;
  }

  if (target.origin !== origin) {
    return defaultRedirectPath;
  }

  if (target.pathname === callbackPath) {
    return resolveRedirectPath(target.searchParams.get("next"), origin, depth + 1);
  }

  return pathFromUrl(target);
}

export function resolveAuthRedirectPath(value: string | null, origin: string): string {
  return resolveRedirectPath(value, origin, 0);
}
