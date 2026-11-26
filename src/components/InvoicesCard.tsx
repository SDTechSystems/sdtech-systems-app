import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileCheck2, MessageCircle, X } from "lucide-react";
import { toast } from "sonner";
import { dayOf } from "../../shared/dates";
import { formatMoney } from "../../shared/money";
import type { Client, Invoice } from "../../shared/types";
import { Pill } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet, apiSend } from "@/lib/api";
import { errorMessage, firstName, formatDate } from "@/lib/labels";
import { getPortalUrl } from "@/lib/quote-actions";
import { openWhatsApp } from "@/lib/whatsapp";

export function InvoicesCard({ projectId, client }: { projectId: string; client: Pick<Client, "id" | "name" | "phone"> }) {
  const qc = useQueryClient();
  const key = ["invoices", projectId];
  const { data } = useQuery({ queryKey: key, queryFn: () => apiGet<{ invoices: Invoice[] }>(`/api/admin/projects/${projectId}/invoices`) });
  const call = useMutation({
    mutationFn: ({ path }: { path: string }) => apiSend("POST", path, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      toast.success("Listo");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const open = async (inv: Invoice) => {
    const tab = window.open("about:blank", "_blank");
    const url = await getPortalUrl(client.id);
    if (tab) tab.location.href = `${url}/recibo/${inv.number}`;
  };
  const send = async (inv: Invoice) => {
    const tab = client.phone ? window.open("about:blank", "_blank") : null;
    const url = await getPortalUrl(client.id);
    if (!openWhatsApp(client.phone, `Hola ${firstName(client.name)}, te comparto el recibo de pago ${inv.number}: ${url}/recibo/${inv.number}`, tab)) toast.success("El cliente no tiene WhatsApp: copiamos el mensaje.");
  };
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileCheck2 className="h-4 w-4" /> Recibos de pago
        </CardTitle>
        <Button
          size="sm"
          variant="outline"
          disabled={call.isPending}
          onClick={() => confirm("Se guardará una copia de cómo está el proyecto hoy: ítems, cambios aprobados y los pagos que aún no tienen recibo. ¿Emitir el recibo?") && call.mutate({ path: `/api/admin/projects/${projectId}/invoices` })}
        >
          Emitir recibo
        </Button>
      </CardHeader>
      <CardContent className="divide-y">
        {data?.invoices.length ? (
          data.invoices.map((inv) => (
            <div key={inv.id} className="space-y-2 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{inv.number}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(dayOf(inv.issuedAt))} · total {formatMoney(inv.total, inv.currency)}
                    {inv.number.startsWith("FAC-")
                      ? ` · saldo ${formatMoney(Math.max(inv.balance, 0), inv.currency)}`
                      : inv.projectBalance !== null && ` · saldo del proyecto ${formatMoney(Math.max(inv.projectBalance, 0), inv.currency)}`}
                  </p>
                  <p className="sd-mono text-[11px] text-muted-foreground">Verificación: {inv.verifyCode}</p>
                </div>
                {inv.voided ? <Pill tone="red">Anulado</Pill> : <Pill tone="green">Emitido</Pill>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => open(inv)}>
                  <ExternalLink className="h-4 w-4" /> Ver
                </Button>
                {!inv.voided && (
                  <>
                    <Button size="sm" variant="whatsapp" onClick={() => send(inv)}>
                      <MessageCircle className="h-4 w-4" /> Enviar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => confirm(`¿Anular ${inv.number}? Seguirá existiendo, marcado como anulado.`) && call.mutate({ path: `/api/admin/invoices/${inv.id}/void` })}>
                      <X className="h-4 w-4" /> Anular
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))
        ) : (
          <p className="py-2 text-sm text-muted-foreground">Cuando el cliente pague, emite el recibo de pago: incluye lo cobrado, los pagos que lo cubren y el saldo del proyecto.</p>
        )}
      </CardContent>
    </Card>
  );
}
