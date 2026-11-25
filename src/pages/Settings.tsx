import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { Role } from "../../shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PhaseTemplatesCard, SettingsBusiness } from "@/components/SettingsBusiness";
import { TemplatesCard } from "@/components/TemplatesCard";
import { apiGet, apiSend } from "@/lib/api";
import { errorMessage } from "@/lib/labels";

type User = { email: string; role: Role; name: string | null };

export default function Settings() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const { data } = useQuery({ queryKey: ["users"], queryFn: () => apiGet<{ users: User[] }>("/api/admin/users") });

  const add = useMutation({
    mutationFn: () => apiSend("POST", "/api/admin/users", { email }),
    onSuccess: () => {
      setEmail("");
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("Colaborador agregado. Recuerda darle acceso también en Cloudflare Access.");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (target: string) => apiSend("DELETE", `/api/admin/users/${encodeURIComponent(target)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("Acceso retirado");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="space-y-5">
      <div><p className="sd-eyebrow mb-3">05 / Ajustes</p><h1 className="sd-title sd-caret text-[2rem] sm:text-5xl">Ajustes</h1></div>

      <SettingsBusiness />
      <TemplatesCard />
      <PhaseTemplatesCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usuarios</CardTitle>
          <CardDescription>Un colaborador puede ver clientes y proyectos y avanzar fases. No ve precios, pagos ni ajustes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="divide-y">
            {data?.users.map((u) => (
              <li key={u.email} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium">{u.email}</p>
                  <Badge variant={u.role === "owner" ? "default" : "secondary"}>{u.role === "owner" ? "Dueño" : "Colaborador"}</Badge>
                </div>
                {u.role === "collaborator" && (
                  <Button variant="ghost" size="icon" aria-label="Quitar acceso" onClick={() => remove.mutate(u.email)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
          >
            <Input type="email" required placeholder="correo@ejemplo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" disabled={add.isPending}>
              <UserPlus className="h-4 w-4" /> Agregar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exportar</CardTitle>
          <CardDescription>Disponible en una próxima etapa.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" disabled>
            Descargar copia (JSON)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
