import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { CalendarCheck, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Pill } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiSend } from "@/lib/api";
import { useGoogleStatus, type GoogleStatus } from "@/lib/google";
import { errorMessage, formatDateTime } from "@/lib/labels";

type SyncResult = { created: number; updated: number; deleted: number; errors: number; skipped?: string };

export function GoogleCalendarCard() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { data } = useGoogleStatus();

  useEffect(() => {
    if (params.get("google") === "ok") {
      toast.success("Google conectado ✅");
      params.delete("google");
      setParams(params, { replace: true });
      qc.invalidateQueries({ queryKey: ["google"] });
    }
  }, [params, setParams, qc]);

  const sync = useMutation({
    mutationFn: () => apiSend<SyncResult>("POST", "/api/admin/google/sync", {}),
    onSuccess: (r) =>
      r.skipped ? toast.error("Google Calendar no está conectado.") : toast.success(`Calendario al día: ${r.created} nuevos, ${r.updated} actualizados, ${r.deleted} quitados${r.errors ? `, ${r.errors} con error` : ""}.`),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const disconnect = useMutation({
    mutationFn: () => apiSend<GoogleStatus>("DELETE", "/api/admin/google"),
    onSuccess: (r) => {
      qc.setQueryData(["google"], r);
      toast.success("Google desconectado");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const status = data?.status ?? "disconnected";
  const needsDrive = status === "ok" && !data?.drive;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-3 text-base">
          <CalendarCheck className="h-4 w-4 text-[var(--sd-cyan)]" /> Google: Calendar y Drive
          {status === "ok" ? <Pill tone="green">Conectado</Pill> : status === "reconnect" ? <Pill tone="amber">Reconectar</Pill> : <Pill tone="slate">Sin conectar</Pill>}
        </CardTitle>
        <CardDescription>
          Las reuniones se crean con link de Meet, y las entregas, fases y cobros aparecen en tu calendario con avisos 1 día, 1 hora y 15 minutos antes.
          {data?.connectedAt && status === "ok" ? ` Conectado el ${formatDateTime(data.connectedAt)}.` : ""}
          {status === "reconnect" ? " Google pidió volver a autorizar la conexión." : ""}
        </CardDescription>
        {status === "ok" && (
          <p className="text-sm">
            {data?.drive ? (
              <span className="text-emerald-400">Drive conectado: los PDF y las entregas se guardan en la carpeta «SD Tech Systems» de tu Drive.</span>
            ) : (
              <span className="text-amber-300">Reconecta Google para usar Drive.</span>
            )}
          </p>
        )}
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {status !== "ok" ? (
          <Button asChild>
            <a href="/api/google/connect">{status === "reconnect" ? "Reconectar Google" : "Conectar Google"}</a>
          </Button>
        ) : (
          <>
            {needsDrive && (
              <Button asChild>
                <a href="/api/google/connect">Reconectar Google</a>
              </Button>
            )}
            <Button variant="outline" disabled={sync.isPending} onClick={() => sync.mutate()}>
              <RefreshCw className={`h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`} /> Sincronizar ahora
            </Button>
            <Button variant="ghost" onClick={() => confirm("¿Desconectar Google? Los eventos ya creados se quedan en tu calendario y los archivos, en tu Drive.") && disconnect.mutate()}>
              <Unplug className="h-4 w-4" /> Desconectar
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
