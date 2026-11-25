import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { addDays, todayBogota } from "../../shared/dates";
import { formatMoney, parseMoneyInput } from "../../shared/money";
import type { CatalogItem, Client, Currency, Subscription, SubscriptionKind } from "../../shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiSend } from "@/lib/api";
import { SUBSCRIPTION_KIND_LABEL, errorMessage, priceLabel } from "@/lib/labels";

const priceText = (n: number, c: Currency) => formatMoney(n, c).replace(/^US\$ |^\$ /, "");

export function SubscriptionDialog({ open, onOpenChange, clientId, subscription }: { open: boolean; onOpenChange: (o: boolean) => void; clientId?: string; subscription?: Subscription }) {
  const qc = useQueryClient();
  const s = subscription;
  const [pickedId, setPickedId] = useState(s?.clientId ?? clientId ?? "");
  const [kind, setKind] = useState<SubscriptionKind>(s?.kind ?? "hosting");
  const [name, setName] = useState(s?.name ?? "Hosting");
  const [currency, setCurrency] = useState<Currency>(s?.currency ?? "COP");
  const [amount, setAmount] = useState(s ? priceText(s.amount, s.currency) : "");
  const [cycle, setCycle] = useState<"mensual" | "anual">(s?.cycle ?? "mensual");
  const [nextDue, setNextDue] = useState(s?.nextDue ?? addDays(todayBogota(), 30));
  const [provider, setProvider] = useState(s?.provider ?? "");
  const [notes, setNotes] = useState(s?.notes ?? "");
  const clients = useQuery({ queryKey: ["clients", "", false], queryFn: () => apiGet<{ clients: Client[] }>("/api/admin/clients?q=&archived=0"), enabled: open && !clientId && !s });
  const catalog = useQuery({ queryKey: ["catalog", "active"], queryFn: () => apiGet<{ items: CatalogItem[] }>("/api/admin/catalog"), enabled: open && !s });
  const recurring = (catalog.data?.items ?? []).filter((i) => i.billing !== "unico");

  const save = useMutation({
    mutationFn: () => {
      const body = { clientId: pickedId, kind, name, currency, amount: parseMoneyInput(amount, currency) ?? 0, cycle, nextDue, provider, notes };
      return s ? apiSend("PATCH", `/api/admin/subscriptions/${s.id}`, body) : apiSend("POST", "/api/admin/subscriptions", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["pending"] });
      toast.success("Suscripción guardada");
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{s ? "Editar suscripción" : "Nueva suscripción"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {!clientId && !s && (
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <Select value={pickedId} onValueChange={setPickedId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escoge un cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients.data?.clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {!s && recurring.length > 0 && (
            <div className="space-y-1.5">
              <Label>Desde el catálogo (opcional)</Label>
              <Select
                onValueChange={(id) => {
                  const it = recurring.find((i) => i.id === id);
                  if (!it) return;
                  setName(it.name);
                  setCurrency(it.currency);
                  setAmount(priceText(it.price, it.currency));
                  setCycle(it.billing === "anual" ? "anual" : "mensual");
                  setKind(/hosting|dominio/i.test(it.name) ? "hosting" : /soporte/i.test(it.name) ? "soporte" : "mantenimiento");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escoge un servicio recurrente" />
                </SelectTrigger>
                <SelectContent>
                  {recurring.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name} · {priceLabel(i)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as SubscriptionKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SUBSCRIPTION_KIND_LABEL) as SubscriptionKind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {SUBSCRIPTION_KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ciclo</Label>
              <Select value={cycle} onValueChange={(v) => setCycle(v as "mensual" | "anual")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensual">Mensual</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sname">Nombre del servicio</Label>
            <Input id="sname" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-[1fr_6.5rem] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="samount">Monto</Label>
              <Input id="samount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Moneda</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="COP">COP</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sdue">Próximo cobro</Label>
            <Input id="sdue" type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sprov">Proveedor (opcional)</Label>
            <Input id="sprov" value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Hostinger, Cloudflare…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="snotes">Notas</Label>
            <Textarea id="snotes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            <p className="text-xs text-amber-300">No guardes contraseñas aquí. Anota solo dónde están guardadas.</p>
          </div>
          <Button type="submit" className="w-full" disabled={save.isPending || !pickedId}>
            Guardar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
