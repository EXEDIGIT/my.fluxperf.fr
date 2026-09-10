import { AlertTriangle, CheckCircle2, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError } from "../lib/api";
import { getAdminMonthlyReport, getAdminMonthlyReports, retryAdminMonthlyReport } from "../lib/adminApi";
import type { AdminMonthlyReportDetail, AdminMonthlyReportListItem } from "../types/admin";

function date(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }).format(parsed);
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = { pending: "En attente", generating: "Génération", ready: "Prêt", sent: "Envoyé", failed: "Échec", skipped: "Ignoré", unknown: "À vérifier", sending: "Envoi en cours" };
  return labels[status] || status;
}

function reportMetrics(report: Record<string, unknown> | null): Array<[string, string]> {
  const current = report?.current;
  if (!current || typeof current !== "object") return [];
  const values = current as Record<string, unknown>;
  const number = (value: unknown) => typeof value === "number" ? new Intl.NumberFormat("fr-FR").format(Math.round(value)) : "—";
  const rate = typeof values.engagementRate === "number" ? `${Math.round(values.engagementRate * 1000) / 10}%` : "—";
  return [["Sessions", number(values.sessions)], ["Utilisateurs actifs", number(values.activeUsers)], ["Vues", number(values.views)], ["Taux d’engagement", rate]];
}

function reportExtras(report: Record<string, unknown> | null): string[] {
  const channels = Array.isArray(report?.channels) ? report.channels : [];
  const events = Array.isArray(report?.keyEvents) ? report.keyEvents : [];
  const channel = channels.find((item): item is { label: string } => Boolean(item && typeof item === "object" && typeof (item as { label?: unknown }).label === "string" && (item as { label: string }).label));
  const eventLabels = events.flatMap((item) => item && typeof item === "object" && typeof (item as { name?: unknown }).name === "string" && typeof (item as { count?: unknown }).count === "number"
    ? [`${(item as { name: string }).name} (${(item as { count: number }).count})`]
    : []);
  return [...(channel ? [`Canal principal : ${channel.label}`] : []), ...(eventLabels.length ? [`Actions clés : ${eventLabels.join(" · ")}`] : [])];
}

export function MonthlyReportsPanel() {
  const [reports, setReports] = useState<AdminMonthlyReportListItem[]>([]);
  const [selected, setSelected] = useState<AdminMonthlyReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try { setReports((await getAdminMonthlyReports()).reports); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : "Les bilans ne peuvent pas être chargés."); }
    finally { setLoading(false); }
  }

  async function open(reportId: string) {
    setError(null);
    try { setSelected((await getAdminMonthlyReport(reportId)).report); }
    catch (reason) { setError(reason instanceof ApiError ? reason.message : "Le détail est indisponible."); }
  }

  async function retry(reportId: string, deliveryId?: string) {
    setRetrying(deliveryId || reportId); setError(null);
    try {
      await retryAdminMonthlyReport(reportId, deliveryId);
      await load();
      if (selected?.id === reportId) await open(reportId);
    } catch (reason) { setError(reason instanceof ApiError ? reason.message : "La relance n'a pas pu être enregistrée."); }
    finally { setRetrying(null); }
  }

  useEffect(() => { void load(); }, []);

  return <section className="admin-monthly-reports">
    <div className="admin-panel-heading">
      <div><h2>Bilans mensuels</h2><p>Suivi des générations et des envois Brevo. Les états « À vérifier » ne sont jamais relancés automatiquement.</p></div>
      <button type="button" className="admin-secondary-button" onClick={() => void load()} disabled={loading}><RefreshCw aria-hidden="true" /> Actualiser</button>
    </div>
    {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
    {loading ? <p className="admin-empty-copy"><Loader2 className="loading-icon" aria-hidden="true" /> Chargement des bilans…</p> : null}
    {!loading && reports.length === 0 ? <p className="admin-empty-copy">Aucun bilan mensuel n’a encore été généré.</p> : null}
    <div className="admin-monthly-report-list">
      {reports.map((report) => <article key={report.id} className="admin-monthly-report-row">
        <div><strong>{report.companyName}</strong><small>{report.periodKey} · {report.deliveryCount} destinataire{report.deliveryCount > 1 ? "s" : ""}</small></div>
        <span className={`admin-status-badge is-${report.status}`}>{statusLabel(report.status)}</span>
        <small>{report.sentCount} envoyé{report.sentCount > 1 ? "s" : ""} · {report.failedCount} échec{report.failedCount > 1 ? "s" : ""}{report.unknownCount ? ` · ${report.unknownCount} à vérifier` : ""}<br />{report.errorMessage || `Dernier envoi : ${date(report.sentAt)}`}</small>
        <button type="button" onClick={() => void open(report.id)}>Détail <ChevronRight aria-hidden="true" /></button>
      </article>)}
    </div>
    {selected ? <section className="admin-monthly-report-detail">
      <div className="admin-section-title-row"><div><h3>{selected.companyName} — {selected.periodKey}</h3><p>Généré : {date(selected.generatedAt)} · Dernier envoi : {date(selected.sentAt)}</p></div>{selected.generationStatus === "failed" ? <button type="button" className="admin-secondary-button" disabled={retrying === selected.id} onClick={() => void retry(selected.id)}><RefreshCw aria-hidden="true" /> Relancer le bilan</button> : null}</div>
      {selected.insight ? <p className="admin-monthly-insight">{selected.insight}</p> : null}
      {selected.errorMessage ? <p className="admin-form-error"><AlertTriangle aria-hidden="true" /> {selected.errorMessage}</p> : null}
      {reportMetrics(selected.report).length ? <div className="admin-monthly-kpis">{reportMetrics(selected.report).map(([label, value]) => <span key={label}><small>{label}</small><strong>{value}</strong></span>)}</div> : null}
      {reportExtras(selected.report).map((item) => <p key={item} className="admin-monthly-extra">{item}</p>)}
      <div className="admin-monthly-deliveries">
        {selected.deliveries.map((delivery) => <div key={delivery.id}><span>{delivery.recipientName || delivery.recipientEmail}</span><small>{delivery.recipientEmail}</small><span className={`admin-status-badge is-${delivery.status}`}>{statusLabel(delivery.status)}</span><small>{delivery.errorMessage || date(delivery.sentAt)}</small>{delivery.status === "failed" ? <button type="button" disabled={retrying === delivery.id} onClick={() => void retry(selected.id, delivery.id)}>{retrying === delivery.id ? <Loader2 className="loading-icon" /> : <RefreshCw />} Relancer</button> : delivery.status === "sent" ? <CheckCircle2 aria-label="Envoyé" /> : null}</div>)}
      </div>
    </section> : null}
  </section>;
}
