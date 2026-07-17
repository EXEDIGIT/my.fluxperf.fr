import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Flag,
  Globe2,
  Loader2,
  Paperclip,
  Send,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
  Zap
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  submitInterventionRequest,
  type InterventionNeed,
  type InterventionPriority,
  type InterventionService
} from "../lib/api";
import type { Client, ClientSolution } from "../types/client";

type InterventionRequestModalProps = {
  client: Client;
  email: string;
  isOpen: boolean;
  onSupportRequest: (preset: { subject: string; message: string }) => void;
  onClose: () => void;
};

type Step = {
  label: string;
  title: string;
};

type ServiceOption = {
  id: InterventionService;
  label: string;
  description: string;
  icon: LucideIcon;
};

type NeedOption = {
  id: InterventionNeed;
  label: string;
};

type PriorityOption = {
  id: InterventionPriority;
  label: string;
  description: string;
  icon: LucideIcon;
};

const maxFiles = 5;
const maxFileSize = 10 * 1024 * 1024;
const maxTotalFileSize = 15 * 1024 * 1024;

const steps: Step[] = [
  { label: "Service", title: "Quel flux concerne votre demande ?" },
  { label: "Contexte", title: "Precisez le contexte" },
  { label: "Details", title: "Decrivez votre besoin" },
  { label: "Confirmation", title: "Verifiez avant envoi" }
];

const serviceOptions: ServiceOption[] = [
  {
    id: "visibility_acquisition",
    label: "Flux Visibilité & Acquisition",
    description: "Sites web, SEO, SEA, contenus et performance.",
    icon: Globe2
  },
  {
    id: "automation_ai",
    label: "Flux Automatisation & IA",
    description: "Processus, integrations, agents et automatisations.",
    icon: Zap
  },
  {
    id: "assistant_ai",
    label: "Flux Assistant IA",
    description: "Assistant IA, copilotes metier et support intelligent.",
    icon: Bot
  }
];

const needOptions: NeedOption[] = [
  { id: "content_update", label: "Mise a jour de contenus" },
  { id: "technical_issue", label: "Anomalie technique" },
  { id: "new_creation", label: "Nouvelle creation" },
  { id: "seo", label: "Referencement SEO" },
  { id: "advertising_campaign", label: "Campagne publicitaire" },
  { id: "automation", label: "Automatisation" },
  { id: "ai_assistant", label: "Assistant IA" },
  { id: "other", label: "Autre demande" }
];

const priorityOptions: PriorityOption[] = [
  {
    id: "normal",
    label: "Normale",
    description: "Traitement standard",
    icon: Clock
  },
  {
    id: "urgent",
    label: "Urgente",
    description: "A prioriser",
    icon: Flag
  },
  {
    id: "critical",
    label: "Critique",
    description: "Blocage important",
    icon: AlertTriangle
  }
];

