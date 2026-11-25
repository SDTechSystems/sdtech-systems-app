import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, MessageCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BRAND_ROUNDS_PHASE } from "../../shared/phases";
import { formatMoney } from "../../shared/money";
import { fillTemplate } from "../../shared/templates";
import type { ActivityEntry, Client, Phase, PhaseStatus, Project, ProjectStatus } from "../../shared/types";
import { PaymentsCard } from "@/components/PaymentsCard";
import { MeetingsCard } from "@/components/MeetingsCard";
import { useSettingsQuery } from "@/lib/useSettings";
import { logReminder, openWhatsApp, progressVars } from "@/lib/whatsapp";
import { PhaseIcon, ProgressBar, ProjectBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiSend } from "@/lib/api";
import { SERVICE_LABEL, errorMessage, formatDate, phaseStatusLabel, projectStatusLabel } from "@/lib/labels";
import { getPortalUrl } from "@/lib/quote-actions";
import { useMe } from "@/lib/session";

const NEXT: Record<PhaseStatus, PhaseStatus> = { pending: "in_progress", in_progress: "done", done: "pending" };

function PhaseRow({ phase, onPatch, onDelete, child }: { phase: Phase; onPatch: (b: object) => void; onDelete?: () => void; child?: boolean }) {
  const [open, setOpen] = useState(false);
  const [due, setDue] = useState(phase.dueDate ?? "");
  const [note, setNote] = useState(phase.clientNote ?? "");
  return (
    <div className={child ? "ml-9" : ""}>
      <div className="flex items-center gap-3 py-2">
        <button aria-label={`Cambiar estado de ${phase.name}: ${phaseStatusLabel[phase.status]}`} onClick={() => onPatch({ status: NEXT[phase.status] })}>
          <PhaseIcon status={phase.status} />
        </button>
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(!open)}>
          <span className={phase.status === "done" ? "text-muted-foreground line-through" : phase.status === "in_progress" ? "font-semibold" : ""}>{phase.name}</span>
          {phase.dueDate && phase.status !== "done" && <span className="ml-2 text-xs text-muted-foreground">· {formatDate(phase.dueDate)}</span>}
          {phase.clientNote && <span className="block text-xs text-muted-foreground">{phase.clientNote}</span>}
        </button>
        {onDelete && (
          <Button variant="ghost" size="icon" aria-label="Quitar ronda" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      {open && (
        <form
          className="mb-3 ml-9 grid gap-2 rounded-lg bg-muted/60 p-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            onPatch({ dueDate: due || null, clientNote: note });
            setOpen(false);
          }}
        >
          <div className="space-y-1">
            <Label className="text-xs">Fecha objetivo</Label>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nota que ve el cliente</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: Esperando tus fotos" />
          </div>
          <Button type="submit" size="sm">
            Guardar
          </Button>
        </form>
      )}
    </div>
  );
}

