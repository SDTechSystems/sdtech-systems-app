import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, Plus, Search } from "lucide-react";
import type { Client } from "../../shared/types";
import { ClientForm } from "@/components/ClientForm";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { apiGet } from "@/lib/api";

export default function Clients() {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQ(text), 300);
    return () => clearTimeout(t);
  }, [text]);

  const { data, isLoading } = useQuery({
    queryKey: ["clients", q, archived],
    queryFn: () => apiGet<{ clients: Client[] }>(`/api/admin/clients?q=${encodeURIComponent(q)}&archived=${archived ? 1 : 0}`),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div><p className="sd-eyebrow mb-3">01 / Clientes</p><h1 className="sd-title sd-caret text-[2rem] sm:text-5xl">Clientes</h1></div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Nuevo cliente
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por nombre, empresa, teléfono…" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="flex items-center gap-2">
        <Switch id="archived" checked={archived} onCheckedChange={setArchived} />
        <Label htmlFor="archived">Ver archivados</Label>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : data?.clients.length ? (
        <Card className="sd-stagger divide-y overflow-hidden">
          {data.clients.map((c) => (
            <Link key={c.id} to={`/clientes/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[#0f2542]">
              <div className="min-w-0">
                <p className="font-semibold truncate">{c.name}</p>
                <p className="text-sm text-muted-foreground truncate">{[c.company, c.phone ? `+${c.phone}` : null].filter(Boolean).join(" · ") || "Sin datos de contacto"}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </Card>
      ) : (
        <p className="py-10 text-center text-muted-foreground">{q ? "No hay clientes con esa búsqueda." : archived ? "No hay clientes archivados." : "Todavía no tienes clientes. Crea el primero."}</p>
      )}

      <Sheet open={creating} onOpenChange={setCreating}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Nuevo cliente</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <ClientForm
              onDone={(c) => {
                setCreating(false);
                navigate(`/clientes/${c.id}`);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
