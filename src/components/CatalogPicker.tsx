import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import type { CatalogItem, Currency, Service } from "../../shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";

const TAB_LABEL: Record<Service, string> = { web: "Web", marca: "Marca", software: "Software", general: "General" };
const SERVICES = Object.keys(TAB_LABEL) as Service[];

export function CatalogPicker({
  open,
  onOpenChange,
  currency,
  defaultService,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currency: Currency;
  defaultService: Service;
  onAdd: (items: CatalogItem[]) => void;
}) {
  const catalog = useQuery({ queryKey: ["catalog", "active"], queryFn: () => apiGet<{ items: CatalogItem[] }>("/api/admin/catalog"), enabled: open });
  const [tab, setTab] = useState<Service>(defaultService);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    if (open) setTab(defaultService);
  }, [open, defaultService]);

  const items = useMemo(() => (catalog.data?.items ?? []).filter((i) => i.active && i.currency === currency), [catalog.data, currency]);
  const shown = items.filter((i) => i.service === tab);

  const close = (v: boolean) => {
    if (!v) setPicked([]);
    onOpenChange(v);
  };
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const add = () => {
    onAdd(items.filter((i) => picked.includes(i.id)));
    close(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Agregar del catálogo</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as Service)}>
          <TabsList className="grid w-full grid-cols-4">
            {SERVICES.map((s) => (
              <TabsTrigger key={s} value={s} className="px-1">
                {TAB_LABEL[s]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {items.length === 0 && <p className="text-sm text-muted-foreground">No hay ítems del catálogo en {currency}.</p>}
        {items.length > 0 && shown.length === 0 && <p className="text-sm text-muted-foreground">No hay ítems en {TAB_LABEL[tab]}.</p>}
        <div className="flex flex-wrap gap-2">
          {shown.map((it) => {
            const on = picked.includes(it.id);
            return (
              <button
                key={it.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(it.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-sm transition-colors",
                  on ? "border-[var(--sd-blue)] bg-[var(--sd-blue)] text-white" : "bg-background hover:bg-muted",
                )}
              >
                {on && <Check className="h-3.5 w-3.5 shrink-0" />}
                <span>{it.name}</span>
              </button>
            );
          })}
        </div>
        <Button disabled={picked.length === 0} onClick={add}>
          Agregar {picked.length}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
