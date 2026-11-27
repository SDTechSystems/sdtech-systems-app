import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { todayBogota } from "../../shared/dates";
import { formatMoney, parseMoneyInput } from "../../shared/money";
import type { Collection, PaymentMethod, PaymentPlan, PaymentSummary } from "../../shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiSend } from "@/lib/api";
import { errorMessage } from "@/lib/labels";
import { priceText } from "@/lib/money-input";
import { defaultPlanChoice, firstActiveMethod, planIdToSend, SPLIT_CHOICE } from "@/lib/payment-methods";
import { useSettingsQuery } from "@/lib/useSettings";

/** Para qué es el pago: una promesa, una cuenta de cobro o un abono general (ninguno de los dos). */
export type PaymentTarget = { plan?: PaymentPlan; collection?: Collection };

/** Registrar pago. Se monta al abrirse, así cada apertura arranca con los valores propuestos. */
export function PaymentDialog({ projectId, summary, target, onClose }: { projectId: string; summary: PaymentSummary; target: PaymentTarget; onClose: () => void }) {
  const qc = useQueryClient();
  const settings = useSettingsQuery();
  const methods = (settings.data?.settings.payment.methods ?? []).filter((m) => m.active);
  const { plan, collection } = target;
  const unpaid = summary.plans.filter((p) => p.status !== "paid");
  // Desde una cuenta, solo sus promesas sin pagar; sin nada elegido, todas las pendientes.
  const choices = collection ? unpaid.filter((p) => collection.planIds.includes(p.id)) : unpaid;
  const proposed = plan ?? choices[0];
  const currency = summary.currency;

  const [amount, setAmount] = useState(() => {
    if (collection) return priceText(Math.max(collection.total - collection.paid, 0), currency);
    return proposed ? priceText(proposed.amount - proposed.paidAmount, currency) : "";
  });
  const [date, setDate] = useState(todayBogota());
  const [picked, setMethod] = useState<PaymentMethod>("");
  // Hasta que Juan elija otro, el primer medio activo de Ajustes (que puede llegar después de abrir).
  const method = picked || firstActiveMethod(methods);
  const [note, setNote] = useState("");
  // Desde una cuenta, por defecto el pago se reparte entre sus promesas por fecha (como lo hace el servidor).
  const [planChoice, setPlanChoice] = useState(() => defaultPlanChoice(target, choices));

  const save = useMutation({
    mutationFn: () =>
      apiSend<PaymentSummary>("POST", `/api/admin/projects/${projectId}/payments`, {
        amount: parseMoneyInput(amount, currency) ?? 0,
        paidOn: date,
        method,
        planId: planIdToSend(target, planChoice),
        collectionId: collection?.id ?? null,
        note,
      }),
    onSuccess: (r) => {
      qc.setQueryData(["payments", projectId], r);
      for (const key of [["pending"], ["project", projectId], ["collections", projectId]]) qc.invalidateQueries({ queryKey: key });
      toast.success("Pago registrado");
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const title = collection ? `Pago de ${collection.number}` : plan ? `Pago de «${plan.label}»` : "Registrar pago";
  const showChoice = !plan && (collection ? choices.length > 1 : choices.length > 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pamount">Monto</Label>
              <Input id="pamount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pdate">Fecha del pago</Label>
              <Input id="pdate" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
          </div>
          {showChoice && (
            <div className="space-y-1.5">
              <Label>¿A qué compromiso corresponde?</Label>
              <Select value={planChoice} onValueChange={setPlanChoice}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {collection && <SelectItem value={SPLIT_CHOICE}>Repartir entre sus promesas, por fecha</SelectItem>}
                  {choices.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label} · faltan {formatMoney(p.amount - p.paidAmount, currency)}
                    </SelectItem>
                  ))}
                  {!collection && <SelectItem value="none">Ninguno (abono general)</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Medio</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {methods.map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    {x.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pnote">Nota interna (opcional)</Label>
            <Input id="pnote" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={save.isPending}>
            Guardar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
