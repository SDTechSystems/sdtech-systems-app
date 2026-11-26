import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileText, MessageCircle, Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { addDays, todayBogota } from "../../shared/dates";
import { formatMoney, parseMoneyInput, signedMoney } from "../../shared/money";
import { fillTemplate } from "../../shared/templates";
import type { Client, Collection, PaymentPlan, PaymentSummary } from "../../shared/types";
import type { PaymentTarget } from "@/components/PaymentDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { methodLabel } from "../../shared/payment-methods";
import { apiGet, apiSend } from "@/lib/api";
import { errorMessage, formatDate, formatDateTime } from "@/lib/labels";
import { priceText } from "@/lib/money-input";
import { getPortalUrl } from "@/lib/quote-actions";
import { useSettingsQuery } from "@/lib/useSettings";
import { logReminder, openWhatsApp, paymentVars } from "@/lib/whatsapp";

const STATUS_STYLE = { paid: "text-emerald-400", overdue: "text-rose-400 font-semibold", pending: "text-muted-foreground" } as const;

export function PaymentsCard({
  projectId,
  client,
  lastReminders,
  collections,
  onBill,
  onPay,
}: {
  projectId: string;
  client: Pick<Client, "id" | "name" | "phone">;
  lastReminders: Record<string, string>;
  collections: Collection[];
  /** Abre el editor de cuenta de cobro con esta promesa. */
  onBill: (plan: PaymentPlan) => void;
  onPay: (target: PaymentTarget) => void;
}) {
  const qc = useQueryClient();
  const key = ["payments", projectId];
  const { data } = useQuery({ queryKey: key, queryFn: () => apiGet<PaymentSummary>(`/api/admin/projects/${projectId}/payments`) });
  const settings = useSettingsQuery();
  const methods = settings.data?.settings.payment.methods ?? [];
  const [planOpen, setPlanOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");

  const done = (r: PaymentSummary) => {
    qc.setQueryData(key, r);
    qc.invalidateQueries({ queryKey: ["pending"] });
    qc.invalidateQueries({ queryKey: ["project", projectId] });
    qc.invalidateQueries({ queryKey: ["collections", projectId] });
    setPlanOpen(false);
  };
  const call = useMutation({
    mutationFn: ({ method: m, path, body }: { method: "POST" | "PATCH" | "DELETE"; path: string; body?: unknown }) => apiSend<PaymentSummary>(m, path, body),
    onSuccess: (r) => {
      done(r);
      toast.success("Guardado");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const openPlan = () => {
    setLabel(data?.plans.length ? "Saldo" : "Anticipo");
    setAmount(data ? priceText(Math.max(data.balance - data.plans.filter((p) => p.status !== "paid").reduce((s, p) => s + p.amount - p.paidAmount, 0), 0), data.currency) : "");
    setDate(addDays(todayBogota(), 7));
    setPlanOpen(true);
  };
  const remind = async (plan: PaymentPlan) => {
    if (!data || !settings.data) return;
    const tab = client.phone ? window.open("about:blank", "_blank") : null;
    const url = await getPortalUrl(client.id);
    const text = fillTemplate(settings.data.settings.templates.payment, paymentVars(plan, data.currency, client.name, settings.data.settings, url));
    const sent = openWhatsApp(client.phone, text, tab);
    await logReminder("payment_plan", plan.id, "payment");
    qc.invalidateQueries({ queryKey: ["project", projectId] });
    qc.invalidateQueries({ queryKey: ["pending"] });
    if (!sent) toast.success("El cliente no tiene WhatsApp: copiamos el mensaje.");
  };

  if (!data) return null;
  const m = (n: number) => formatMoney(n, data.currency);
  // La cuenta abierta que ya cobra cada promesa (una a la vez).
  const billedIn = new Map(collections.filter((c) => c.status === "pending" || c.status === "partial").flatMap((c) => c.planIds.map((id) => [id, c.number] as const)));

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4" /> Pagos
        </CardTitle>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={openPlan}>
            <Plus className="h-4 w-4" /> Compromiso
          </Button>
          <Button size="sm" variant="outline" onClick={() => onPay({})}>
            <Plus className="h-4 w-4" /> Pago
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ["Total", data.total],
            ["Pagado", data.paid],
            ["Saldo", data.balance],
          ].map(([l, v]) => (
            <div key={l as string} className="rounded-lg bg-muted/60 p-2">
              <p className="text-xs text-muted-foreground">{l}</p>
              <p className={`whitespace-nowrap text-sm font-bold sm:text-base ${l === "Saldo" && (v as number) < 0 ? "text-amber-400" : ""}`}>{m(v as number)}</p>
            </div>
          ))}
        </div>

        {data.changesTotal !== 0 && (
          <p className="text-xs text-muted-foreground">
            Cotización {m(data.baseTotal)} · cambios aprobados {signedMoney(data.changesTotal, data.currency)}
          </p>
        )}

        {data.plans.length > 0 && (
          <div className="divide-y rounded-lg border">
            {data.plans.map((p) => (
              <div key={p.id} className="space-y-2 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {p.label} · {m(p.amount)}
                  </span>
                  <span className={`text-sm ${STATUS_STYLE[p.status]}`}>
                    {p.status === "paid" ? "Pagado" : `${p.status === "overdue" ? "Venció" : "Vence"} el ${formatDate(p.dueDate)}`}
                  </span>
                </div>
                {p.status !== "paid" && (
                  <>
                    {p.paidAmount > 0 && <p className="text-xs text-muted-foreground">Abonado {m(p.paidAmount)} · faltan {m(p.amount - p.paidAmount)}</p>}
                    {lastReminders[p.id] && <p className="text-xs text-muted-foreground">Último recordatorio: {formatDateTime(lastReminders[p.id])}</p>}
                    {billedIn.has(p.id) && <p className="text-xs text-muted-foreground">En la cuenta de cobro {billedIn.get(p.id)}</p>}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="whatsapp" onClick={() => remind(p)}>
                        <MessageCircle className="h-4 w-4" /> Cobrar por WhatsApp
                      </Button>
                      {!billedIn.has(p.id) && (
                        <Button size="sm" variant="outline" onClick={() => onBill(p)}>
                          <FileText className="h-4 w-4" /> Cuenta de cobro
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => onPay({ plan: p })}>
                        Registrar pago
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => call.mutate({ method: "PATCH", path: `/api/admin/payment-plans/${p.id}`, body: { paid: true } })}>
                        <Check className="h-4 w-4" /> Marcar pagado
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Borrar compromiso"
                        onClick={() => confirm(`¿Borrar el compromiso «${p.label}»? Los pagos registrados se conservan.`) && call.mutate({ method: "DELETE", path: `/api/admin/payment-plans/${p.id}` })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {data.payments.length > 0 && (
          <div>
            <p className="mb-1 text-sm font-semibold">Pagos recibidos</p>
            <ul className="divide-y text-sm">
              {data.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    {m(p.amount)} · {methodLabel(methods, p.method)} · {formatDate(p.paidOn)}
                    {p.note && <span className="block text-xs text-muted-foreground">{p.note}</span>}
                  </span>
                  <Button size="icon" variant="ghost" aria-label="Borrar pago" onClick={() => confirm("¿Borrar este pago?") && call.mutate({ method: "DELETE", path: `/api/admin/payments/${p.id}` })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo compromiso de pago</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              call.mutate({ method: "POST", path: `/api/admin/projects/${projectId}/payment-plans`, body: { label, amount: parseMoneyInput(amount, data.currency) ?? 0, dueDate: date } });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="plabel">Concepto</Label>
              <Input id="plabel" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Anticipo, Abono, Saldo, Cuota 2…" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="plamount">Monto</Label>
                <Input id="plamount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pldate">Fecha acordada</Label>
                <Input id="pldate" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={call.isPending}>
              Guardar
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
