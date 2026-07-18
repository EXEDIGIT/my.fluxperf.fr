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
  { label: "Contexte", title: "Précisez le contexte" },
  { label: "Détails", title: "Décrivez votre besoin" },
  { label: "Confirmation", title: "Vérifiez avant envoi" }
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
    description: "Processus, intégrations, agents et automatisations.",
    icon: Zap
  },
  {
    id: "assistant_ai",
    label: "Flux Assistant IA",
    description: "Assistant IA, copilotes métier et support intelligent.",
    icon: Bot
  }
];

const needOptionsByService: Record<InterventionService, NeedOption[]> = {
  visibility_acquisition: [
    { id: "content_update", label: "Mise à jour de contenus" },
    { id: "technical_issue", label: "Anomalie technique site" },
    { id: "page_creation", label: "Création / ajout de page" },
    { id: "seo", label: "Référencement SEO" },
    { id: "advertising_campaign", label: "Campagne publicitaire" },
    { id: "tracking_analytics", label: "Tracking / analytics" },
    { id: "performance_optimization", label: "Performance / optimisation" },
    { id: "other", label: "Autre demande" }
  ],
  automation_ai: [
    { id: "dashboard_reporting", label: "Tableau de bord / reporting" },
    { id: "process_automation", label: "Automatisation de processus" },
    { id: "tool_integration", label: "Connexion outils / intégration" },
    { id: "workflow_issue", label: "Anomalie workflow" },
    { id: "data_sync", label: "Données / synchronisation" },
    { id: "ai_prompt_optimization", label: "Optimisation IA / prompt" },
    { id: "scenario_improvement", label: "Amélioration de scénario" },
    { id: "other", label: "Autre demande" }
  ],
  assistant_ai: [
    { id: "answer_adjustment", label: "Ajustement des réponses" },
    { id: "knowledge_base", label: "Base de connaissances" },
    { id: "prompt_instructions", label: "Consignes / prompts" },
    { id: "access_issue", label: "Accès ou anomalie" },
    { id: "new_capability", label: "Nouvelle capacité" },
    { id: "conversation_analysis", label: "Analyse / amélioration" },
    { id: "user_support", label: "Accompagnement utilisateur" },
    { id: "other", label: "Autre demande" }
  ]
};

const allNeedOptions = Object.values(needOptionsByService).flat();

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
    description: "À prioriser",
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

function labelForNeed(service: InterventionService | null, id: string): string {
  const serviceNeeds = service ? needOptionsByService[service] : [];

  return [...serviceNeeds, ...allNeedOptions].find((item) => item.id === id)?.label ?? id;
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
  const [service, setService] = useState<InterventionService | null>(null);
  const [solutionIds, setSolutionIds] = useState<string[]>([]);
  const [needs, setNeeds] = useState<InterventionNeed[]>([]);
  const [priority, setPriority] = useState<InterventionPriority>("normal");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const wasOpen = useRef(false);

  const selectedService = service ? serviceOptions.find((option) => option.id === service) ?? null : null;
  const SelectedServiceIcon = selectedService?.icon;
  const needOptions = service ? needOptionsByService[service] : [];
  const serviceSolutions = useMemo(
    () => (service ? solutions.filter((solution) => solution.type === service) : []),
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
    setService(null);
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
    if (!service) {
      setSolutionIds([]);
      return;
    }

    setSolutionIds(serviceSolutions.length === 1 ? [serviceSolutions[0].id] : []);
  }, [service, serviceSolutions]);

  if (!isOpen) {
    return null;
  }

  function validateStep(index: number): string | null {
    if (index === 0 && !service) {
      return "Sélectionnez le flux concerné.";
    }

    if (index === 1) {
      if (!service) {
        return "Sélectionnez le flux concerné.";
      }

      if (serviceSolutions.length === 0) {
        return "Aucune solution active ne correspond à ce flux.";
      }

      if (solutionIds.length === 0) {
        return "Sélectionnez au moins une solution active.";
      }

      if (needs.length === 0) {
        return "Sélectionnez au moins un besoin principal.";
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
      setFormError(`Le fichier "${oversized.name}" dépasse 10 Mo.`);
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
    const serviceLabel = selectedService?.label ?? "Fluxperf";

    onSupportRequest({
      subject: `Information ou activation - ${serviceLabel}`,
      message: `Bonjour,\n\nJe souhaite en savoir plus ou activer une solution ${serviceLabel} pour mon espace client.\n\nMerci.`
    });
  }

  async function handleSubmit() {
    const firstError = [0, 1, 2].map(validateStep).find(Boolean);

    if (firstError) {
      setFormError(firstError);
      setStep(Math.max(0, [0, 1, 2].find((index) => validateStep(index)) ?? 0));
      return;
    }

    if (!service) {
      setFormError("Sélectionnez le flux concerné.");
      setStep(0);
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
          : "La demande n'a pas pu être transmise. Merci de réessayer."
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
                  setSolutionIds([]);
                  setNeeds([]);
                  setFormError(null);
                  setStep(1);
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
    const ContextServiceIcon = SelectedServiceIcon ?? Sparkles;

    return (
      <div className="intervention-panel">
        <div className="intervention-panel-heading">
          <span>2</span>
          <h3>{steps[1].title}</h3>
        </div>

        <div className="intervention-block">
          <div className="intervention-hint">
            <ContextServiceIcon aria-hidden="true" />
            <span>Solutions actives pour {selectedService?.label ?? "ce flux"}</span>
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
              <span>Aucune solution active n'est rattachée à ce flux.</span>
              <button type="button" className="secondary-action" onClick={requestSolutionInfo}>
                <Sparkles aria-hidden="true" />
                Contacter l'équipe
              </button>
            </div>
          )}
        </div>

        <div className="intervention-block">
          <h4>Besoins principaux</h4>
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
          <h3>Demande reçue</h3>
          <p>
            Votre demande a bien été transmise à l'équipe Fluxperf. Référence :{" "}
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
            <strong>{selectedService?.label ?? "Non sélectionné"}</strong>
          </div>
          <div>
            <small>Priorité</small>
            <strong>{labelFor(priorityOptions, priority)}</strong>
          </div>
          <div>
            <small>Besoin</small>
            <strong>{needs.map((need) => labelForNeed(service, need)).join(", ")}</strong>
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
            <small>Pièces jointes</small>
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
          <button type="button" aria-label="Fermer la fenêtre" disabled={isSubmitting} onClick={onClose}>
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
            {selectedService && SelectedServiceIcon ? (
              <div>
                <SelectedServiceIcon aria-hidden="true" />
                <span>{selectedService.label}</span>
              </div>
            ) : null}
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
                Précédent
              </button>
              {canSubmit ? (
                <button type="button" className="primary-action" disabled={isSubmitting} onClick={handleSubmit}>
                  {isSubmitting ? <Loader2 className="loading-icon" aria-hidden="true" /> : <Send aria-hidden="true" />}
                  Envoyer la demande
                </button>
              ) : (
                <button type="button" className="primary-action" disabled={isSubmitting || (step === 0 && !service)} onClick={goNext}>
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
