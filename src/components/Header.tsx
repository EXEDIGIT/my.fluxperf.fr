import { CheckCircle2, ShieldCheck } from "lucide-react";
import type { Client } from "../types/client";

type HeaderProps = {
  client: Client;
  email: string;
};

export function Header({ client, email }: HeaderProps) {
  return (
    <header className="dashboard-header" id="accueil">
      <div>
        <p className="eyebrow">Votre espace client Fluxperf</p>
        <h1>Bonjour {client.firstName || client.companyName}, bienvenue dans votre espace client.</h1>
        <p className="header-copy">
          Retrouvez ici vos demandes, vos rapports, vos ressources et les accès utiles pour piloter
          votre présence digitale avec notre équipe.
        </p>
      </div>

      <div className="client-panel" aria-label="Informations client">
        <span className="client-panel-status">
          <CheckCircle2 aria-hidden="true" />
          {client.planLabel}
        </span>
        <strong>{client.companyName}</strong>
        <span>{email}</span>
        <span className="secure-badge">
          <ShieldCheck aria-hidden="true" />
          Accès sécurisé
        </span>
      </div>
    </header>
  );
}
