import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Client } from "../../shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiSend } from "@/lib/api";
import { errorMessage } from "@/lib/labels";

type Fields = { name: string; phone: string; email: string; document: string; city: string; company: string; notes: string };

const FIELDS: { key: keyof Fields; label: string; type?: string; placeholder?: string; inputMode?: "tel" | "email" }[] = [
  { key: "name", label: "Nombre *", placeholder: "Nombre y apellido" },
  { key: "phone", label: "WhatsApp", placeholder: "305 814 7293", inputMode: "tel" },
  { key: "email", label: "Correo", type: "email", inputMode: "email" },
  { key: "company", label: "Empresa o marca" },
  { key: "document", label: "Cédula o NIT" },
  { key: "city", label: "Ciudad" },
];

export function ClientForm({ client, onDone }: { client?: Client; onDone: (c: Client) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<Fields>({
    name: client?.name ?? "",
    phone: client?.phone ? `+${client.phone}` : "",
    email: client?.email ?? "",
    document: client?.document ?? "",
    city: client?.city ?? "",
    company: client?.company ?? "",
    notes: client?.notes ?? "",
  });

  const save = useMutation({
    mutationFn: () =>
      client
        ? apiSend<{ client: Client }>("PATCH", `/api/admin/clients/${client.id}`, f)
        : apiSend<{ client: Client }>("POST", "/api/admin/clients", f),
    onSuccess: ({ client: saved }) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["client", saved.id] });
      toast.success("Guardado");
      onDone(saved);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      {FIELDS.map(({ key, label, type, placeholder, inputMode }) => (
        <div key={key} className="space-y-1.5">
          <Label htmlFor={key}>{label}</Label>
          <Input
            id={key}
            type={type ?? "text"}
            inputMode={inputMode}
            placeholder={placeholder}
            value={f[key]}
            required={key === "name"}
            onChange={(e) => setF({ ...f, [key]: e.target.value })}
          />
        </div>
      ))}
      <div className="space-y-1.5">
        <Label htmlFor="notes">Notas</Label>
        <Textarea id="notes" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </div>
      <Button type="submit" className="w-full" disabled={save.isPending}>
        {save.isPending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}
