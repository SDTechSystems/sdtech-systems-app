import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { todayBogota } from "../../shared/dates";
import type { Client, Project, Service } from "../../shared/types";
import { ProgressBar, ProjectBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { apiGet, apiSend } from "@/lib/api";
import { SERVICE_LABEL, errorMessage, formatDate } from "@/lib/labels";

export function ProjectCard({ p }: { p: Project }) {
  const current = p.phases.find((f) => !f.parentId && f.status === "in_progress");
  const late = p.dueDate && p.status === "active" && p.dueDate < todayBogota();
  return (
    <Link to={`/proyectos/${p.id}`} className="block space-y-2 px-4 py-3 transition-colors hover:bg-[#0f2542]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{p.title}</span>
        <ProjectBadge status={p.status} />
      </div>
      <p className="text-sm text-muted-foreground">
        {p.clientName}
        {current ? ` · ${current.name}` : ""}
      </p>
      <ProgressBar value={p.progress} />
      <p className={`text-xs ${late ? "font-semibold text-rose-400" : "text-muted-foreground"}`}>
        {p.progress}%{p.dueDate ? ` · entrega ${formatDate(p.dueDate)}${late ? " (vencida)" : ""}` : ""}
      </p>
    </Link>
  );
}

function NewProjectForm({ onDone }: { onDone: (p: Project) => void }) {
  const clients = useQuery({ queryKey: ["clients", "", false], queryFn: () => apiGet<{ clients: Client[] }>("/api/admin/clients?q=&archived=0") });
  const [clientId, setClientId] = useState("");
  const [service, setService] = useState<Service>("marca");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const save = useMutation({
    mutationFn: () => apiSend<{ project: Project }>("POST", "/api/admin/projects", { clientId, service, title, dueDate: dueDate || null }),
    onSuccess: ({ project }) => onDone(project),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="space-y-1.5">
        <Label>Cliente *</Label>
        <Select value={clientId} onValueChange={setClientId}>
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
      <div className="space-y-1.5">
        <Label>Servicio</Label>
        <Select value={service} onValueChange={(v) => setService(v as Service)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SERVICE_LABEL) as Service[]).map((s) => (
              <SelectItem key={s} value={s}>
                {SERVICE_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ptitle">Nombre del proyecto *</Label>
        <Input id="ptitle" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Logo Café Aroma" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pdue">Fecha de entrega</Label>
        <Input id="pdue" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={save.isPending || !clientId}>
        Crear proyecto
      </Button>
    </form>
  );
}

export default function Projects() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [all, setAll] = useState(false);
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["projects", all],
    queryFn: () => apiGet<{ projects: Project[] }>(`/api/admin/projects${all ? "?status=all" : ""}`),
  });
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div><p className="sd-eyebrow mb-3">03 / Proyectos</p><h1 className="sd-title sd-caret text-[2rem] sm:text-5xl">Proyectos</h1></div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Nuevo
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Switch id="all" checked={all} onCheckedChange={setAll} />
        <Label htmlFor="all">Ver también entregados y cancelados</Label>
      </div>
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : data?.projects.length ? (
        <Card className="sd-stagger divide-y overflow-hidden">
          {data.projects.map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </Card>
      ) : (
        <p className="py-10 text-center text-muted-foreground">No hay proyectos en curso. Se crean solos cuando un cliente aprueba una cotización.</p>
      )}
      <Sheet open={creating} onOpenChange={setCreating}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Nuevo proyecto</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <NewProjectForm
              onDone={(p) => {
                qc.invalidateQueries({ queryKey: ["projects"] });
                setCreating(false);
                navigate(`/proyectos/${p.id}`);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
