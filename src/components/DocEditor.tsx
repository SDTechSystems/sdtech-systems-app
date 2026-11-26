import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "../../shared/money";
import { methodLabel } from "../../shared/payment-methods";
import type { ChangeRequest, Collection, Invoice, PaymentSummary, Project, Quote } from "../../shared/types";
import { CatalogPicker } from "@/components/CatalogPicker";
import { DocLineRow } from "@/components/DocLineRow";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiSend } from "@/lib/api";
import { catalogLine } from "@/lib/catalog-pick";
import { collectionLines, defaultReceiptPayments, lineInvalid, linesTotal, newLinesTotal, receiptLines, shortcutLines, shortcutOf, toLineInputs, type EditorLine } from "@/lib/doc-lines";
import { errorMessage, formatDate } from "@/lib/labels";
import { useMediaQuery } from "@/lib/use-media-query";
import { useSettingsQuery } from "@/lib/useSettings";
import { cn } from "@/lib/utils";

let seq = 0;
const newKey = () => `n${++seq}`;

export type DocEditorMode = "collection" | "receipt";

/**
 * Editor de cuenta de cobro (CC-) y de recibo de pago (REC-): atajos en píldoras, líneas editables y, abajo,
 * «Emitir» con el total. Hoja desde abajo en el celular y diálogo en el computador. Se monta al abrirse.
 */
