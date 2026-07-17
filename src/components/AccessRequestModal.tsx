import { CheckCircle2, Loader2, Send, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, submitAccessRequest } from "../lib/api";

type AccessRequestModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

type AccessRequestForm = {
  firstName: string;
  lastName: string;
  email: string;
  companyName: string;
  referrer: string;
  message: string;
  website: string;
};

const emptyForm: AccessRequestForm = {
  firstName: "",
  lastName: "",
  email: "",
  companyName: "",
  referrer: "",
  message: "",
  website: ""
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function AccessRequestModal({ isOpen, onClose }: AccessRequestModalProps) {
  const [form, setForm] = useState<AccessRequestForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setForm(emptyForm);
    setFormError(null);
    setIsSubmitting(false);
    setRequestId(null);
  }, [isOpen]);

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

  function updateField(field: keyof AccessRequestForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function validate(): string | null {
    if (form.firstName.trim().length < 1) {
      return "Renseignez votre prenom.";
    }

    if (form.lastName.trim().length < 1) {
      return "Renseignez votre nom.";
    }

    if (!isValidEmail(form.email)) {
      return "Renseignez une adresse email valide.";
    }

    if (form.companyName.trim().length < 2) {
      return "Renseignez le nom de votre entreprise.";
    }

    if (form.message.trim().length < 10) {
      return "Ajoutez une description pour guider nos equipes.";
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
      const response = await submitAccessRequest({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
        companyName: form.companyName.trim(),
        referrer: form.referrer.trim(),
        message: form.message.trim(),
        website: form.website.trim()
      });

      setRequestId(response.requestId);
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "La demande n'a pas pu etre transmise pour le moment."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="simple-modal-backdrop" role="dialog" aria-modal="true" aria-label="Demande d'acces MyFluxperf">
      <section className="simple-modal access-modal">
        <header className="simple-modal-header">
          <div>
            <span className="section-kicker">Acces MyFluxperf</span>
            <h2>Demander un acces</h2>
          </div>
          <button type="button" aria-label="Fermer la fenetre" disabled={isSubmitting} onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        {requestId ? (
          <div className="simple-success">
            <CheckCircle2 aria-hidden="true" />
            <h3>Demande transmise</h3>
            <p>
              Votre demande d'acces a bien ete envoyee a Fluxperf. Reference :{" "}
              <strong>{requestId}</strong>
            </p>
          </div>
        ) : (
          <div className="simple-modal-content access-modal-content">
            <div className="simple-form">
              <div className="access-field-grid">
                <label className="simple-field">
                  <span>Prenom</span>
                  <input
                    value={form.firstName}
                    maxLength={80}
                    autoComplete="given-name"
                    onChange={(event) => updateField("firstName", event.target.value)}
                    placeholder="Votre prenom"
                  />
                </label>

                <label className="simple-field">
                  <span>Nom</span>
                  <input
                    value={form.lastName}
                    maxLength={80}
                    autoComplete="family-name"
                    onChange={(event) => updateField("lastName", event.target.value)}
                    placeholder="Votre nom"
                  />
                </label>
              </div>

              <label className="simple-field">
                <span>Email</span>
                <input
                  value={form.email}
                  maxLength={180}
                  type="email"
                  autoComplete="email"
                  onChange={(event) => updateField("email", event.target.value)}
                  placeholder="vous@entreprise.fr"
                />
              </label>

              <label className="simple-field">
                <span>Entreprise</span>
                <input
                  value={form.companyName}
                  maxLength={140}
                  autoComplete="organization"
                  onChange={(event) => updateField("companyName", event.target.value)}
                  placeholder="Nom de votre entreprise"
                />
              </label>

              <label className="simple-field">
                <span>Referent client ou contact Fluxperf connu (facultatif)</span>
                <input
                  value={form.referrer}
                  maxLength={180}
                  onChange={(event) => updateField("referrer", event.target.value)}
                  placeholder="Exemple : votre responsable ou contact Fluxperf"
                />
              </label>

              <label className="simple-field">
                <span>Description de la demande</span>
                <textarea
                  value={form.message}
                  maxLength={4000}
                  rows={7}
                  onChange={(event) => updateField("message", event.target.value)}
                  placeholder="Precisez pourquoi vous souhaitez acceder a MyFluxperf et toute information utile pour verifier la demande."
                />
              </label>

              <label className="access-honeypot" aria-hidden="true">
                <span>Site web</span>
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.website}
                  onChange={(event) => updateField("website", event.target.value)}
                />
              </label>

              {formError ? <div className="simple-error">{formError}</div> : null}
            </div>

            <aside className="simple-context">
              <strong>Verification Fluxperf</strong>
              <p>
                Nos equipes verifieront la demande avant toute creation ou ouverture d'acces a
                MyFluxperf.
              </p>
              <p>Utilisez votre adresse professionnelle pour faciliter le rattachement au bon espace client.</p>
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
