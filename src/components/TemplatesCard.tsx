import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TEMPLATE_VARS, type TemplateKey } from "../../shared/templates";
import type { Settings } from "../../shared/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiSend } from "@/lib/api";
import { errorMessage } from "@/lib/labels";
import { useSettingsQuery } from "@/lib/useSettings";

const NAMES: Record<TemplateKey, string> = {
  quote: "Enviar cotización",
  payment: "Cobro",
  progress: "Avance del proyecto",
  delivery: "Entrega lista",
  meeting: "Recordatorio de reunión",
  subscription: "Cobro de suscripción",
};

export function TemplatesCard() {
  const qc = useQueryClient();
  const { data } = useSettingsQuery();
  const [templates, setTemplates] = useState<Settings["templates"] | null>(null);
  const [alerts, setAlerts] = useState<Settings["alerts"] | null>(null);
  useEffect(() => {
    if (data && !templates) {
      setTemplates(data.settings.templates);
      setAlerts(data.settings.alerts);
    }
  }, [data, templates]);
  const save = useMutation({
    mutationFn: (patch: Partial<Settings>) => apiSend<{ settings: Settings }>("PATCH", "/api/admin/settings", patch),
    onSuccess: (r) => {
      qc.setQueryData(["settings"], r);
      toast.success("Guardado");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!templates || !alerts) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mensajes de WhatsApp</CardTitle>
          <CardDescription>Las palabras entre llaves se reemplazan solas. Por ejemplo, {"{nombre}"} pone el primer nombre del cliente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(Object.keys(NAMES) as TemplateKey[]).map((k) => (
            <div key={k} className="space-y-1.5">
              <Label htmlFor={`tpl-${k}`}>{NAMES[k]}</Label>
              <Textarea id={`tpl-${k}`} rows={3} value={templates[k]} onChange={(e) => setTemplates({ ...templates, [k]: e.target.value })} />
              <p className="text-xs text-muted-foreground">Puedes usar: {TEMPLATE_VARS[k].map((v) => `{${v}}`).join(" ")}</p>
            </div>
          ))}
          <Button disabled={save.isPending} onClick={() => save.mutate({ templates })}>
            Guardar mensajes
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Avisos en Pendientes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ["staleDays", "Proyecto quieto después de (días)"],
                ["dueSoonDays", "Mostrar fechas próximas (días)"],
                ["quoteExpiringDays", "Avisar cotizaciones que vencen en (días)"],
              ] as const
            ).map(([k, l]) => (
              <div key={k} className="space-y-1.5">
                <Label htmlFor={`al-${k}`}>{l}</Label>
                <Input id={`al-${k}`} inputMode="numeric" value={String(alerts[k])} onChange={(e) => setAlerts({ ...alerts, [k]: Number.parseInt(e.target.value, 10) || 0 })} />
              </div>
            ))}
          </div>
          <Button disabled={save.isPending} onClick={() => save.mutate({ alerts })}>
            Guardar avisos
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
