import { ExternalLink, X } from "lucide-react";
import { useEffect } from "react";

type JotformModalProps = {
  title: string;
  url: string | null;
  isOpen: boolean;
  onClose: () => void;
};

export function JotformModal({ title, url, isOpen, onClose }: JotformModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.classList.add("modal-open");
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !url) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="jotform-modal">
        <header className="modal-header">
          <div>
            <span className="section-kicker">Formulaire FluxPerf</span>
            <h2>{title}</h2>
          </div>
          <button type="button" aria-label="Fermer la fenêtre" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>
        <iframe
          title={title}
          src={url}
          loading="lazy"
          sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
        />
        <footer className="modal-footer">
          <a href={url} target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden="true" />
            Ouvrir dans un nouvel onglet
          </a>
        </footer>
      </div>
    </div>
  );
}

