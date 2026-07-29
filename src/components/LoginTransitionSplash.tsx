type LoginTransitionSplashProps = {
  isExiting?: boolean;
};

export function LoginTransitionSplash({ isExiting = false }: LoginTransitionSplashProps) {
  return (
    <div
      className={`login-transition-splash${isExiting ? " is-exiting" : ""}`}
      role="status"
      aria-live="polite"
      aria-label="Connexion en cours"
    >
      <img className="login-transition-logo" src="/assets/img/logo-fluxperf.svg" alt="" aria-hidden="true" />
      <span className="visually-hidden">Connexion en cours</span>
    </div>
  );
}
