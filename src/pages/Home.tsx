import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { FilePlus } from "lucide-react";
import type { Pending } from "../../shared/types";
import { PendingList } from "@/components/PendingList";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api";
import { formatDate } from "@/lib/labels";
import { useMe } from "@/lib/session";

function greetingNow(): [string, string] {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return hour < 12 ? ["Buenos", "días"] : hour < 19 ? ["Buenas", "tardes"] : ["Buenas", "noches"];
}

export default function Home() {
  const greeting = greetingNow();
  const { data: me } = useMe();
  const owner = me?.role === "owner";
  const { data, isLoading } = useQuery({ queryKey: ["pending"], queryFn: () => apiGet<Pending>("/api/admin/pending"), refetchInterval: 5 * 60_000 });
  const count = (u: string) => data?.items.filter((i) => i.urgency === u).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="sd-eyebrow mb-3">Panel / Inicio</p>
          <h1 className="sd-title sd-caret text-[2rem] sm:text-5xl">{greeting[0]} <span className="text-[var(--sd-cyan)]">{greeting[1]}</span></h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {data ? `${formatDate(data.today)} · ${count("overdue")} vencidos, ${count("today")} para hoy, ${count("soon")} próximos` : "Esto es lo que tienes pendiente."}
          </p>
        </div>
        {owner && (
          <Button asChild>
            <Link to="/cotizaciones/nueva">
              <FilePlus className="h-4 w-4" /> Nueva cotización
            </Link>
          </Button>
        )}
      </div>
      {isLoading || !data ? <Skeleton className="h-48 w-full" /> : <PendingList data={data} owner={owner} />}
    </div>
  );
}
