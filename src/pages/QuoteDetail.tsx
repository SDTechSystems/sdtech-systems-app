import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, ExternalLink, FolderKanban, MessageCircle, Pencil, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "../../shared/money";
import type { Client, Quote } from "../../shared/types";
import { QuoteBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiSend } from "@/lib/api";
import { errorMessage, formatDate, formatDateTime } from "@/lib/labels";
import { getPortalUrl, shareQuote } from "@/lib/quote-actions";

export default function QuoteDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["quote", id], queryFn: () => apiGet<{ quote: Quote }>(`/api/admin/quotes/${id}`) });
  const quote = data?.quote;
  const client = useQuery({
    queryKey: ["client", quote?.clientId],
    queryFn: () => apiGet<{ client: Client }>(`/api/admin/clients/${quote!.clientId}`),
    enabled: !!quote,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["quote", id] });
    qc.invalidateQueries({ queryKey: ["quotes"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
  };
  const act = useMutation({
    mutationFn: async (action: "send" | "approve" | "reject" | "renew" | "share") => {
      if (action === "share") return { shared: await shareQuote(quote!, client.data!.client) };
      if (action === "send") {
        const { quote: sent } = await apiSend<{ quote: Quote }>("POST", `/api/admin/quotes/${id}/send`, {});
        return { shared: await shareQuote(sent, client.data!.client) };
      }
      const note = action === "approve" ? prompt("Nota (opcional): por ejemplo «Aceptó por WhatsApp»") ?? undefined : action === "reject" ? prompt("¿Por qué? (opcional)") ?? undefined : undefined;
      return apiSend<{ quote: Quote; projectId?: string }>("POST", `/api/admin/quotes/${id}/${action}`, { note });
    },
    onSuccess: (r, action) => {
      refresh();
      if ("shared" in r) toast.success(r.shared ? "Abriendo WhatsApp…" : "El cliente no tiene WhatsApp: copiamos el mensaje.");
      else if (action === "renew" && "quote" in r) navigate(`/cotizaciones/${r.quote.id}/editar`);
      else if (action === "approve") toast.success("Aprobada. Se creó el proyecto.");
      else toast.success("Listo");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading) return <Skeleton className="h-72 w-full" />;
  if (!quote) return <p className="py-10 text-center text-muted-foreground">No encontramos esta cotización.</p>;
  const busy = act.isPending || client.isLoading;

  return (
    <div className="space-y-5">
      <Link to="/cotizaciones" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Cotizaciones
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{quote.number}</h1>
            <QuoteBadge status={quote.status} />
          </div>
          <Link to={`/clientes/${quote.clientId}`} className="text-muted-foreground hover:underline">
            {quote.clientName}
          </Link>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold">{formatMoney(quote.total, quote.currency)}</p>
          {quote.advancePercent > 0 && (
            <p className="text-sm text-muted-foreground">
              Anticipo {quote.advancePercent}%: {formatMoney(quote.advanceAmount, quote.currency)}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {quote.status === "draft" && (
          <>
            <Button disabled={busy} onClick={() => act.mutate("send")}>
              <MessageCircle className="h-4 w-4" /> Enviar por WhatsApp
            </Button>
            <Button variant="outline" asChild>
              <Link to={`/cotizaciones/${quote.id}/editar`}>
                <Pencil className="h-4 w-4" /> Editar
              </Link>
            </Button>
          </>
        )}
        {quote.status !== "draft" && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              const url = await getPortalUrl(quote.clientId);
              window.open(`${url}/cotizacion/${quote.number}`, "_blank");
            }}
          >
            <ExternalLink className="h-4 w-4" /> Ver documento
          </Button>
        )}
        {quote.status === "sent" && (
          <>
            <Button variant="outline" disabled={busy} onClick={() => act.mutate("share")}>
              <MessageCircle className="h-4 w-4" /> Reenviar
            </Button>
            <Button disabled={busy} onClick={() => act.mutate("approve")}>
              <Check className="h-4 w-4" /> Aprobada por WhatsApp
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => act.mutate("reject")}>
              <X className="h-4 w-4" /> Rechazada
            </Button>
          </>
        )}
        {(quote.status === "expired" || quote.status === "rejected") && (
          <Button disabled={busy} onClick={() => act.mutate("renew")}>
            <RotateCcw className="h-4 w-4" /> Renovar con precios actuales
          </Button>
        )}
        {quote.projectId && (
          <Button variant="outline" asChild>
            <Link to={`/proyectos/${quote.projectId}`}>
              <FolderKanban className="h-4 w-4" /> Ir al proyecto
            </Link>
          </Button>
        )}
      </div>

      {quote.status === "approved" && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="pt-6 text-sm">
            <p className="font-semibold">
              Aprobada {quote.approvedBy === "client" ? `por ${quote.approvedName} desde su página` : "por ti (WhatsApp)"} · {quote.approvedAt ? formatDateTime(quote.approvedAt) : ""}
            </p>
            {quote.clientComment && <p className="mt-2 whitespace-pre-wrap">«{quote.clientComment}»</p>}
          </CardContent>
        </Card>
      )}
      {quote.status === "rejected" && quote.clientComment && (
        <Card>
          <CardContent className="pt-6 text-sm">Comentario del cliente: «{quote.clientComment}»</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ítems</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {quote.items.map((i) => (
            <div key={i.id} className="flex justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {i.quantity > 1 ? `${i.quantity} × ` : ""}
                  {i.title}
                </p>
                {i.detail && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{i.detail}</p>}
              </div>
              <span className="font-semibold whitespace-nowrap">{formatMoney(i.quantity * i.unitPrice, quote.currency)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 pt-6 text-sm">
          {quote.issuedAt && <p>Enviada: {formatDateTime(quote.issuedAt)}</p>}
          {quote.validUntil && <p>Válida hasta: {formatDate(quote.validUntil)}</p>}
          {quote.notes && <p className="whitespace-pre-wrap">Notas: {quote.notes}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
