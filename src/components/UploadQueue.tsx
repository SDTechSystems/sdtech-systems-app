import { ProgressBar } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/labels";
import type { UploadItem } from "@/lib/use-drive-uploads";

const stateLabel = (i: UploadItem) => (i.state === "queued" ? "en cola" : i.state === "uploading" ? `subiendo ${Math.round(i.progress * 100)} %` : i.state === "done" ? "listo" : "falló");

/** Los archivos que se están subiendo a Drive: nombre, tamaño, barra y estado. */
export function UploadQueue({ items, onRetry }: { items: UploadItem[]; onRetry: (key: number) => void }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-3" aria-label="Archivos subiendo a Drive">
      {items.map((i) => (
        <li key={i.key} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium" title={i.file.name}>
              {i.file.name}
            </span>
            <span className="shrink-0 whitespace-nowrap text-muted-foreground">
              {formatBytes(i.file.size)} · <span className={i.state === "failed" ? "text-rose-400" : i.state === "done" ? "text-emerald-400" : undefined}>{stateLabel(i)}</span>
              {i.state === "failed" && (
                <>
                  {" · "}
                  <Button variant="link" className="h-auto p-0 text-sm" onClick={() => onRetry(i.key)}>
                    Reintentar
                  </Button>
                </>
              )}
            </span>
          </div>
          <ProgressBar value={Math.round(i.progress * 100)} />
          {i.state === "failed" && i.error && <p className="text-xs text-muted-foreground">{i.error}</p>}
        </li>
      ))}
    </ul>
  );
}
