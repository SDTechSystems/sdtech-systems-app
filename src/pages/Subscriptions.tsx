import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { formatMoney } from "../../shared/money";
import type { Currency, Subscription } from "../../shared/types";
import { SubscriptionDialog } from "@/components/SubscriptionDialog";
import { SubscriptionRow } from "@/components/SubscriptionsCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { apiGet } from "@/lib/api";

export default function Subscriptions() {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["subscriptions", "list", all], queryFn: () => apiGet<{ subscriptions: Subscription[] }>(`/api/admin/subscriptions${all ? "?status=all" : ""}`) });
  const monthly = new Map<Currency, number>();
  for (const s of data?.subscriptions ?? []) {
    if (s.status !== "active") continue;
    monthly.set(s.currency, (monthly.get(s.currency) ?? 0) + (s.cycle === "mensual" ? s.amount : Math.round(s.amount / 12)));
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="sd-eyebrow mb-3">Suscripciones</p>
          <h1 className="sd-title sd-caret text-[2rem] sm:text-5xl">Suscripciones</h1>
          {monthly.size > 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              Ingreso recurrente estimado: {[...monthly].map(([c, v]) => `${formatMoney(v, c)}/mes`).join(" + ")}
            </p>
          )}
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Nueva
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Switch id="suball" checked={all} onCheckedChange={setAll} />
        <Label htmlFor="suball">Ver pausadas y canceladas</Label>
      </div>
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : data?.subscriptions.length ? (
        <Card>
          <CardContent className="sd-stagger divide-y pt-2">
            {data.subscriptions.map((s) => (
              <SubscriptionRow key={s.id} s={s} showClient />
            ))}
          </CardContent>
        </Card>
      ) : (
        <p className="py-10 text-center text-muted-foreground">Todavía no hay suscripciones. Agrega el hosting, dominio o mantenimiento de tus clientes para no olvidar cobrarlos.</p>
      )}
      {open && <SubscriptionDialog open={open} onOpenChange={setOpen} />}
    </div>
  );
}
