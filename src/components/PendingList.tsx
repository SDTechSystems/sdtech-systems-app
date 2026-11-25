import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, Bell, CalendarClock, FileText, Flag, Hourglass, MessageCircle, Repeat, Wallet } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "../../shared/money";
import { fillTemplate } from "../../shared/templates";
import type { Pending, PendingItem, PendingKind, Urgency } from "../../shared/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiGet, apiSend } from "@/lib/api";
import { errorMessage, formatDate, formatDateTime } from "@/lib/labels";
import { getPortalUrl } from "@/lib/quote-actions";
import { useSettingsQuery } from "@/lib/useSettings";
import { logReminder, openWhatsApp, paymentVars } from "@/lib/whatsapp";
import type { PaymentSummary } from "../../shared/types";

const ICON: Record<PendingKind, typeof Wallet> = {
  payment: Wallet,
  delivery: Flag,
  phase: CalendarClock,
  quote_expiring: FileText,
  quote_expired: FileText,
  portal: Bell,
  stale: Hourglass,
  subscription: Repeat,
};
const GROUPS: { key: Urgency; label: string; tone: string }[] = [
  { key: "overdue", label: "Vencidos", tone: "border-l-rose-400" },
  { key: "today", label: "Hoy", tone: "border-l-amber-300" },
  { key: "soon", label: "Próximos días", tone: "border-l-[var(--sd-cyan)]" },
  { key: "info", label: "Novedades", tone: "border-l-[var(--sd-line)]" },
];

function Item({ it, onRemind }: { it: PendingItem; onRemind: (it: PendingItem) => void }) {
  const Icon = it.urgency === "overdue" ? AlertTriangle : ICON[it.kind];
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${it.urgency === "overdue" ? "text-rose-400" : "text-muted-foreground"}`} />
      <div className="min-w-0 flex-1">
        <Link to={it.link} className="font-medium hover:underline">
          {it.title}
          {it.amount !== undefined && it.currency ? ` · ${formatMoney(it.amount, it.currency)}` : ""}
        </Link>
        <p className="text-sm text-muted-foreground">
          {it.subtitle}
          {it.date && it.kind !== "stale" && it.kind !== "portal" ? ` · ${formatDate(it.date)}` : ""}
        </p>
        {it.kind === "payment" && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="whatsapp" className="h-8" onClick={() => onRemind(it)}>
              <MessageCircle className="h-4 w-4" /> Cobrar
            </Button>
            <Button size="sm" variant="outline" className="h-8" asChild>
              <Link to={it.link}>Registrar pago</Link>
            </Button>
            {it.lastReminderAt && <span className="text-xs text-muted-foreground">Último recordatorio: {formatDateTime(it.lastReminderAt)}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export function PendingList({ data, owner }: { data: Pending; owner: boolean }) {
  const qc = useQueryClient();
  const settings = useSettingsQuery(owner);
  const seen = useMutation({
    mutationFn: () => apiSend("POST", "/api/admin/pending/seen", {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pending"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remind = async (it: PendingItem) => {
    if (!settings.data || !it.projectId || !it.planId) return;
    const tab = it.clientPhone ? window.open("about:blank", "_blank") : null;
    const [url, pay] = await Promise.all([getPortalUrl(it.clientId), apiGet<PaymentSummary>(`/api/admin/projects/${it.projectId}/payments`)]);
    const plan = pay.plans.find((p) => p.id === it.planId);
    if (!plan) return tab?.close();
    const text = fillTemplate(settings.data.settings.templates.payment, paymentVars(plan, pay.currency, it.clientName, settings.data.settings, url));
    const sent = openWhatsApp(it.clientPhone, text, tab);
    await logReminder("payment_plan", plan.id, "payment");
    qc.invalidateQueries({ queryKey: ["pending"] });
    if (!sent) toast.success("El cliente no tiene WhatsApp: copiamos el mensaje.");
  };

  if (!data.items.length) {
    return (
      <Card className="p-8 text-center">
        <p className="text-lg font-semibold">Todo al día ✅</p>
        <p className="text-sm text-muted-foreground">No hay cobros, entregas ni novedades pendientes.</p>
      </Card>
    );
  }
  return (
    <div className="sd-stagger space-y-6">
      {GROUPS.map((g) => {
        const items = data.items.filter((i) => i.urgency === g.key);
        if (!items.length) return null;
        const hasPortal = items.some((i) => i.kind === "portal");
        return (
          <section key={g.key} className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="sd-eyebrow">
                {g.label} ({items.length})
              </h2>
              {hasPortal && owner && (
                <Button size="sm" variant="ghost" onClick={() => seen.mutate()}>
                  Marcar novedades como vistas
                </Button>
              )}
            </div>
            <Card className={`sd-stagger divide-y overflow-hidden border-l-4 ${g.tone}`}>
              {items.map((it, i) => (
                <Item key={`${it.kind}-${it.planId ?? it.quoteId ?? it.projectId}-${i}`} it={it} onRemind={remind} />
              ))}
            </Card>
          </section>
        );
      })}
    </div>
  );
}
