import { ArrowDown, ArrowUp, Lock, Trash2 } from "lucide-react";
import { formatMoney, parseMoneyInput } from "../../shared/money";
import type { Currency } from "../../shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { lineInvalid, parseQuantity, type EditorLine } from "@/lib/doc-lines";

/** Una línea del editor de cuenta de cobro / recibo: título, detalle, cantidad y valor; subir, bajar y quitar. */
export function DocLineRow({
  line: l,
  index,
  count,
  currency,
  checked,
  onChange,
  onMove,
  onRemove,
}: {
  line: EditorLine;
  index: number;
  count: number;
  currency: Currency;
  /** Ya se intentó emitir: marca lo que falta. */
  checked: boolean;
  onChange: (patch: Partial<EditorLine>) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const bad = checked && lineInvalid(l, currency);
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div className="flex items-start gap-1">
        <Input aria-label="Título" placeholder="Título de la línea" aria-invalid={bad && !l.title.trim()} value={l.title} onChange={(e) => onChange({ title: e.target.value })} />
        <Button type="button" variant="ghost" size="icon" className="h-10 w-8 shrink-0" aria-label="Subir línea" disabled={index === 0} onClick={() => onMove(-1)}>
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-10 w-8 shrink-0" aria-label="Bajar línea" disabled={index === count - 1} onClick={() => onMove(1)}>
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-10 w-8 shrink-0" aria-label="Quitar línea" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <Textarea aria-label="Detalle" rows={1} className="min-h-10" placeholder="Detalle (opcional)" value={l.detail} onChange={(e) => onChange({ detail: e.target.value })} />
      {l.locked ? (
        <p className="flex items-center gap-1.5 text-sm">
          <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <strong>{formatMoney(parseMoneyInput(l.price, currency) ?? 0, currency)}</strong>
          <span className="text-xs text-muted-foreground">· el valor se cambia en Pagos</span>
        </p>
      ) : (
        <div className="grid grid-cols-[4.5rem_1fr] gap-2">
          <Input aria-label="Cantidad" inputMode="numeric" aria-invalid={bad && parseQuantity(l.quantity) === null} value={l.quantity} onChange={(e) => onChange({ quantity: e.target.value })} />
          <Input
            aria-label="Valor"
            inputMode="decimal"
            placeholder={l.suggested || "Valor unitario"}
            aria-invalid={bad && parseMoneyInput(l.price, currency) === null}
            value={l.price}
            onChange={(e) => onChange({ price: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
