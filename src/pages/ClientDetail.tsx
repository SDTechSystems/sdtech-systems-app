import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Archive, ArchiveRestore, ArrowLeft, FilePlus, MessageCircle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { waLink } from "../../shared/phone";
import type { ActivityEntry, Client } from "../../shared/types";
import { ClientForm } from "@/components/ClientForm";
import { PortalLinkCard } from "@/components/PortalLinkCard";
import { MeetingsCard } from "@/components/MeetingsCard";
import { SubscriptionsCard } from "@/components/SubscriptionsCard";
import { QuoteBadge } from "@/components/StatusBadge";
import { ProjectCard } from "@/pages/Projects";
import { formatMoney } from "../../shared/money";
import type { Project, Quote } from "../../shared/types";
import { useMe } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiSend } from "@/lib/api";
import { errorMessage, formatDateTime } from "@/lib/labels";

const ACTION_LABEL: Record<string, string> = {
  create: "Creó el cliente",
  update: "Actualizó los datos",
  portal_link_created: "Creó el link de seguimiento",
  portal_link_regenerated: "Cambió el link de seguimiento",
};

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium break-all">{value}</span>
    </div>
  );
}

export default function ClientDetail() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const { data: me } = useMe();
  const owner = me?.role === "owner";
  const quotes = useQuery({
    queryKey: ["quotes", "client", id],
    queryFn: () => apiGet<{ quotes: Quote[] }>(`/api/admin/quotes?clientId=${id}`),
    enabled: owner,
  });
  const projects = useQuery({ queryKey: ["projects", "client", id], queryFn: () => apiGet<{ projects: Project[] }>(`/api/admin/projects?clientId=${id}&status=all`) });
  const { data, isLoading, error } = useQuery({
    queryKey: ["client", id],
    queryFn: () => apiGet<{ client: Client; activity: ActivityEntry[] }>(`/api/admin/clients/${id}`),
  });

  const archive = useMutation({
    mutationFn: (archived: boolean) => apiSend<{ client: Client }>("PATCH", `/api/admin/clients/${id}`, { archived }),
    onSuccess: ({ client }) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["client", id] });
      toast.success(client.archived ? "Cliente archivado" : "Cliente restaurado");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error || !data) return <p className="py-10 text-center text-muted-foreground">No encontramos este cliente.</p>;
  const { client, activity } = data;
  const firstName = client.name.split(" ")[0];

  return (
    <div className="space-y-5">
      <Link to="/clientes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Clientes
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="sd-eyebrow mb-3">Cliente</p>
          <h1 className="sd-title sd-caret text-[2rem] sm:text-5xl">{client.name}</h1>
          {client.company && <p className="text-muted-foreground">{client.company}</p>}
          {client.archived && <Badge variant="secondary" className="mt-2">Archivado</Badge>}
        </div>
        <div className="flex flex-wrap gap-2">
          {client.phone && (
            <Button asChild variant="whatsapp">
              <a href={waLink(client.phone, `Hola ${firstName}, `)} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
            </Button>
          )}
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" /> Editar
          </Button>
          <Button variant="outline" onClick={() => archive.mutate(!client.archived)} disabled={archive.isPending}>
            {client.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            {client.archived ? "Restaurar" : "Archivar"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          <Row label="WhatsApp" value={client.phone ? `+${client.phone}` : null} />
          <Row label="Correo" value={client.email} />
          <Row label="Cédula o NIT" value={client.document} />
          <Row label="Ciudad" value={client.city} />
          {client.notes && <p className="whitespace-pre-wrap py-3 text-sm">{client.notes}</p>}
          {!client.phone && !client.email && !client.document && !client.city && !client.notes && (
            <p className="py-2 text-sm text-muted-foreground">Sin datos adicionales.</p>
          )}
        </CardContent>
      </Card>

      <MeetingsCard client={client} />

      {owner && <SubscriptionsCard clientId={client.id} />}

      {owner && <PortalLinkCard clientId={client.id} />}

      {!!projects.data?.projects.length && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Proyectos</CardTitle>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {projects.data.projects.map((p) => (
              <ProjectCard key={p.id} p={p} />
            ))}
          </CardContent>
        </Card>
      )}

      {owner && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">Cotizaciones</CardTitle>
            <Button size="sm" variant="outline" asChild>
              <Link to={`/cotizaciones/nueva?cliente=${client.id}`}>
                <FilePlus className="h-4 w-4" /> Nueva
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="divide-y">
            {quotes.data?.quotes.length ? (
              quotes.data.quotes.map((q) => (
                <Link key={q.id} to={`/cotizaciones/${q.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:underline">
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{q.number}</span>
                    <QuoteBadge status={q.status} />
                  </span>
                  <span className="font-semibold">{formatMoney(q.total, q.currency)}</span>
                </Link>
              ))
            ) : (
              <p className="py-2 text-sm text-muted-foreground">Sin cotizaciones todavía.</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {activity.map((a, i) => (
              <li key={i} className="text-sm">
                <p className="font-medium">{ACTION_LABEL[a.action] ?? a.action}</p>
                <p className="text-muted-foreground">
                  {formatDateTime(a.at)} · {a.actor}
                </p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Sheet open={editing} onOpenChange={setEditing}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Editar cliente</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <ClientForm client={client} onDone={() => setEditing(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
