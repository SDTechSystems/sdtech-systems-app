import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CloudUpload, Download, ExternalLink, FileCheck2, FileText, MessageCircle, Plus, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { dayOf } from "../../shared/dates";
import { formatMoney } from "../../shared/money";
import type { Client, Collection, CollectionStatus } from "../../shared/types";
import { Pill } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiSend } from "@/lib/api";
import { errorMessage, formatDate } from "@/lib/labels";
import { getPortalUrl } from "@/lib/quote-actions";
import { useDocPdf } from "@/pdf/documents";

const STATUS: Record<CollectionStatus, readonly ["slate" | "amber" | "green" | "red", string]> = {
  pending: ["slate", "Pendiente"],
  partial: ["amber", "Abonada"],
  paid: ["green", "Pagada"],
  voided: ["red", "Anulada"],
};

/** Cuentas de cobro del proyecto (CC-0001…). «Enviar» manda el PDF por WhatsApp; «Descargar PDF» solo lo descarga. */
export function CollectionsCard({
  projectId,
  client,
  collections,
  onNew,
  onPay,
  onReceipt,
}: {
  projectId: string;
  client: Pick<Client, "id" | "phone">;
  collections: Collection[];
  onNew: () => void;
  onPay: (c: Collection) => void;
  onReceipt: (c: Collection) => void;
}) {
  const qc = useQueryClient();
  const pdf = useDocPdf();
  const voidIt = useMutation({
    mutationFn: (c: Collection) => apiSend("POST", `/api/admin/collections/${c.id}/void`, {}),
    onSuccess: () => {
      for (const key of [["collections", projectId], ["payments", projectId], ["pending"], ["project", projectId]]) qc.invalidateQueries({ queryKey: key });
      toast.success("Cuenta de cobro anulada");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const open = async (c: Collection) => {
    const tab = window.open("about:blank", "_blank");
    const url = await getPortalUrl(client.id);
    if (tab) tab.location.href = `${url}/cobro/${c.number}`;
  };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4" /> Cuentas de cobro
        </CardTitle>
        <Button size="sm" variant="outline" onClick={onNew}>
          <Plus className="h-4 w-4" /> Cuenta de cobro
        </Button>
      </CardHeader>
      <CardContent className="divide-y">
        {collections.length ? (
          collections.map((c) => {
            const [tone, label] = STATUS[c.status];
            const m = (n: number) => formatMoney(n, c.currency);
            const live = c.status === "pending" || c.status === "partial";
            return (
              <div key={c.id} className="space-y-2 py-3">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{c.number}</p>
                    <Pill tone={tone}>{label}</Pill>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(dayOf(c.issuedAt))} · {m(c.total)}
                    {c.status === "partial" && ` · falta ${m(c.total - c.paid)}`}
                  </p>
                  {c.dueDate && live && <p className="text-sm text-muted-foreground">Fecha acordada: {formatDate(c.dueDate)}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => open(c)}>
                    <ExternalLink className="h-4 w-4" /> Ver
                  </Button>
                  {c.status !== "voided" && (
                    <Button size="sm" variant="whatsapp" disabled={!pdf.ready || !!pdf.busy} onClick={() => pdf.send({ kind: "collection", doc: c }, client.phone)}>
                      <MessageCircle className="h-4 w-4" /> {pdf.busy === `send:${c.id}` ? "Generando…" : "Enviar"}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" disabled={!pdf.ready || !!pdf.busy} onClick={() => pdf.download({ kind: "collection", doc: c })}>
                    <Download className="h-4 w-4" /> {pdf.busy === `download:${c.id}` ? "Generando…" : "Descargar PDF"}
                  </Button>
                  {pdf.drive && (
                    <Button size="sm" variant="outline" disabled={!pdf.ready || pdf.saving.includes(c.id)} onClick={() => pdf.saveToDrive({ kind: "collection", doc: c })}>
                      <CloudUpload className="h-4 w-4" /> {pdf.saving.includes(c.id) ? "Guardando…" : "Guardar en Drive"}
                    </Button>
                  )}
                  {live && (
                    <Button size="sm" variant="outline" onClick={() => onPay(c)}>
                      <Wallet className="h-4 w-4" /> Registrar pago
                    </Button>
                  )}
                  {c.status === "paid" && (
                    <Button size="sm" variant="outline" onClick={() => onReceipt(c)}>
                      <FileCheck2 className="h-4 w-4" /> Emitir recibo
                    </Button>
                  )}
                  {c.status !== "voided" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={voidIt.isPending}
                      onClick={() => confirm(`¿Anular ${c.number}? Seguirá existiendo, marcada como anulada.`) && voidIt.mutate(c)}
                    >
                      <X className="h-4 w-4" /> Anular
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <p className="py-2 text-sm text-muted-foreground">Arma la cuenta con una promesa, el saldo o ítems del catálogo y emítela: el cliente la ve en su portal.</p>
        )}
      </CardContent>
    </Card>
  );
}
