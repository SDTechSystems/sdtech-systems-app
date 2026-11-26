import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ChangeRequest, Client, Collection, Invoice, PaymentSummary, Project, Quote } from "../../shared/types";
import { CollectionsCard } from "@/components/CollectionsCard";
import { DocEditor, type DocEditorMode } from "@/components/DocEditor";
import { PaymentDialog, type PaymentTarget } from "@/components/PaymentDialog";
import { PaymentsCard } from "@/components/PaymentsCard";
import { ReceiptsCard } from "@/components/ReceiptsCard";
import { apiGet } from "@/lib/api";
import { useSettingsQuery } from "@/lib/useSettings";

type EditorState = { mode: DocEditorMode; planIds?: string[]; from?: Collection };

/** Dinero del proyecto (solo el dueño), en orden: Cuentas de cobro → Recibos de pago → Pagos, con un solo editor y un solo registro de pago. */
export function ProjectBilling({ project, client, lastReminders }: { project: Project; client: Client; lastReminders: Record<string, string> }) {
  const qc = useQueryClient();
  const id = project.id;
  const settings = useSettingsQuery();
  const payments = useQuery({ queryKey: ["payments", id], queryFn: () => apiGet<PaymentSummary>(`/api/admin/projects/${id}/payments`) });
  const collections = useQuery({ queryKey: ["collections", id], queryFn: () => apiGet<{ collections: Collection[] }>(`/api/admin/projects/${id}/collections`) });
  const invoices = useQuery({ queryKey: ["invoices", id], queryFn: () => apiGet<{ invoices: Invoice[] }>(`/api/admin/projects/${id}/invoices`) });
  const changes = useQuery({ queryKey: ["changes", id], queryFn: () => apiGet<{ changes: ChangeRequest[] }>(`/api/admin/projects/${id}/changes`) });
  const quote = useQuery({ queryKey: ["quote", project.quoteId], queryFn: () => apiGet<{ quote: Quote }>(`/api/admin/quotes/${project.quoteId}`), enabled: !!project.quoteId });
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [paying, setPaying] = useState<PaymentTarget | null>(null);

  const list = collections.data?.collections ?? [];
  const receipts = invoices.data?.invoices ?? [];
  const ready = payments.data && collections.data && invoices.data && changes.data && (!project.quoteId || quote.data);

  const issued = (doc: Collection | Invoice) => {
    for (const key of [["collections", id], ["invoices", id], ["payments", id], ["project", id], ["pending"]]) qc.invalidateQueries({ queryKey: key });
    toast.success(`${doc.number} ${"verifyCode" in doc ? "emitido" : "emitida"}`);
    setEditor(null);
  };

  return (
    <>
      <CollectionsCard
        projectId={id}
        client={client}
        collections={list}
        onNew={() => setEditor({ mode: "collection" })}
        onPay={(c) => setPaying({ collection: c })}
        onReceipt={(c) => setEditor({ mode: "receipt", from: c })}
      />
      <ReceiptsCard projectId={id} client={client} invoices={receipts} onNew={() => setEditor({ mode: "receipt" })} />
      <PaymentsCard projectId={id} client={client} lastReminders={lastReminders} collections={list} onBill={(p) => setEditor({ mode: "collection", planIds: [p.id] })} onPay={setPaying} />

      {editor && ready && (
        <DocEditor
          mode={editor.mode}
          project={project}
          summary={payments.data!}
          collections={list}
          receipts={receipts}
          quote={quote.data?.quote ?? null}
          changes={changes.data!.changes}
          advancePercent={project.advancePercent ?? settings.data?.settings.quotes.advancePercent ?? 0}
          initialPlanIds={editor.planIds}
          fromCollection={editor.from}
          onIssued={issued}
          onClose={() => setEditor(null)}
        />
      )}
      {paying && payments.data && <PaymentDialog projectId={id} summary={payments.data} target={paying} onClose={() => setPaying(null)} />}
    </>
  );
}
