import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, Lock } from "lucide-react";
import type { ReactNode } from "react";

type ActionCardProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  tone?: "primary" | "neutral" | "yellow";
  disabled?: boolean;
  disabledText?: string;
  actionLabel: string;
  onAction?: () => void;
  footer?: ReactNode;
};

export function ActionCard({
  title,
  description,
  icon: Icon,
  tone = "neutral",
  disabled = false,
  disabledText,
  actionLabel,
  onAction,
  footer
}: ActionCardProps) {
  return (
    <article className={`action-card action-card-${tone} ${disabled ? "is-disabled" : ""}`}>
      <div className="action-card-icon">
        <Icon aria-hidden="true" />
      </div>
      <div className="action-card-body">
        <h3>{title}</h3>
        <p>{disabled ? disabledText || description : description}</p>
      </div>
      <button type="button" disabled={disabled} onClick={onAction} className="action-card-button">
        {disabled ? <Lock aria-hidden="true" /> : <ArrowUpRight aria-hidden="true" />}
        <span>{actionLabel}</span>
      </button>
      {footer ? <div className="action-card-footer">{footer}</div> : null}
    </article>
  );
}

