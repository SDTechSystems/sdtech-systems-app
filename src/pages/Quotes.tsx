import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronRight, Plus } from "lucide-react";
import { formatMoney } from "../../shared/money";
import type { Quote, QuoteStatus } from "../../shared/types";
import { QuoteBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/labels";

const FILTERS: { value: QuoteStatus | "all"; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "draft", label: "Borradores" },
  { value: "sent", label: "Enviadas" },
  { value: "approved", label: "Aprobadas" },
  { value: "expired", label: "Vencidas" },
];

export default function Quotes() {
  const [filter, setFilter] = useState<QuoteStatus | "all">("all");
  const { data, isLoading } = useQuery({
    queryKey: ["quotes", filter],
    queryFn: () => apiGet<{ quotes: Quote[] }>(`/api/admin/quotes${filter === "all" ? "" : `?status=${filter}`}`),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div><p className="sd-eyebrow mb-3">02 / Cotizaciones</p><h1 className="sd-title sd-caret text-[2rem] sm:text-5xl">Cotizaciones</h1></div>
        <Button asChild>
          <Link to="/cotizaciones/nueva">
            <Plus className="h-4 w-4" /> Nueva
          </Link>
        </Button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn("rounded-full border px-3 py-1.5 text-sm whitespace-nowrap", filter === f.value ? "border-primary bg-primary text-primary-foreground" : "bg-card")}
          >
            {f.label}
          </button>
        ))}
      </div>
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : data?.quotes.length ? (
        <Card className="sd-stagger divide-y overflow-hidden">
          {data.quotes.map((q) => (
            <Link key={q.id} to={`/cotizaciones/${q.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[#0f2542]">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{q.number}</span>
                  <QuoteBadge status={q.status} />
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {q.clientName} · {q.items[0]?.title}
                  {q.validUntil && q.status === "sent" ? ` · vence el ${formatDate(q.validUntil)}` : ""}
                </p>
              </div>
              <span className="font-semibold whitespace-nowrap">{formatMoney(q.total, q.currency)}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </Card>
      ) : (
        <p className="py-10 text-center text-muted-foreground">No hay cotizaciones aquí todavía.</p>
      )}
    </div>
  );
}
