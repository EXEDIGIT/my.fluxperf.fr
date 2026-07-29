export const LOGIN_TRANSITION_STORAGE_KEY = "myfluxperf.loginTransition";

export function markLoginTransition() {
  try {
    window.sessionStorage.setItem(LOGIN_TRANSITION_STORAGE_KEY, "1");
  } catch {
    // Session storage can be unavailable in strict browser contexts.
  }
}

export function consumeLoginTransition(): boolean {
  try {
    const hasTransition = window.sessionStorage.getItem(LOGIN_TRANSITION_STORAGE_KEY) === "1";

    if (hasTransition) {
      window.sessionStorage.removeItem(LOGIN_TRANSITION_STORAGE_KEY);
    }

    return hasTransition;
  } catch {
    return false;
  }
}
