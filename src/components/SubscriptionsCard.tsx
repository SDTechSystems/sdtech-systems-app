import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Pencil, Plus, Repeat, Wallet } from "lucide-react";
import { toast } from "sonner";
import { todayBogota } from "../../shared/dates";
import { formatMoney } from "../../shared/money";
import { fillTemplate } from "../../shared/templates";
import type { PaymentMethod, Subscription } from "../../shared/types";
import { SubscriptionDialog } from "@/components/SubscriptionDialog";
import { Pill } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiGet, apiSend } from "@/lib/api";
import { errorMessage, formatDate } from "@/lib/labels";
import { useSettingsQuery } from "@/lib/useSettings";
import { logReminder, openWhatsApp, subscriptionVars } from "@/lib/whatsapp";

const METHODS: Record<PaymentMethod, string> = { breb: "Bre-B", nequi: "Nequi", bancolombia: "Bancolombia", efectivo: "Efectivo" };
const STATUS = { active: ["cyan", "Activa"], paused: ["amber", "Pausada"], cancelled: ["slate", "Cancelada"] } as const;

export function SubscriptionRow({ s, showClient }: { s: Subscription; showClient?: boolean }) {
  const qc = useQueryClient();
  const settings = useSettingsQuery();
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("breb");
  const [paidOn, setPaidOn] = useState(todayBogota());
  const pay = useMutation({
    mutationFn: () => apiSend<{ subscription: Subscription }>("POST", `/api/admin/subscriptions/${s.id}/pay`, { method, paidOn }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["pending"] });
      setPaying(false);
      toast.success(`Pago registrado. Próximo cobro: ${formatDate(r.subscription.nextDue)}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remind = () => {
    if (!settings.data) return;
    const sent = openWhatsApp(s.clientPhone, fillTemplate(settings.data.settings.templates.subscription, subscriptionVars(s, settings.data.settings)));
    void logReminder("client", s.clientId, "subscription");
    if (!sent) toast.success("El cliente no tiene WhatsApp: copiamos el mensaje.");
  };
  const late = s.status === "active" && s.nextDue < todayBogota();
  return (
    <div className="space-y-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {s.name}
            {showClient && <span className="text-muted-foreground"> · {s.clientName}</span>}
          </p>
          <p className="text-sm text-muted-foreground">
            {formatMoney(s.amount, s.currency)}
            {s.cycle === "mensual" ? "/mes" : "/año"}
            {s.provider ? ` · ${s.provider}` : ""}
          </p>
          <p className={`text-sm ${late ? "font-semibold text-rose-400" : "text-muted-foreground"}`}>
            Próximo cobro: {formatDate(s.nextDue)}
            {late ? " (vencido)" : ""}
          </p>
        </div>
        <Pill tone={STATUS[s.status][0]}>{STATUS[s.status][1]}</Pill>
      </div>
      {s.status === "active" && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="whatsapp" onClick={remind}>
            <MessageCircle className="h-4 w-4" /> Cobrar
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPaying(true)}>
            <Wallet className="h-4 w-4" /> Registrar pago
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" /> Editar
          </Button>
        </div>
      )}
      {s.status !== "active" && (
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          <Pencil className="h-4 w-4" /> Editar
        </Button>
      )}
      {editing && <SubscriptionDialog open={editing} onOpenChange={setEditing} subscription={s} />}
      <Dialog open={paying} onOpenChange={setPaying}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pago de {s.name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {formatMoney(s.amount, s.currency)} del periodo que vence el {formatDate(s.nextDue)}. Al guardar, el próximo cobro pasa al siguiente {s.cycle === "mensual" ? "mes" : "año"}.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Medio</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(METHODS) as PaymentMethod[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {METHODS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`pd-${s.id}`}>Fecha</Label>
              <Input id={`pd-${s.id}`} type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
            </div>
          </div>
          <Button onClick={() => pay.mutate()} disabled={pay.isPending}>
            Registrar pago
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function SubscriptionsCard({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({ queryKey: ["subscriptions", clientId], queryFn: () => apiGet<{ subscriptions: Subscription[] }>(`/api/admin/subscriptions?clientId=${clientId}&status=all`) });
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Repeat className="h-4 w-4" /> Suscripciones
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Nueva
        </Button>
      </CardHeader>
      <CardContent className="divide-y">
        {data?.subscriptions.length ? data.subscriptions.map((s) => <SubscriptionRow key={s.id} s={s} />) : <p className="py-2 text-sm text-muted-foreground">Sin hosting, dominio ni mantenimiento registrados.</p>}
      </CardContent>
      {open && <SubscriptionDialog open={open} onOpenChange={setOpen} clientId={clientId} />}
    </Card>
  );
}
