import type { PhaseStatus, ProjectStatus, QuoteStatus } from "../../shared/types";
import { projectStatusLabel, quoteStatusLabel } from "@/lib/labels";

type Tone = { bg: string; dot: string; text?: string };
const TONES = {
  cyan: { bg: "#123647", dot: "#00BDE8" },
  amber: { bg: "#3b3022", dot: "#f4c174" },
  green: { bg: "#11362a", dot: "#34d399" },
  red: { bg: "#3a1d26", dot: "#fb7185" },
  slate: { bg: "#1b2a40", dot: "#A7B9CD" },
} satisfies Record<string, Tone>;

const QUOTE_TONE: Record<QuoteStatus, Tone> = { draft: TONES.slate, sent: TONES.amber, approved: TONES.green, rejected: TONES.red, expired: TONES.slate };
const PROJECT_TONE: Record<ProjectStatus, Tone> = { active: TONES.cyan, paused: TONES.amber, delivered: TONES.green, cancelled: TONES.slate };

export function Pill({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  const t = TONES[tone];
  return (
    <span className="sd-status text-[var(--sd-white)]" style={{ background: t.bg }}>
      <i style={{ background: t.dot }} />
      {children}
    </span>
  );
}

const Badge = ({ tone, label }: { tone: Tone; label: string }) => (
  <span className="sd-status text-[var(--sd-white)]" style={{ background: tone.bg }}>
    <i style={{ background: tone.dot }} />
    {label}
  </span>
);

export const QuoteBadge = ({ status }: { status: QuoteStatus }) => <Badge tone={QUOTE_TONE[status]} label={quoteStatusLabel[status]} />;
export const ProjectBadge = ({ status }: { status: ProjectStatus }) => <Badge tone={PROJECT_TONE[status]} label={projectStatusLabel[status]} />;

export function PhaseIcon({ status }: { status: PhaseStatus }) {
  if (status === "done") return <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--sd-cyan)] text-xs font-bold text-[var(--sd-ink)]">✓</span>;
  if (status === "in_progress")
    return (
      <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-[var(--sd-cyan)]">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--sd-cyan)]" />
      </span>
    );
  return <span className="block h-6 w-6 rounded-full border-2 border-[var(--sd-line)]" />;
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[#12294a]" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-gradient-to-r from-[var(--sd-blue)] to-[var(--sd-cyan)] transition-[width] duration-700 ease-out" style={{ width: `${value}%` }} />
    </div>
  );
}
