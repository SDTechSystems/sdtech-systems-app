import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import { toast } from "sonner";
import type { PaymentMethodOption, Settings } from "../../shared/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiSend } from "@/lib/api";
import { errorMessage } from "@/lib/labels";
import { newMethodId } from "@/lib/payment-methods";
import { useSettingsQuery } from "@/lib/useSettings";

export function PaymentMethodsCard() {
  const qc = useQueryClient();
  const { data } = useSettingsQuery();
  const [methods, setMethods] = useState<PaymentMethodOption[] | null>(null);
  useEffect(() => {
    if (data && !methods) setMethods(data.settings.payment.methods);
  }, [data, methods]);
  const save = useMutation({
    mutationFn: (list: PaymentMethodOption[]) => apiSend<{ settings: Settings }>("PATCH", "/api/admin/settings", { payment: { methods: list } }),
    onSuccess: (r) => {
      qc.setQueryData(["settings"], r);
      toast.success("Medios de pago guardados");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!methods) return null;

  const patch = (i: number, p: Partial<PaymentMethodOption>) => setMethods(methods.map((m, j) => (j === i ? { ...m, ...p } : m)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...methods];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setMethods(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Medios de pago</CardTitle>
        <CardDescription>Alimentan el selector al registrar pagos y los medios que salen en las cuentas de cobro. Un medio desactivado no aparece para pagos nuevos, pero sí en los viejos.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {methods.map((m, i) => (
          <div key={m.id} className="space-y-3 rounded-lg border border-border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`pm-name-${m.id}`}>Nombre</Label>
                <Input id={`pm-name-${m.id}`} value={m.name} onChange={(e) => patch(i, { name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`pm-detail-${m.id}`}>Detalle</Label>
                <Input id={`pm-detail-${m.id}`} value={m.detail} onChange={(e) => patch(i, { detail: e.target.value })} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <div className="flex items-center gap-2">
                <Switch id={`pm-docs-${m.id}`} checked={m.showOnDocs} onCheckedChange={(v) => patch(i, { showOnDocs: v })} />
                <Label htmlFor={`pm-docs-${m.id}`}>Mostrar en cuentas de cobro</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id={`pm-active-${m.id}`} checked={m.active} onCheckedChange={(v) => patch(i, { active: v })} />
                <Label htmlFor={`pm-active-${m.id}`}>Activo</Label>
              </div>
              <div className="ml-auto flex gap-1">
                <Button size="icon" variant="ghost" aria-label={`Subir ${m.name}`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" aria-label={`Bajar ${m.name}`} disabled={i === methods.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={methods.length >= 12}
            onClick={() => setMethods([...methods, { id: newMethodId("Nuevo medio", methods), name: "Nuevo medio", detail: "", showOnDocs: true, active: true }])}
          >
            <Plus className="mr-1 h-4 w-4" /> Agregar medio
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate(methods)}>
            Guardar medios de pago
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
