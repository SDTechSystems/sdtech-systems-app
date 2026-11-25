import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Service, Settings } from "../../shared/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiSend } from "@/lib/api";
import { SERVICE_LABEL, errorMessage } from "@/lib/labels";

function useSettings() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<{ settings: Settings }>("/api/admin/settings") });
  const save = useMutation({
    mutationFn: (patch: Partial<Settings>) => apiSend<{ settings: Settings }>("PATCH", "/api/admin/settings", patch),
    onSuccess: (r) => {
      qc.setQueryData(["settings"], r);
      toast.success("Ajustes guardados");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return { settings: query.data?.settings, save };
}

function Field({ id, label, value, onChange, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SettingsBusiness() {
  const { settings, save } = useSettings();
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => {
    if (settings && !s) setS(settings);
  }, [settings, s]);
  if (!s) return null;
  const set = <K extends keyof Settings>(section: K, patch: Partial<Settings[K]>) => setS({ ...s, [section]: { ...s[section], ...patch } });

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Empresa y pagos</CardTitle>
          <CardDescription>Aparecen en las cotizaciones y en la página del cliente.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="cname" label="Nombre" value={s.company.name} onChange={(v) => set("company", { name: v })} />
          <Field id="cphone" label="Teléfono / WhatsApp" value={s.company.phone} onChange={(v) => set("company", { phone: v })} />
          <Field id="cemail" label="Correo" value={s.company.email} onChange={(v) => set("company", { email: v })} />
          <Field id="cweb" label="Web" value={s.company.website} onChange={(v) => set("company", { website: v })} />
          <Field id="breb" label="Llave Bre-B" value={s.payment.brebKey} onChange={(v) => set("payment", { brebKey: v })} />
          <Field id="bank" label="Banco de la llave" value={s.payment.bank} onChange={(v) => set("payment", { bank: v })} />
          <div className="sm:col-span-2">
            <Field id="usd" label="Datos de pago para cotizaciones en dólares" value={s.payment.usdText} onChange={(v) => set("payment", { usdText: v })} hint="Si lo dejas vacío, la cotización dice que los datos se envían por chat." />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cotizaciones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
            <div className="space-y-1.5">
              <Label htmlFor="valid">Vigencia (días)</Label>
              <Input id="valid" inputMode="numeric" value={String(s.quotes.validityDays)} onChange={(e) => set("quotes", { validityDays: Number.parseInt(e.target.value, 10) || 0 })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="advd">Anticipo (%)</Label>
              <Input id="advd" inputMode="numeric" value={String(s.quotes.advancePercent)} onChange={(e) => set("quotes", { advancePercent: Number.parseInt(e.target.value, 10) || 0 })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="conds">Condiciones por defecto (una por línea)</Label>
            <Textarea id="conds" rows={8} value={s.quotes.conditions} onChange={(e) => set("quotes", { conditions: e.target.value })} />
          </div>
          <Button disabled={save.isPending} onClick={() => save.mutate({ company: s.company, payment: s.payment, quotes: s.quotes })}>
            Guardar empresa, pagos y cotizaciones
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

export function PhaseTemplatesCard() {
  const { settings, save } = useSettings();
  const [text, setText] = useState<Record<Service, string> | null>(null);
  useEffect(() => {
    if (settings && !text) {
      const t = settings.phaseTemplates;
      setText({ web: t.web.join("\n"), marca: t.marca.join("\n"), software: t.software.join("\n"), general: t.general.join("\n") });
    }
  }, [settings, text]);
  if (!text) return null;
  const toList = (v: string) => v.split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Plantillas de fases</CardTitle>
        <CardDescription>Una fase por línea. Se usan al crear proyectos nuevos; los proyectos existentes no cambian.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {(Object.keys(text) as Service[]).map((svc) => (
            <div key={svc} className="space-y-1.5">
              <Label htmlFor={`t-${svc}`}>{SERVICE_LABEL[svc]}</Label>
              <Textarea id={`t-${svc}`} rows={8} value={text[svc]} onChange={(e) => setText({ ...text, [svc]: e.target.value })} />
            </div>
          ))}
        </div>
        <Button
          disabled={save.isPending}
          onClick={() => save.mutate({ phaseTemplates: { web: toList(text.web), marca: toList(text.marca), software: toList(text.software), general: toList(text.general) } })}
        >
          Guardar plantillas
        </Button>
      </CardContent>
    </Card>
  );
}
