import { useEffect, useState } from "react";
import { BarChart3, Bot, Globe2, Megaphone, MonitorSmartphone, Sparkles, Wrench, Zap, type LucideIcon } from "lucide-react";
import { getSupabaseAccessToken } from "../lib/supabase";
import type { Client, ClientSolution } from "../types/client";

type ServicesActiveProps = {
  services: Client["services"];
  solutions: Client["solutions"];
  onSupportRequest: () => void;
  onOpenStatistics: (solution: ClientSolution) => void;
};

function iconForService(service: string) {
  const normalized = normalizeService(service);

  if (normalized.includes("site")) return MonitorSmartphone;
  if (normalized.includes("visibil")) return Globe2;
  if (normalized.includes("ads") || normalized.includes("sea")) return Megaphone;
  if (normalized.includes("automatisation")) return Zap;
  if (normalized.includes("ia")) return Bot;
  return Wrench;
}

function normalizeService(service: string) {
  return service
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function descriptionForService(service: string) {
  const normalized = normalizeService(service);

  if (normalized.includes("assistant")) {
    return "Assistant IA actif, suivi avec son contexte métier et ses évolutions utiles.";
  }

  if (normalized.includes("automatisation")) {
    return "Automatisations, intégrations et workflows IA rattachés à votre compte.";
  }

  if (normalized.includes("visibil") || normalized.includes("ads") || normalized.includes("sea")) {
    return "Visibilité & Acquisition pilotées par nos équipes et rattachées à votre compte.";
  }

  if (normalized.includes("site")) {
    return "Site rattaché à votre espace client avec les informations de suivi à jour.";
  }

  return "Suivi dans votre espace client avec les informations et accès utiles à jour.";
}

function solutionDetail(solution: Client["solutions"][number]): string {
  return solution.url || solution.domain || solution.typeLabel;
}

function descriptionForSolution(solution: Client["solutions"][number]) {
  return descriptionForService(`${solution.typeLabel} ${solution.name}`);
}

function shouldShowStatistics(solution: ClientSolution): boolean {
  return solution.type === "visibility_acquisition" && Boolean(solution.domain);
}

function placeholderLabel(solution: Client["solutions"][number]): string {
  if (solution.thumbnail.placeholderKey === "assistant_ai") {
    return "Assistant IA";
  }

  if (solution.thumbnail.placeholderKey === "automation_ai") {
    return "Automatisation & IA";
  }

  return "Visibilité & Acquisition";
}

function ServiceThumbnail({
  solution,
  Icon
}: {
  solution: Client["solutions"][number];
  Icon: LucideIcon;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const endpoint = solution.thumbnail.kind === "website" ? solution.thumbnail.endpoint : null;

  useEffect(() => {
    let isCurrent = true;
    let objectUrl: string | null = null;

    setImageUrl(null);

    if (!endpoint) {
      setStatus("idle");

      return () => {
        isCurrent = false;
      };
    }

    async function loadThumbnail() {
      try {
        setStatus("loading");
        const token = await getSupabaseAccessToken();
        const response = await fetch(endpoint as string, {
          headers: token
            ? {
                Authorization: `Bearer ${token}`
              }
            : undefined
        });
        const contentType = response.headers.get("Content-Type") ?? "";

        if (!response.ok || !contentType.startsWith("image/")) {
          throw new Error("Thumbnail unavailable.");
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);

        if (isCurrent) {
          setImageUrl(objectUrl);
          setStatus("ready");
        } else {
          URL.revokeObjectURL(objectUrl);
          objectUrl = null;
        }
      } catch {
        if (isCurrent) {
          setStatus("error");
        }
      }
    }

    void loadThumbnail();

    return () => {
      isCurrent = false;

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [endpoint]);

  const shouldShowPlaceholder = !imageUrl;

  return (
    <div
      className={`service-thumbnail service-thumbnail-${solution.thumbnail.placeholderKey} ${
        imageUrl ? "has-image" : ""
      } ${status === "loading" ? "is-loading" : ""} ${status === "error" ? "is-error" : ""}`}
      aria-busy={status === "loading" ? "true" : undefined}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={`Aperçu ${solution.name || solution.typeLabel}`} />
      ) : (
        <div className="service-thumbnail-placeholder" aria-label={placeholderLabel(solution)}>
          <Icon aria-hidden="true" />
          <span>{placeholderLabel(solution)}</span>
        </div>
      )}
      {shouldShowPlaceholder && status === "loading" ? <small>Capture en préparation</small> : null}
    </div>
  );
}

function FallbackServiceThumbnail({ service, Icon }: { service: string; Icon: LucideIcon }) {
  return (
    <div className="service-thumbnail service-thumbnail-generic">
      <div className="service-thumbnail-placeholder" aria-label={service}>
        <Icon aria-hidden="true" />
        <span>{service}</span>
      </div>
    </div>
  );
}

export function ServicesActive({ services, solutions, onSupportRequest, onOpenStatistics }: ServicesActiveProps) {
  const activeSolutions = solutions.length > 0 ? solutions : null;
  const visibleServices = services.length > 0 ? services : ["Espace client Fluxperf"];

  return (
    <section className="dashboard-section">
      <div className="section-heading">
        <span className="section-kicker">Services actifs</span>
        <h2>Ce que notre équipe pilote avec vous.</h2>
      </div>
      <div className="service-grid">
        {activeSolutions ? activeSolutions.map((solution) => {
          const Icon = iconForService(`${solution.typeLabel} ${solution.name}`);
          const detail = solutionDetail(solution);

          return (
            <article className="service-card" key={solution.id}>
              <ServiceThumbnail solution={solution} Icon={Icon} />
              <strong>{solution.name || solution.typeLabel}</strong>
              <p>{detail}</p>
              <p>{descriptionForSolution(solution)}</p>
              {shouldShowStatistics(solution) ? (
                <button
                  type="button"
                  className="service-card-action"
                  onClick={() => onOpenStatistics(solution)}
                >
                  <BarChart3 aria-hidden="true" />
                  Statistiques
                </button>
              ) : null}
            </article>
          );
        }) : visibleServices.map((service, index) => {
          const Icon = iconForService(service);

          return (
            <article className="service-card" key={`${service}-${index}`}>
              <FallbackServiceThumbnail service={service} Icon={Icon} />
              <strong>{service}</strong>
              <p>{descriptionForService(service)}</p>
            </article>
          );
        })}
      </div>
      <div className="section-note">
        <Sparkles aria-hidden="true" />
        <span className="section-note-content">
          Il s'agit de vos services Fluxperf® actuellement recensés.
          <button className="section-note-link" type="button" onClick={onSupportRequest}>
            Contacter le support
          </button>
        </span>
      </div>
    </section>
  );
}
