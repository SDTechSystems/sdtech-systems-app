import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import type { CatalogItem, Service } from "../../shared/types";
import { CatalogItemForm } from "@/components/CatalogItemForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { apiGet, apiSend } from "@/lib/api";
import { SERVICE_LABEL, errorMessage, priceLabel } from "@/lib/labels";

export default function Catalog() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<CatalogItem | "new" | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["catalog"], queryFn: () => apiGet<{ items: CatalogItem[] }>("/api/admin/catalog?all=1") });

  const toggle = useMutation({
    mutationFn: (it: CatalogItem) => apiSend("PATCH", `/api/admin/catalog/${it.id}`, { active: !it.active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const groups = (Object.keys(SERVICE_LABEL) as Service[])
    .map((s) => ({ service: s, items: (data?.items ?? []).filter((i) => i.service === s) }))
    .filter((g) => g.items.length);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Catálogo</h1>
          <p className="text-sm text-muted-foreground">Precios base para cotizar. Cambiarlos no afecta cotizaciones ya hechas.</p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> Nuevo
        </Button>
      </div>

      {isLoading && <Skeleton className="h-64 w-full" />}

      {groups.map((g) => (
        <Card key={g.service}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{SERVICE_LABEL[g.service]}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {g.items.map((it) => (
              <div key={it.id} className={`flex items-start gap-3 px-6 py-3 ${it.active ? "" : "opacity-50"}`}>
                <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(it)}>
                  <p className="font-semibold">{it.name}</p>
                  {it.description && <p className="text-sm text-muted-foreground">{it.description}</p>}
                  <p className="mt-1 font-semibold text-[var(--sd-blue)]">{priceLabel(it)}</p>
                </button>
                <Switch checked={it.active} onCheckedChange={() => toggle.mutate(it)} aria-label={it.active ? "Desactivar" : "Activar"} />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <Sheet open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing === "new" ? "Nuevo ítem" : "Editar ítem"}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            {editing !== null && <CatalogItemForm key={editing === "new" ? "new" : editing.id} item={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
