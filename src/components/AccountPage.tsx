import { BadgeCheck, Building2, CircleAlert, FileText, Loader2, RefreshCw, UploadCloud } from "lucide-react";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { ApiError, submitRibDocument } from "../lib/api";
import type { Client } from "../types/client";

type AccountPageProps = {
  client: Client;
  onRibSubmitted: (submittedAt: string) => void;
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_FILE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} Ko`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatSubmittedAt(value: string | null): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(date);
}

function clientFileError(file: File): string | null {
  if (!ACCEPTED_FILE_TYPES.has(file.type)) {
    return "Choisissez un document PDF, JPG ou PNG.";
  }

  if (file.size === 0) {
    return "Le document sélectionné est vide.";
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return "Le document ne doit pas dépasser 10 Mo.";
  }

  return null;
}

export function AccountPage({ client, onRibSubmitted }: AccountPageProps) {
  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const isComplete = client.account.rib.status === "complete";
  const submittedAt = formatSubmittedAt(client.account.rib.submittedAt);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.currentTarget.files?.[0] ?? null;

    if (!selectedFile) {
      setFile(null);
      return;
    }

    const error = clientFileError(selectedFile);

    if (error) {
      setFile(null);
      setFormError(error);
      return;
    }

    setFile(selectedFile);
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setFormError("Ajoutez votre document RIB avant de l’envoyer.");
      return;
    }

    const error = clientFileError(file);

    if (error) {
      setFormError(error);
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const result = await submitRibDocument(file);
      setFile(null);
      setInputKey((current) => current + 1);
      onRibSubmitted(result.submittedAt);
    } catch (submissionError) {
      setFormError(
        submissionError instanceof ApiError
          ? submissionError.message
          : "Le document RIB n’a pas pu être transmis. Merci de réessayer."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="dashboard-section account-section" id="mon-compte" aria-labelledby="account-title">
      <div className="section-heading">
        <span className="section-kicker">MON COMPTE</span>
        <h2 id="account-title">Vos informations administratives</h2>
        <p className="section-subtitle">
          Retrouvez les éléments administratifs nécessaires à votre accompagnement Fluxperf.
        </p>
      </div>

      <div className="account-company-card">
        <span className="account-company-icon" aria-hidden="true">
          <Building2 />
        </span>
        <div>
          <span>Compte rattaché</span>
          <strong>{client.companyName}</strong>
        </div>
      </div>

      <div className={`rib-card ${isComplete ? "is-complete" : "is-missing"}`}>
        <div className="rib-card-heading">
          <span className="rib-card-icon" aria-hidden="true">
            {isComplete ? <BadgeCheck /> : <CircleAlert />}
          </span>
          <div>
            <span className="section-kicker">RIB / IBAN</span>
            <h3>{isComplete ? "Dossier administratif complet" : "Action requise"}</h3>
            <p>
              {isComplete
                ? `Votre dernier RIB a été enregistré${submittedAt ? ` le ${submittedAt}` : ""}.`
                : "Un RIB est nécessaire pour finaliser votre dossier et activer vos abonnements."}
            </p>
          </div>
        </div>

        <form className="rib-upload-form" onSubmit={handleSubmit} noValidate>
          <label className="rib-upload-zone">
            <UploadCloud aria-hidden="true" />
            <span>
              <strong>{file ? file.name : "Déposez votre RIB"}</strong>
              <small>{file ? formatFileSize(file.size) : "PDF, JPG ou PNG — 10 Mo maximum"}</small>
            </span>
            <input
              key={inputKey}
              type="file"
              accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
              aria-describedby="rib-upload-help"
              onChange={handleFileChange}
              disabled={isSubmitting}
            />
          </label>
          <p className="rib-upload-help" id="rib-upload-help">
            {isComplete
              ? "Le nouveau document sera ajouté à votre dossier administratif."
              : "Votre document est transmis de manière sécurisée à l’équipe Fluxperf."}
          </p>

          {formError ? (
            <p className="rib-form-error" role="alert">
              {formError}
            </p>
          ) : null}

          <button className="rib-submit-button" type="submit" disabled={!file || isSubmitting}>
            {isSubmitting ? <Loader2 className="loading-icon" aria-hidden="true" /> : isComplete ? <RefreshCw aria-hidden="true" /> : <FileText aria-hidden="true" />}
            {isSubmitting ? "Enregistrement…" : isComplete ? "Remplacer mon RIB" : "Envoyer mon RIB"}
          </button>
        </form>
      </div>
    </section>
  );
}