export function DocEditor({
  mode,
  project,
  summary,
  collections,
  receipts,
  quote,
  changes,
  advancePercent,
  initialPlanIds = [],
  fromCollection = null,
  onIssued,
  onClose,
}: {
  mode: DocEditorMode;
  project: Project;
  summary: PaymentSummary;
  collections: Collection[];
  receipts: Invoice[];
  quote: Quote | null;
  changes: ChangeRequest[];
  advancePercent: number;
  initialPlanIds?: string[];
  fromCollection?: Collection | null;
  onIssued: (doc: Collection | Invoice) => void;
  onClose: () => void;
}) {
  const desktop = useMediaQuery("(min-width: 640px)");
  const settings = useSettingsQuery();
  const receipt = mode === "receipt";
  const currency = fromCollection?.currency ?? summary.currency;
  const shortcuts = useMemo(() => shortcutLines({ summary, collections, quote, changes, advancePercent, receipt }), [summary, collections, quote, changes, advancePercent, receipt]);

  const [lines, setLines] = useState<EditorLine[]>(() => {
    if (receipt) return fromCollection ? collectionLines(fromCollection) : receiptLines({ summary, quote, changes, projectTitle: project.title });
    return shortcuts.filter((s) => initialPlanIds.some((id) => s.key === `plan:${id}`)).flatMap((s) => s.lines);
  });
  // La fecha acordada arranca en la de la promesa que se cobra.
  const [dueDate, setDueDate] = useState(() => summary.plans.filter((p) => initialPlanIds.includes(p.id)).map((p) => p.dueDate).sort()[0] ?? "");
  const [includeDelivery, setIncludeDelivery] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState("");
  const [note, setNote] = useState("");
  const [useAsTotal, setUseAsTotal] = useState(true);
  const [addToTotal, setAddToTotal] = useState(true);
  const [paymentIds, setPaymentIds] = useState<string[]>(() => defaultReceiptPayments(summary.payments, receipts, fromCollection));
  const [checked, setChecked] = useState(false);
  const [picking, setPicking] = useState(false);

  const total = linesTotal(lines, currency);
  const added = newLinesTotal(lines, currency);
  const m = (n: number) => formatMoney(n, currency);
  const unused = shortcuts.filter((s) => !lines.some((l) => shortcutOf(l) === s.key));
  const covered = new Map(receipts.filter((r) => !r.voided).flatMap((r) => r.paymentIds.map((id) => [id, r.number] as const)));
  const methods = settings.data?.settings.payment.methods ?? [];
  const badUrl = !!paymentUrl.trim() && !/^https:\/\/\S+$/.test(paymentUrl.trim());

  const update = (key: string, patch: Partial<EditorLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const move = (i: number, d: -1 | 1) =>
    setLines((ls) => {
      const next = [...ls];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });

  const issue = useMutation({
    mutationFn: async () => {
      const input = toLineInputs(lines, currency);
      if (receipt) {
        const body = { lines: input, paymentIds, ...(fromCollection ? { collectionId: fromCollection.id } : {}) };
        return (await apiSend<{ invoice: Invoice }>("POST", `/api/admin/projects/${project.id}/invoices`, body)).invoice;
      }
      const body = {
        lines: input,
        dueDate: dueDate || null,
        includeDelivery,
        paymentUrl: paymentUrl.trim() || null,
        note: note.trim() || null,
        setTotal: project.total === null && useAsTotal,
        addToTotal: project.total !== null && added > 0 && addToTotal,
      };
      return (await apiSend<{ collection: Collection }>("POST", `/api/admin/projects/${project.id}/collections`, body)).collection;
    },
    onSuccess: onIssued,
    onError: (e) => toast.error(errorMessage(e)),
  });

  const submit = () => {
    setChecked(true);
    if (!lines.length) return toast.error("Agrega al menos una línea");
    if (lines.some((l) => lineInvalid(l, currency))) return toast.error("Revisa las líneas marcadas: cada una necesita título, cantidad y valor");
    issue.mutate();
  };

  const title = receipt ? (fromCollection ? `Recibo de ${fromCollection.number}` : "Nuevo recibo de pago") : "Nueva cuenta de cobro";
  const hint = receipt ? "Lo cobrado y los pagos que lo cubren." : `Para ${project.clientName} · ${project.title}`;

  const body = (
    <div className="space-y-5">
      {unused.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Agregar rápido</p>
          <div className="flex flex-wrap gap-2">
            {unused.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setLines((ls) => [...ls, ...s.lines])}
                className="inline-flex max-w-full items-center gap-1 rounded-full border bg-background px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted"
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{s.label}</span>
                <span className="shrink-0 text-muted-foreground">· {m(linesTotal(s.lines, currency))}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {lines.length === 0 && <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">Toca un atajo o agrega una línea.</p>}
        {lines.map((l, i) => (
          <DocLineRow
            key={l.key}
            line={l}
            index={i}
            count={lines.length}
            currency={currency}
            checked={checked}
            onChange={(patch) => update(l.key, patch)}
            onMove={(d) => move(i, d)}
            onRemove={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
          />
        ))}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setPicking(true)}>
            <Plus className="h-4 w-4" /> Del catálogo
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setLines((ls) => [...ls, { key: newKey(), source: "free", title: "", detail: "", quantity: "1", price: "", locked: false }])}
          >
            <Plus className="h-4 w-4" /> Línea libre
          </Button>
        </div>
      </div>

      {!receipt && (
        <div className="space-y-4 border-t pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cc-due">Fecha acordada</Label>
              <Input id="cc-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cc-url">Link de pago</Label>
              <Input id="cc-url" inputMode="url" placeholder="https://…" aria-invalid={checked && badUrl} value={paymentUrl} onChange={(e) => setPaymentUrl(e.target.value)} />
            </div>
          </div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <Label htmlFor="cc-delivery">Incluir link de entrega</Label>
              {!project.deliveryUrl && <p className="text-xs text-muted-foreground">Primero guarda un link o sube la entrega</p>}
            </div>
            <Switch id="cc-delivery" checked={includeDelivery} disabled={!project.deliveryUrl} onCheckedChange={setIncludeDelivery} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cc-note">Nota (sale en el documento)</Label>
            <Textarea id="cc-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {project.total === null ? (
            <Check id="cc-total" checked={useAsTotal} onChange={setUseAsTotal}>
              Usar este valor como total del proyecto
            </Check>
          ) : (
            added > 0 && (
              <Check id="cc-add" checked={addToTotal} onChange={setAddToTotal}>
                Sumar {m(added)} al total del proyecto
              </Check>
            )
          )}
        </div>
      )}

      {receipt && (
        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-semibold">Pagos que cubre este recibo</p>
          {summary.payments.length === 0 && <p className="text-sm text-muted-foreground">Aún no hay pagos registrados.</p>}
          {summary.payments.map((p) => (
            <Check key={p.id} id={`rp-${p.id}`} checked={paymentIds.includes(p.id)} onChange={(on) => setPaymentIds((ids) => (on ? [...ids, p.id] : ids.filter((x) => x !== p.id)))}>
              {m(p.amount)} · {methodLabel(methods, p.method)} · {formatDate(p.paidOn)}
              {covered.has(p.id) && <span className="block text-xs text-muted-foreground">Ya está en {covered.get(p.id)}</span>}
            </Check>
          ))}
        </div>
      )}
    </div>
  );

  const footer = (
    <Button className="w-full" size="lg" disabled={issue.isPending} onClick={submit}>
      Emitir · {m(total)}
    </Button>
  );

  return (
    <>
      {desktop ? (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" onOpenAutoFocus={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{hint}</DialogDescription>
            </DialogHeader>
            {body}
            {footer}
          </DialogContent>
        </Dialog>
      ) : (
        <Sheet open onOpenChange={(o) => !o && onClose()}>
          {/* Sin foco inicial: en el celular no se abre el teclado si basta con tocar «Emitir». */}
          <SheetContent side="bottom" className="flex max-h-[92dvh] flex-col gap-0 rounded-t-2xl px-0 pb-0 pt-5" onOpenAutoFocus={(e) => e.preventDefault()}>
            <SheetHeader className="px-4 pb-3 text-left">
              <SheetTitle>{title}</SheetTitle>
              <SheetDescription>{hint}</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{body}</div>
            <div className="border-t bg-background px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3">{footer}</div>
          </SheetContent>
        </Sheet>
      )}
      <CatalogPicker
        open={picking}
        onOpenChange={setPicking}
        currency={currency}
        defaultService={project.service}
        onAdd={(items) => setLines((ls) => [...ls, ...items.map((it) => ({ key: newKey(), source: "catalog" as const, locked: false, ...catalogLine(it) }))])}
      />
    </>
  );
}

/** Casilla con su texto (toda la fila se puede tocar). */
function Check({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm", checked && "border-[var(--sd-blue)]")}>
      <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--sd-blue)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0">{children}</span>
    </label>
  );
}
