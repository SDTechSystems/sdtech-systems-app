import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, MessageCircle, Pencil, Video, X } from "lucide-react";
import { toast } from "sonner";
import { meetingDayLabel, meetingTimeLabel } from "../../shared/dates";
import { fillTemplate } from "../../shared/templates";
import type { Client, Meeting } from "../../shared/types";
import { MeetingDialog } from "@/components/MeetingDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet, apiSend } from "@/lib/api";
import { errorMessage } from "@/lib/labels";
import { useSettingsQuery } from "@/lib/useSettings";
import { logReminder, meetingVars, openWhatsApp } from "@/lib/whatsapp";
import { DEFAULT_TEMPLATES } from "../../shared/templates";

export function MeetingRow({ m, client }: { m: Meeting; client: Pick<Client, "name" | "phone" | "email"> & { id: string } }) {
  const qc = useQueryClient();
  const settings = useSettingsQuery();
  const [editing, setEditing] = useState(false);
  const cancel = useMutation({
    mutationFn: () => apiSend("DELETE", `/api/admin/meetings/${m.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meetings"] });
      qc.invalidateQueries({ queryKey: ["pending"] });
      toast.success("Reunión cancelada");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remind = () => {
    const template = settings.data?.settings.templates.meeting ?? DEFAULT_TEMPLATES.meeting;
    const sent = openWhatsApp(client.phone, fillTemplate(template, meetingVars(m, client.name)));
    void logReminder("client", client.id, "meeting");
    if (!sent) toast.success("El cliente no tiene WhatsApp: copiamos el mensaje.");
  };
  return (
    <div className="space-y-2 py-3">
      <div>
        <p className="font-medium">{m.title}</p>
        <p className="text-sm text-muted-foreground">
          {meetingDayLabel(m.startAt)} · {meetingTimeLabel(m.startAt)} · {m.durationMin} min
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {m.meetUrl && (
          <Button size="sm" asChild>
            <a href={m.meetUrl} target="_blank" rel="noreferrer">
              <Video className="h-4 w-4" /> Entrar al Meet
            </a>
          </Button>
        )}
        <Button size="sm" variant="whatsapp" onClick={remind}>
          <MessageCircle className="h-4 w-4" /> Recordar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          <Pencil className="h-4 w-4" /> Editar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => confirm(`¿Cancelar «${m.title}»?`) && cancel.mutate()}>
          <X className="h-4 w-4" /> Cancelar
        </Button>
      </div>
      {editing && <MeetingDialog open={editing} onOpenChange={setEditing} clientId={m.clientId} clientEmail={client.email} meeting={m} />}
    </div>
  );
}

export function MeetingsCard({ client, projectId, defaultTitle }: { client: Pick<Client, "id" | "name" | "phone" | "email">; projectId?: string; defaultTitle?: string }) {
  const [open, setOpen] = useState(false);
  const q = projectId ? `projectId=${projectId}` : `clientId=${client.id}`;
  const { data } = useQuery({ queryKey: ["meetings", q], queryFn: () => apiGet<{ meetings: Meeting[] }>(`/api/admin/meetings?${q}`) });
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Video className="h-4 w-4" /> Reuniones
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <CalendarPlus className="h-4 w-4" /> Agendar
        </Button>
      </CardHeader>
      <CardContent className="divide-y">
        {data?.meetings.length ? data.meetings.map((m) => <MeetingRow key={m.id} m={m} client={client} />) : <p className="py-2 text-sm text-muted-foreground">No hay reuniones próximas.</p>}
      </CardContent>
      {open && <MeetingDialog open={open} onOpenChange={setOpen} clientId={client.id} clientEmail={client.email} projectId={projectId} defaultTitle={defaultTitle} />}
    </Card>
  );
}