export default function ProjectDetail() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const owner = me?.role === "owner";
  const { data, isLoading } = useQuery({ queryKey: ["project", id], queryFn: () => apiGet<{ project: Project; activity: ActivityEntry[] }>(`/api/admin/projects/${id}`) });
  const p = data?.project;
  const client = useQuery({ queryKey: ["client", p?.clientId], queryFn: () => apiGet<{ client: Client }>(`/api/admin/clients/${p!.clientId}`), enabled: !!p });
  const settings = useSettingsQuery(owner);
  const lastReminders: Record<string, string> = {};
  for (const a of data?.activity ?? []) {
    const planId = (a.detail as { planId?: string } | null)?.planId;
    if (a.action === "reminder" && planId && !lastReminders[planId]) lastReminders[planId] = a.at;
  }
  const sendProgress = async () => {
    const c = client.data?.client;
    if (!c || !p || !settings.data) return;
    const tab = c.phone ? window.open("about:blank", "_blank") : null;
    const url = await getPortalUrl(c.id);
    const sent = openWhatsApp(c.phone, fillTemplate(settings.data.settings.templates.progress, progressVars(p, c.name, url)), tab);
    await logReminder("project", p.id, "progress");
    qc.invalidateQueries({ queryKey: ["project", id] });
    if (!sent) toast.success("El cliente no tiene WhatsApp: copiamos el mensaje.");
  };

  const setProject = (r: { project: Project }) => {
    qc.setQueryData(["project", id], (old: object | undefined) => ({ ...(old ?? {}), project: r.project }));
    qc.invalidateQueries({ queryKey: ["projects"] });
  };
  const patchPhase = useMutation({
    mutationFn: ({ phaseId, body }: { phaseId: string; body: object }) => apiSend<{ project: Project }>("PATCH", `/api/admin/phases/${phaseId}`, body),
    onSuccess: setProject,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const deletePhase = useMutation({
    mutationFn: (phaseId: string) => apiSend<{ project: Project }>("DELETE", `/api/admin/phases/${phaseId}`),
    onSuccess: setProject,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const addRound = useMutation({
    mutationFn: (parentId: string) => apiSend<{ project: Project }>("POST", `/api/admin/projects/${id}/phases`, { parentId }),
    onSuccess: setProject,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const patchProject = useMutation({
    mutationFn: (body: object) => apiSend<{ project: Project }>("PATCH", `/api/admin/projects/${id}`, body),
    onSuccess: (r) => {
      setProject(r);
      toast.success("Guardado");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading) return <Skeleton className="h-72 w-full" />;
  if (!p) return <p className="py-10 text-center text-muted-foreground">No encontramos este proyecto.</p>;
  const top = p.phases.filter((f) => !f.parentId);

  return (
    <div className="space-y-5">
      <Link to="/proyectos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Proyectos
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="sd-eyebrow mb-3 w-full">Proyecto</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="sd-title sd-caret text-[2rem] sm:text-5xl">{p.title}</h1>
            <ProjectBadge status={p.status} />
          </div>
          <p className="text-muted-foreground">
            <Link to={`/clientes/${p.clientId}`} className="hover:underline">
              {p.clientName}
            </Link>{" "}
            · {SERVICE_LABEL[p.service]}
          </p>
        </div>
        {owner && (
          <div className="flex flex-wrap gap-2">
            <Button variant="whatsapp" onClick={sendProgress} disabled={!client.data || !settings.data}>
              <MessageCircle className="h-4 w-4" /> Enviar avance
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                const tab = window.open("about:blank", "_blank");
                const url = await getPortalUrl(p.clientId);
                if (tab) tab.location.href = url;
              }}
            >
              <ExternalLink className="h-4 w-4" /> Ver como cliente
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="space-y-2 pt-6">
          <ProgressBar value={p.progress} />
          <p className="text-sm text-muted-foreground">{p.progress}% completado</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Fases</CardTitle>
          <p className="text-xs text-muted-foreground">Toca el círculo para avanzar: pendiente → en curso → hecha. Toca el nombre para poner fecha o nota.</p>
        </CardHeader>
        <CardContent className="divide-y">
          {top.map((f) => {
            const rounds = p.phases.filter((r) => r.parentId === f.id);
            return (
              <div key={f.id}>
                <PhaseRow phase={f} onPatch={(body) => patchPhase.mutate({ phaseId: f.id, body })} />
                {rounds.map((r) => (
                  <PhaseRow
                    key={r.id}
                    child
                    phase={r}
                    onPatch={(body) => patchPhase.mutate({ phaseId: r.id, body })}
                    onDelete={owner ? () => deletePhase.mutate(r.id) : undefined}
                  />
                ))}
                {f.name === BRAND_ROUNDS_PHASE && (
                  <Button variant="ghost" size="sm" className="mb-2 ml-9" onClick={() => addRound.mutate(f.id)}>
                    <Plus className="h-4 w-4" /> Ronda {rounds.length + 1}
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {client.data && <MeetingsCard client={client.data.client} projectId={p.id} defaultTitle={`Reunión: ${p.title}`} />}

      {owner && client.data && <PaymentsCard projectId={p.id} client={client.data.client} lastReminders={lastReminders} />}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Datos del proyecto</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <Select value={p.status} onValueChange={(v) => patchProject.mutate({ status: v as ProjectStatus })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(projectStatusLabel) as ProjectStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {projectStatusLabel[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="due">Fecha de entrega</Label>
            <Input id="due" type="date" defaultValue={p.dueDate ?? ""} onBlur={(e) => e.target.value !== (p.dueDate ?? "") && patchProject.mutate({ dueDate: e.target.value || null })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="desc">Descripción (interna)</Label>
            <Textarea id="desc" rows={3} defaultValue={p.description} onBlur={(e) => e.target.value !== p.description && patchProject.mutate({ description: e.target.value })} />
          </div>
          {owner && p.total !== null && p.currency && (
            <p className="text-sm sm:col-span-2">
              Total acordado: <strong>{formatMoney(p.total, p.currency)}</strong>
              {p.advancePercent ? ` · anticipo ${p.advancePercent}%` : ""}
              {p.quoteId && (
                <>
                  {" · "}
                  <Link className="text-[var(--sd-blue)] hover:underline" to={`/cotizaciones/${p.quoteId}`}>
                    ver cotización
                  </Link>
                </>
              )}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
