import type { PhaseStatus, ProjectStatus, QuoteStatus } from "../../shared/types";
import { cn } from "@/lib/utils";
import { projectStatusLabel, quoteStatusLabel } from "@/lib/labels";

const QUOTE_STYLE: Record<QuoteStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  expired: "bg-slate-200 text-slate-700",
};
const PROJECT_STYLE: Record<ProjectStatus, string> = {
  active: "bg-blue-100 text-blue-800",
  paused: "bg-amber-100 text-amber-800",
  delivered: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-200 text-slate-700",
};

const pill = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap";

export const QuoteBadge = ({ status }: { status: QuoteStatus }) => <span className={cn(pill, QUOTE_STYLE[status])}>{quoteStatusLabel[status]}</span>;
export const ProjectBadge = ({ status }: { status: ProjectStatus }) => <span className={cn(pill, PROJECT_STYLE[status])}>{projectStatusLabel[status]}</span>;

export function PhaseIcon({ status }: { status: PhaseStatus }) {
  if (status === "done") return <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500 text-xs font-bold text-white">✓</span>;
  if (status === "in_progress") return <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-[var(--sd-blue)]"><span className="h-2.5 w-2.5 rounded-full bg-[var(--sd-blue)]" /></span>;
  return <span className="block h-6 w-6 rounded-full border-2 border-muted-foreground/40" />;
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-gradient-to-r from-[var(--sd-blue)] to-[var(--sd-cyan)]" style={{ width: `${value}%` }} />
    </div>
  );
}
