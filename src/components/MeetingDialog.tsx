import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { addDays, todayBogota } from "../../shared/dates";
import type { Meeting } from "../../shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiSend } from "@/lib/api";
import { errorMessage } from "@/lib/labels";

const localParts = (instant: string) => {
  const d = new Date(Date.parse(instant) - 5 * 3600_000).toISOString();
  return { date: d.slice(0, 10), time: d.slice(11, 16) };
};

export function MeetingDialog({
  open,
  onOpenChange,
  clientId,
  clientEmail,
  projectId,
  meeting,
  defaultTitle,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clientId: string;
  clientEmail: string | null;
  projectId?: string;
  meeting?: Meeting;
  defaultTitle?: string;
}) {
  const qc = useQueryClient();
  const initial = meeting ? localParts(meeting.startAt) : { date: addDays(todayBogota(), 1), time: "10:00" };
  const [title, setTitle] = useState(meeting?.title ?? defaultTitle ?? "Reunión");
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [duration, setDuration] = useState(String(meeting?.durationMin ?? 30));
  const [notes, setNotes] = useState(meeting?.notes ?? "");
  const [invite, setInvite] = useState(meeting?.inviteClient ?? false);

  const save = useMutation({
    mutationFn: () => {
      const body = { clientId, projectId, title, start: `${date}T${time}`, durationMin: Number(duration), notes, inviteClient: invite };
      return meeting
        ? apiSend<{ meeting: Meeting; googleError: string | null }>("PATCH", `/api/admin/meetings/${meeting.id}`, body)
        : apiSend<{ meeting: Meeting; googleError: string | null }>("POST", "/api/admin/meetings", body);
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["meetings"] });
      qc.invalidateQueries({ queryKey: ["pending"] });
      if (r.googleError === "not_connected") toast.warning("Reunión guardada. Conecta Google Calendar en Ajustes para crear el link de Meet.");
      else if (r.googleError) toast.warning("Reunión guardada, pero Google no respondió. Intenta de nuevo más tarde.");
      else toast.success(r.meeting.meetUrl ? "Reunión agendada con link de Meet" : "Reunión guardada");
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{meeting ? "Editar reunión" : "Agendar reunión"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="mtitle">Título</Label>
            <Input id="mtitle" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mdate">Fecha</Label>
              <Input id="mdate" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mtime">Hora</Label>
              <Input id="mtime" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Duración</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["30", "45", "60", "90"].map((d) => (
                  <SelectItem key={d} value={d}>
                    {d} minutos
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mnotes">Notas (se ven en tu calendario)</Label>
            <Textarea id="mnotes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {!meeting && (
            <div className="flex items-center gap-2">
              <Switch id="minvite" checked={invite} onCheckedChange={setInvite} disabled={!clientEmail} />
              <Label htmlFor="minvite" className={clientEmail ? "" : "text-muted-foreground"}>
                {clientEmail ? `Invitar al cliente por correo (${clientEmail})` : "Invitar por correo (el cliente no tiene correo)"}
              </Label>
            </div>
          )}
          <Button type="submit" className="w-full" disabled={save.isPending}>
            {meeting ? "Guardar cambios" : "Agendar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