function formatFileSize(size: number): string {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} Ko`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}

function totalFileSize(files: File[]): number {
  return files.reduce((sum, file) => sum + file.size, 0);
}

function labelFor<T extends { id: string; label: string }>(items: T[], id: string): string {
  return items.find((item) => item.id === id)?.label ?? id;
}

function solutionLabel(solution: ClientSolution): string {
  return solution.url || solution.domain || solution.name || solution.id;
}

function solutionSummaryLabel(solution: ClientSolution): string {
  return solution.name || solutionLabel(solution);
}

function solutionSummaryUrl(solution: ClientSolution): string {
  return solution.url || solution.domain;
}

export function InterventionRequestModal({
  client,
  email,
  isOpen,
  onSupportRequest,
  onClose
}: InterventionRequestModalProps) {
  const solutions = useMemo(() => client.solutions ?? [], [client.solutions]);
  const [step, setStep] = useState(0);
  const [service, setService] = useState<InterventionService>("visibility_acquisition");
  const [solutionIds, setSolutionIds] = useState<string[]>([]);
  const [needs, setNeeds] = useState<InterventionNeed[]>([]);
  const [priority, setPriority] = useState<InterventionPriority>("normal");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const wasOpen = useRef(false);

  const selectedService = serviceOptions.find((option) => option.id === service) ?? serviceOptions[0];
  const SelectedServiceIcon = selectedService.icon;
  const serviceSolutions = useMemo(
    () => solutions.filter((solution) => solution.type === service),
    [solutions, service]
  );
  const selectedSolutions = useMemo(
    () => serviceSolutions.filter((solution) => solutionIds.includes(solution.id)),
    [serviceSolutions, solutionIds]
  );

  useEffect(() => {
    if (!isOpen) {
      wasOpen.current = false;
      return;
    }

    if (wasOpen.current) return;

    wasOpen.current = true;

    setStep(0);
    setService("visibility_acquisition");
    setSolutionIds([]);
    setNeeds([]);
    setPriority("normal");
    setMessage("");
    setFiles([]);
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

  useEffect(() => {
    setSolutionIds(serviceSolutions.length === 1 ? [serviceSolutions[0].id] : []);
  }, [service, serviceSolutions]);

  if (!isOpen) {
    return null;
  }

  function validateStep(index: number): string | null {
    if (index === 0 && !service) {
      return "Selectionnez le flux concerne.";
    }

    if (index === 1) {
      if (serviceSolutions.length === 0) {
        return "Aucune solution active ne correspond a ce flux.";
      }

      if (solutionIds.length === 0) {
        return "Selectionnez au moins une solution active.";
      }

      if (needs.length === 0) {
        return "Selectionnez au moins un besoin principal.";
      }
    }

    if (index === 2) {
      if (message.trim().length < 10) {
        return "Ajoutez une description de votre demande.";
      }

      if (files.length > maxFiles) {
        return `Ajoutez ${maxFiles} fichiers maximum.`;
      }

      if (files.some((file) => file.size > maxFileSize)) {
        return "Chaque fichier doit peser 10 Mo maximum.";
      }

      if (totalFileSize(files) > maxTotalFileSize) {
        return "L'ensemble des fichiers doit peser 15 Mo maximum.";
      }
    }

    return null;
  }

  function goNext() {
    const error = validateStep(step);

    if (error) {
      setFormError(error);
      return;
    }

    setFormError(null);
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  function goPrevious() {
    setFormError(null);
    setStep((current) => Math.max(current - 1, 0));
  }

  function toggleSolution(solutionId: string) {
    setSolutionIds((current) =>
      current.includes(solutionId) ? current.filter((id) => id !== solutionId) : [...current, solutionId]
    );
  }

  function toggleNeed(need: InterventionNeed) {
    setNeeds((current) =>
      current.includes(need) ? current.filter((item) => item !== need) : [...current, need]
    );
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList) {
      return;
    }

    const incoming = Array.from(fileList);
    const oversized = incoming.find((file) => file.size > maxFileSize);

    if (oversized) {
      setFormError(`Le fichier "${oversized.name}" depasse 10 Mo.`);
      return;
    }

    setFiles((current) => {
      const next = [...current, ...incoming];

      if (next.length > maxFiles) {
        setFormError(`Ajoutez ${maxFiles} fichiers maximum.`);
        return current;
      }

      if (totalFileSize(next) > maxTotalFileSize) {
        setFormError("L'ensemble des fichiers doit peser 15 Mo maximum.");
        return current;
      }

      setFormError(null);
      return next;
    });
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
  }

  function requestSolutionInfo() {
    onSupportRequest({
      subject: `Information ou activation - ${selectedService.label}`,
      message: `Bonjour,\n\nJe souhaite en savoir plus ou activer une solution ${selectedService.label} pour mon espace client.\n\nMerci.`
    });
  }

  async function handleSubmit() {
    const firstError = [0, 1, 2].map(validateStep).find(Boolean);

    if (firstError) {
      setFormError(firstError);
      setStep(Math.max(0, [0, 1, 2].find((index) => validateStep(index)) ?? 0));
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const result = await submitInterventionRequest({
        service,
        solutionIds,
        needs,
        priority,
        message: message.trim(),
        files
      });

      setRequestId(result.requestId);
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : "La demande n'a pas pu etre transmise. Merci de reessayer."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function renderServiceStep() {
    return (
      <div className="intervention-panel">
        <div className="intervention-panel-heading">
          <span>1</span>
          <h3>{steps[0].title}</h3>
        </div>
        <div className="intervention-service-grid">
          {serviceOptions.map((option) => {
            const Icon = option.icon;
            const isSelected = option.id === service;

            return (
              <button
                className={`intervention-choice ${isSelected ? "is-selected" : ""}`}
                type="button"
                key={option.id}
                onClick={() => {
                  setService(option.id);
                  setFormError(null);
                }}
              >
                <Icon aria-hidden="true" />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
                {isSelected ? <CheckCircle2 aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderContextStep() {
    return (
      <div className="intervention-panel">
        <div className="intervention-panel-heading">
          <span>2</span>
          <h3>{steps[1].title}</h3>
        </div>

        <div className="intervention-block">
          <div className="intervention-hint">
            <SelectedServiceIcon aria-hidden="true" />
            <span>Solutions actives pour {selectedService.label}</span>
          </div>
          {serviceSolutions.length > 0 ? (
            <div className="site-picker">
              {serviceSolutions.map((solution) => {
                const isSelected = solutionIds.includes(solution.id);

                return (
                  <button
                    type="button"
                    className={`site-pill ${isSelected ? "is-selected" : ""}`}
                    key={solution.id}
                    onClick={() => toggleSolution(solution.id)}
                  >
                    <span>{isSelected ? <Check aria-hidden="true" /> : null}</span>
                    <strong>{solution.name || solution.typeLabel}</strong>
                    <small>{solutionLabel(solution)}</small>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="intervention-empty">
              <span>Aucune solution active n'est rattachee a ce flux.</span>
              <button type="button" className="secondary-action" onClick={requestSolutionInfo}>
                <Sparkles aria-hidden="true" />
                Contacter l'equipe
              </button>
            </div>
          )}
        </div>

        <div className="intervention-block">
          <h4>Besoin principal</h4>
          <div className="need-grid">
            {needOptions.map((need) => {
              const isSelected = needs.includes(need.id);

              return (
                <button
                  type="button"
                  className={`need-chip ${isSelected ? "is-selected" : ""}`}
                  key={need.id}
                  onClick={() => toggleNeed(need.id)}
                >
                  {need.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function renderDetailsStep() {
    return (
      <div className="intervention-panel">
        <div className="intervention-panel-heading">
          <span>3</span>
          <h3>{steps[2].title}</h3>
        </div>

        <div className="priority-row">
          {priorityOptions.map((option) => {
            const Icon = option.icon;
            const isSelected = option.id === priority;

            return (
              <button
                className={`priority-button ${isSelected ? "is-selected" : ""}`}
                type="button"
                key={option.id}
                onClick={() => setPriority(option.id)}
              >
                <Icon aria-hidden="true" />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
              </button>
            );
          })}
        </div>

        <label className="intervention-field">
          <span>Votre demande</span>
          <textarea
            value={message}
            rows={7}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Exemple : modifier un texte, corriger une anomalie, ajouter une page, ajuster une automatisation..."
          />
        </label>

        <div className="upload-grid">
          <label className="upload-zone">
            <UploadCloud aria-hidden="true" />
            <strong>Ajouter des fichiers</strong>
            <span>PDF, PNG, JPG, DOCX - 10 Mo par fichier, 15 Mo au total</span>
            <input
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(event) => {
                addFiles(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <label className="photo-button">
            <Camera aria-hidden="true" />
            <span>Prendre une photo</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => {
                addFiles(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>

        {files.length > 0 ? (
          <ul className="file-list">
            {files.map((file, index) => (
              <li key={`${file.name}-${file.lastModified}-${index}`}>
                <FileText aria-hidden="true" />
                <span>
                  <strong>{file.name}</strong>
                  <small>{formatFileSize(file.size)}</small>
                </span>
                <button type="button" aria-label="Retirer le fichier" onClick={() => removeFile(index)}>
                  <Trash2 aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  function renderConfirmationStep() {
    if (requestId) {
      return (
        <div className="intervention-success">
          <CheckCircle2 aria-hidden="true" />
          <h3>Demande recue</h3>
          <p>
            Votre demande a bien ete transmise a l'equipe Fluxperf. Reference :{" "}
            <strong>{requestId}</strong>
          </p>
        </div>
      );
    }

    return (
      <div className="intervention-panel">
        <div className="intervention-panel-heading">
          <span>4</span>
          <h3>{steps[3].title}</h3>
        </div>
        <div className="review-grid">
          <div>
            <small>Service</small>
            <strong>{selectedService.label}</strong>
          </div>
          <div>
            <small>Priorite</small>
            <strong>{labelFor(priorityOptions, priority)}</strong>
          </div>
          <div>
            <small>Besoin</small>
            <strong>{needs.map((need) => labelFor(needOptions, need)).join(", ")}</strong>
          </div>
          <div>
            <small>Solution</small>
            <strong>
              {selectedSolutions.length > 0
                ? selectedSolutions.map((solution) => solution.name || solutionLabel(solution)).join(", ")
                : "Non applicable"}
            </strong>
          </div>
          <div className="review-message">
            <small>Message</small>
            <p>{message}</p>
          </div>
          <div>
            <small>Pieces jointes</small>
            <strong>
              {files.length > 0
                ? `${files.length} fichier${files.length > 1 ? "s" : ""}`
                : "Aucune"}
            </strong>
          </div>
        </div>
      </div>
    );
  }

  function renderCurrentStep() {
    if (step === 0) return renderServiceStep();
    if (step === 1) return renderContextStep();
    if (step === 2) return renderDetailsStep();
    return renderConfirmationStep();
  }

  function renderSelectedSolutionsSummary() {
    return (
      <span className="intervention-side-solutions">
        {selectedSolutions.map((solution) => (
          <span className="intervention-side-solution" key={solution.id}>
            <strong>{solutionSummaryLabel(solution)}</strong>
            {solutionSummaryUrl(solution) ? <small>{solutionSummaryUrl(solution)}</small> : null}
          </span>
        ))}
      </span>
    );
  }

  const canSubmit = step === steps.length - 1 && !requestId;

  return (
    <div className="intervention-backdrop" role="dialog" aria-modal="true" aria-label="Demande d'intervention">
      <section className="intervention-modal">
        <header className="intervention-header">
          <div>
            <span className="section-kicker">Demande d'intervention</span>
            <h2>Nouvelle demande</h2>
          </div>
          <span className="time-badge">
            <Clock aria-hidden="true" />
            Moins de 5 min
          </span>
          <button type="button" aria-label="Fermer la fenetre" disabled={isSubmitting} onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="intervention-stepper" aria-label="Progression">
          {steps.map((item, index) => (
            <button
              type="button"
              key={item.label}
              className={`${index === step ? "is-active" : ""} ${index < step ? "is-done" : ""}`}
              disabled={isSubmitting || index > step}
              onClick={() => {
                if (index <= step) {
                  setStep(index);
                  setFormError(null);
                }
              }}
            >
              <span>{index < step ? <Check aria-hidden="true" /> : index + 1}</span>
              <small>{item.label}</small>
            </button>
          ))}
        </div>

        <div className="intervention-content">
          <div>
            {renderCurrentStep()}
            {formError ? <div className="intervention-error">{formError}</div> : null}
          </div>

          <aside className="intervention-side">
            <strong>{client.companyName}</strong>
            <span>{email}</span>
            <div>
              <Paperclip aria-hidden="true" />
              <span>
                {files.length}/{maxFiles} fichier{files.length > 1 ? "s" : ""} -{" "}
                {formatFileSize(totalFileSize(files))}/15 Mo
              </span>
            </div>
            <div>
              <SelectedServiceIcon aria-hidden="true" />
              <span>{selectedService.label}</span>
            </div>
            {selectedSolutions.length > 0 ? (
              <div>
                <Globe2 aria-hidden="true" />
                <span>{renderSelectedSolutionsSummary()}</span>
              </div>
            ) : null}
          </aside>
        </div>

        <footer className="intervention-footer">
          {requestId ? (
            <button type="button" className="primary-action" onClick={onClose}>
              Fermer
            </button>
          ) : (
            <>
              <button type="button" className="secondary-action" disabled={step === 0 || isSubmitting} onClick={goPrevious}>
                <ArrowLeft aria-hidden="true" />
                Precedent
              </button>
              {canSubmit ? (
                <button type="button" className="primary-action" disabled={isSubmitting} onClick={handleSubmit}>
                  {isSubmitting ? <Loader2 className="loading-icon" aria-hidden="true" /> : <Send aria-hidden="true" />}
                  Envoyer la demande
                </button>
              ) : (
                <button type="button" className="primary-action" disabled={isSubmitting} onClick={goNext}>
                  Suivant
                  <ArrowRight aria-hidden="true" />
                </button>
              )}
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
