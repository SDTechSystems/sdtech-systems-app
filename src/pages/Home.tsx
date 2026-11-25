import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MeetingDialog } from "@/components/MeetingDialog";
import { Link } from "react-router-dom";
import { CalendarPlus, FilePlus } from "lucide-react";
import type { Pending } from "../../shared/types";
import { PendingList } from "@/components/PendingList";
import { MeetingRow } from "@/components/MeetingsCard";
import { Card } from "@/components/ui/card";
import { dayOf } from "../../shared/dates";
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
  const [scheduling, setScheduling] = useState(false);
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
            {data
              ? `${formatDate(data.today)} · ${data.meetings.length} ${data.meetings.length === 1 ? "reunión" : "reuniones"}, ${count("overdue")} vencidos, ${count("today")} para hoy, ${count("soon")} próximos`
              : "Esto es lo que tienes pendiente."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setScheduling(true)}>
            <CalendarPlus className="h-4 w-4" /> Agendar reunión
          </Button>
          {owner && (
            <Button asChild>
              <Link to="/cotizaciones/nueva">
                <FilePlus className="h-4 w-4" /> Nueva cotización
              </Link>
            </Button>
          )}
        </div>
        {scheduling && <MeetingDialog open={scheduling} onOpenChange={setScheduling} />}
      </div>
      {data?.google.status === "reconnect" && owner && (
        <Card className="border-amber-300/50 p-4 text-sm">
          Google Calendar pidió volver a autorizar la conexión.{" "}
          <Link to="/ajustes" className="text-[var(--sd-cyan)] underline">
            Reconectar en Ajustes
          </Link>
        </Card>
      )}
      {data?.google.status === "disconnected" && owner && (
        <Card className="p-4 text-sm text-muted-foreground">
          Conecta Google Calendar para crear reuniones con Meet y ver tus fechas en el calendario.{" "}
          <Link to="/ajustes" className="text-[var(--sd-cyan)] underline">
            Ir a Ajustes
          </Link>
        </Card>
      )}
      {!!data?.meetings.length && (
        <section className="space-y-2">
          <h2 className="sd-eyebrow">Reuniones de hoy y mañana ({data.meetings.length})</h2>
          <Card className="sd-stagger divide-y overflow-hidden border-l-4 border-l-[var(--sd-blue)] px-4">
            {data.meetings.map((m) => (
              <div key={m.id}>
                <p className="sd-mono pt-3 text-[10px] uppercase tracking-widest text-[var(--sd-cyan)]">
                  {dayOf(m.startAt) === data.today ? "Hoy" : "Mañana"} · {m.clientName}
                </p>
                <MeetingRow m={m} client={{ id: m.clientId, name: m.clientName, phone: m.clientPhone, email: null }} />
              </div>
            ))}
          </Card>
        </section>
      )}
      {isLoading || !data ? <Skeleton className="h-48 w-full" /> : <PendingList data={data} owner={owner} />}
    </div>
  );
}
