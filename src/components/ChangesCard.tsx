import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ClipboardList, MessageCircle, Plus, Receipt, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { parseMoneyInput, signedMoney } from "../../shared/money";
import type { ChangeRequest, Client, Currency } from "../../shared/types";
import { Pill } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiSend } from "@/lib/api";
import { errorMessage, firstName, formatDateTime } from "@/lib/labels";
import { getPortalUrl } from "@/lib/quote-actions";
import { openWhatsApp } from "@/lib/whatsapp";

type Form = { mode: "new" } | { mode: "convert"; adjustment: ChangeRequest } | null;

const COST_STATUS = { pending: ["amber", "Por aprobar"], approved: ["green", "Aprobado"], rejected: ["red", "Rechazado"] } as const;
const ADJ_STATUS = { pending: ["amber", "Pendiente"], resolved: ["green", "Hecho"], converted: ["cyan", "Cotizado"] } as const;

export function ChangesCard({ projectId, projectTitle, client, currency, owner }: { projectId: string; projectTitle: string; client: Pick<Client, "id" | "name" | "phone">; currency: Currency; owner: boolean }) {
  const qc = useQueryClient();
  const key = ["changes", projectId];
  const { data } = useQuery({ queryKey: key, queryFn: () => apiGet<{ changes: ChangeRequest[] }>(`/api/admin/projects/${projectId}/changes`) });
  const [form, setForm] = useState<Form>(null);
  const [description, setDescription] = useState("");
  const [direction, setDirection] = useState<1 | -1>(1);
  const [amount, setAmount] = useState("");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["payments", projectId] });
    qc.invalidateQueries({ queryKey: ["pending"] });
  };
  const call = useMutation({
    mutationFn: ({ method, path, body }: { method: "POST" | "DELETE"; path: string; body?: unknown }) => apiSend(method, path, body),
    onSuccess: () => {
      refresh();
      setForm(null);
      toast.success("Guardado");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const sendChange = async (c: ChangeRequest) => {
    const tab = client.phone ? window.open("about:blank", "_blank") : null;
    const url = await getPortalUrl(client.id);
    const text = `Hola ${firstName(client.name)}, agregué un cambio a ${projectTitle}: ${c.description} (${signedMoney(c.amount ?? 0, currency)}). Puedes aprobarlo aquí: ${url}`;
    if (!openWhatsApp(client.phone, text, tab)) toast.success("El cliente no tiene WhatsApp: copiamos el mensaje.");
  };

  const openNew = () => {
    setDescription("");
    setDirection(1);
    setAmount("");
    setForm({ mode: "new" });
  };
  const openConvert = (adjustment: ChangeRequest) => {
    setDescription(adjustment.description);
    setDirection(1);
    setAmount("");
    setForm({ mode: "convert", adjustment });
  };

  const changes = data?.changes ?? [];
  const adjustments = changes.filter((c) => c.kind === "adjustment");
  const costs = changes.filter((c) => c.kind === "cost");
  if (!owner && !adjustments.length) return null;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-4 w-4" /> Cambios y ajustes
        </CardTitle>
        {owner && (
          <Button size="sm" variant="outline" onClick={openNew}>
            <Plus className="h-4 w-4" /> Cambio de costo
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {adjustments.length > 0 && (
          <div>
            <p className="sd-eyebrow mb-2">Pedidos del cliente</p>
            <div className="divide-y rounded-xl border">
              {adjustments.map((a) => (
                <div key={a.id} className="space-y-2 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="whitespace-pre-wrap text-sm">{a.description}</p>
                    <Pill tone={ADJ_STATUS[a.status as keyof typeof ADJ_STATUS]?.[0] ?? "slate"}>{ADJ_STATUS[a.status as keyof typeof ADJ_STATUS]?.[1] ?? a.status}</Pill>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDateTime(a.createdAt)}</p>
                  {a.status === "pending" && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => call.mutate({ method: "POST", path: `/api/admin/changes/${a.id}/resolve`, body: {} })}>
                        <Check className="h-4 w-4" /> Marcar hecho
                      </Button>
                      {owner && (
                        <Button size="sm" variant="ghost" onClick={() => openConvert(a)}>
                          <Receipt className="h-4 w-4" /> Cotizar
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {owner && (
          <div>
            <p className="sd-eyebrow mb-2">Cambios de costo</p>
            {costs.length ? (
              <div className="divide-y rounded-xl border">
                {costs.map((c) => (
                  <div key={c.id} className="space-y-2 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{c.description}</p>
                        <p className="font-bold text-[var(--sd-cyan)]">{signedMoney(c.amount ?? 0, currency)}</p>
                      </div>
                      <Pill tone={COST_STATUS[c.status as keyof typeof COST_STATUS]?.[0] ?? "slate"}>{COST_STATUS[c.status as keyof typeof COST_STATUS]?.[1] ?? c.status}</Pill>
                    </div>
                    {c.status === "approved" && (
                      <p className="text-xs text-muted-foreground">
                        {c.decidedBy === "client" ? `Aprobado por ${c.approvedName} desde su página` : "Aprobado por WhatsApp"}
                        {c.decidedAt ? ` · ${formatDateTime(c.decidedAt)}` : ""}
                        {c.clientComment ? ` · «${c.clientComment}»` : ""}
                      </p>
                    )}
                    {c.status === "pending" && (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="whatsapp" onClick={() => sendChange(c)}>
                          <MessageCircle className="h-4 w-4" /> Enviar para aprobar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => confirm("¿El cliente lo aprobó por WhatsApp?") && call.mutate({ method: "POST", path: `/api/admin/changes/${c.id}/approve`, body: { note: "Aprobado por WhatsApp" } })}>
                          <Check className="h-4 w-4" /> Aprobado por WhatsApp
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => call.mutate({ method: "POST", path: `/api/admin/changes/${c.id}/reject`, body: {} })}>
                          <X className="h-4 w-4" /> Rechazado
                        </Button>
                        <Button size="icon" variant="ghost" aria-label="Borrar cambio" onClick={() => confirm("¿Borrar este cambio?") && call.mutate({ method: "DELETE", path: `/api/admin/changes/${c.id}` })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sin cambios de costo. Si el cliente pide algo extra, créalo aquí para que lo apruebe en su página.</p>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={form !== null} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form?.mode === "convert" ? "Cotizar el ajuste" : "Nuevo cambio de costo"}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const value = (parseMoneyInput(amount, currency) ?? 0) * direction;
              if (form?.mode === "convert") call.mutate({ method: "POST", path: `/api/admin/changes/${form.adjustment.id}/convert`, body: { amount: value, description } });
              else call.mutate({ method: "POST", path: `/api/admin/projects/${projectId}/changes`, body: { amount: value, description } });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="cdesc">Qué cambia</Label>
              <Textarea id="cdesc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} required />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant={direction === 1 ? "default" : "outline"} onClick={() => setDirection(1)}>
                Aumenta
              </Button>
              <Button type="button" variant={direction === -1 ? "default" : "outline"} onClick={() => setDirection(-1)}>
                Reduce
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="camount">Monto</Label>
              <Input id="camount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="150.000" required />
            </div>
            <p className="text-xs text-muted-foreground">El cliente lo verá en su página para aprobarlo. Solo cuando lo apruebe se suma al total.</p>
            <Button type="submit" className="w-full" disabled={call.isPending}>
              Guardar cambio
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
