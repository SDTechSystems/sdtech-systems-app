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

export default function Home() {
  const { data: me } = useMe();
  const owner = me?.role === "owner";
  const { data, isLoading } = useQuery({ queryKey: ["pending"], queryFn: () => apiGet<Pending>("/api/admin/pending"), refetchInterval: 5 * 60_000 });
  const count = (u: string) => data?.items.filter((i) => i.urgency === u).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Hola 👋</h1>
          <p className="text-muted-foreground">
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
