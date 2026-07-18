import { CheckCircle2, Loader2, Send, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, submitSupportRequest } from "../lib/api";
import type { Client } from "../types/client";

type SupportRequestModalProps = {
  client: Client;
  email: string;
  isOpen: boolean;
  initialSubject?: string;
  initialMessage?: string;
  resetKey: number;
  onClose: () => void;
};

export function SupportRequestModal({
  client,
  email,
  isOpen,
  initialSubject = "",
  initialMessage = "",
  resetKey,
  onClose
}: SupportRequestModalProps) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setSubject(initialSubject);
    setMessage(initialMessage);
    setFormError(null);
    setIsSubmitting(false);
    setRequestId(null);
  }, [initialMessage, initialSubject, isOpen, resetKey]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };

    document.body.classList.add("modal-open");
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) {
    return null;
  }

  function validate(): string | null {
    if (subject.trim().length < 3) {
      return "Renseignez l'objet de votre demande.";
    }

    if (message.trim().length < 10) {
      return "Ajoutez une description pour guider nos équipes.";
    }

    return null;
  }

  async function handleSubmit() {
    const error = validate();

    if (error) {
      setFormError(error);
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const response = await submitSupportRequest({
        subject: subject.trim(),
        message: message.trim()
      });

      setRequestId(response.requestId);
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "Votre message n'a pas pu être transmis. Merci de réessayer."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="simple-modal-backdrop" role="dialog" aria-modal="true" aria-label="Support Fluxperf">
      <section className="simple-modal">
        <header className="simple-modal-header">
          <div>
            <span className="section-kicker">Support Fluxperf</span>
            <h2>Écrire à nos équipes</h2>
          </div>
          <button type="button" aria-label="Fermer la fenêtre" disabled={isSubmitting} onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        {requestId ? (
          <div className="simple-success">
            <CheckCircle2 aria-hidden="true" />
            <h3>Message transmis</h3>
            <p>
              Votre message a bien été envoyé à l'équipe Fluxperf. Référence :{" "}
              <strong>{requestId}</strong>
            </p>
          </div>
        ) : (
          <div className="simple-modal-content">
            <div className="simple-form">
              <label className="simple-field">
                <span>Objet de votre demande</span>
                <input
                  value={subject}
                  maxLength={140}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="Exemple : question sur mon accompagnement"
                />
              </label>

              <label className="simple-field">
                <span>Description</span>
                <textarea
                  value={message}
                  maxLength={4000}
                  rows={8}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Précisez votre besoin, le contexte et les informations utiles pour notre équipe."
                />
              </label>

              {formError ? <div className="simple-error">{formError}</div> : null}
            </div>

            <aside className="simple-context">
              <strong>{client.companyName}</strong>
              <span>{email}</span>
              <p>
                Votre adresse sera utilisée en réponse directe pour faciliter les échanges avec le support.
              </p>
            </aside>
          </div>
        )}

        <footer className="simple-modal-footer">
          {requestId ? (
            <button type="button" className="primary-action" onClick={onClose}>
              Fermer
            </button>
          ) : (
            <>
              <button type="button" className="secondary-action" disabled={isSubmitting} onClick={onClose}>
                Annuler
              </button>
              <button type="button" className="primary-action" disabled={isSubmitting} onClick={handleSubmit}>
                {isSubmitting ? <Loader2 className="loading-icon" aria-hidden="true" /> : <Send aria-hidden="true" />}
                Envoyer
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
