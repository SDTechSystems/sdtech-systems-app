import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { MAX_DETAIL } from "../../shared/docs/model";
import { formatMoney, parseMoneyInput } from "../../shared/money";
import type { Client, Currency, Quote, Service, Settings } from "../../shared/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CatalogPicker } from "@/components/CatalogPicker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiSend } from "@/lib/api";
import { catalogLine } from "@/lib/catalog-pick";
import { SERVICE_LABEL, errorMessage } from "@/lib/labels";
import { priceText } from "@/lib/money-input";
import { shareQuote } from "@/lib/quote-actions";

type Line = { key: string; title: string; detail: string; quantity: string; price: string; catalogItemId: string | null; suggested?: string };

let seq = 0;
const newKey = () => `l${++seq}`;

export default function QuoteEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const editing = useQuery({ queryKey: ["quote", id], queryFn: () => apiGet<{ quote: Quote }>(`/api/admin/quotes/${id}`), enabled: !!id });
  const clients = useQuery({ queryKey: ["clients", "", false], queryFn: () => apiGet<{ clients: Client[] }>("/api/admin/clients?q=&archived=0") });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<{ settings: Settings }>("/api/admin/settings") });

  const [clientId, setClientId] = useState(params.get("cliente") ?? "");
  const [service, setService] = useState<Service>("web");
  const [currency, setCurrency] = useState<Currency>("COP");
  const [lines, setLines] = useState<Line[]>([]);
  const [advance, setAdvance] = useState("50");
  const [notes, setNotes] = useState("");
  const [conditions, setConditions] = useState("");
  const [picking, setPicking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loaded) return;
    const q = editing.data?.quote;
    if (id && q) {
      setClientId(q.clientId);
      setService(q.service);
      setCurrency(q.currency);
      setLines(q.items.map((i) => ({ key: newKey(), title: i.title, detail: i.detail, quantity: String(i.quantity), price: priceText(i.unitPrice, q.currency), catalogItemId: i.catalogItemId })));
      setAdvance(String(q.advancePercent));
      setNotes(q.notes);
      setConditions(q.conditions);
      setLoaded(true);
    } else if (!id && settings.data) {
      setAdvance(String(settings.data.settings.quotes.advancePercent));
      setConditions(settings.data.settings.quotes.conditions);
      setLoaded(true);
    }
  }, [id, editing.data, settings.data, loaded]);

  const parsed = lines.map((l) => ({ ...l, q: Number.parseInt(l.quantity, 10), p: parseMoneyInput(l.price, currency) }));
  const total = parsed.reduce((s, l) => s + (Number.isFinite(l.q) && l.p !== null ? l.q * l.p : 0), 0);
  const advancePct = Number.parseInt(advance, 10);
  const client = clients.data?.clients.find((c) => c.id === clientId);

  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const save = useMutation({
    mutationFn: async (andSend: boolean) => {
      const items = parsed.map((l) => ({ title: l.title, detail: l.detail, quantity: l.q, unitPrice: l.p ?? -1, catalogItemId: l.catalogItemId }));
      const body = { clientId, service, currency, items, notes, conditions, advancePercent: advancePct };
      const { quote } = id ? await apiSend<{ quote: Quote }>("PATCH", `/api/admin/quotes/${id}`, body) : await apiSend<{ quote: Quote }>("POST", "/api/admin/quotes", body);
      if (!andSend) return { quote, shared: null as boolean | null };
      const { quote: sent } = await apiSend<{ quote: Quote }>("POST", `/api/admin/quotes/${quote.id}/send`, {});
      const shared = await shareQuote(sent, client!);
      return { quote: sent, shared };
    },
    onSuccess: ({ quote, shared }) => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["quote", quote.id] });
      if (shared === false) toast.success("Cotización enviada. El cliente no tiene WhatsApp: copiamos el mensaje para que lo pegues.");
      else toast.success(shared ? "Cotización enviada" : "Borrador guardado");
      navigate(`/cotizaciones/${quote.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const submit = (andSend: boolean) => {
    setChecked(true);
    if (parsed.some((l) => l.p === null)) return toast.error("Escribe el valor de cada ítem (0 si es gratis)");
    save.mutate(andSend);
  };

  if (id && editing.data && editing.data.quote.status !== "draft") {
    return <p className="py-10 text-center text-muted-foreground">Esta cotización ya se envió y no se puede editar. Puedes renovarla si venció.</p>;
  }

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver
      </button>
      <p className="sd-eyebrow">Cotizaciones</p>
      <h1 className="sd-title sd-caret text-[2rem] sm:text-5xl">{id ? `Editar ${editing.data?.quote.number ?? ""}` : "Nueva cotización"}</h1>

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-3">
            <Label>Cliente *</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger>
                <SelectValue placeholder="Escoge un cliente" />
              </SelectTrigger>
              <SelectContent>
                {clients.data?.clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.company ? ` · ${c.company}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Servicio</Label>
            <Select value={service} onValueChange={(v) => setService(v as Service)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SERVICE_LABEL) as Service[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {SERVICE_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Moneda</Label>
            <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="COP">COP</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Qué se va a hacer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {lines.map((l, i) => (
            <div key={l.key} className="space-y-2 rounded-xl border p-3">
              <div className="flex items-start gap-2">
                <span className="mt-2 text-sm font-semibold text-muted-foreground">{i + 1}.</span>
                <Input aria-label="Título" placeholder="Título del ítem" value={l.title} onChange={(e) => update(l.key, { title: e.target.value })} />
                <Button variant="ghost" size="icon" aria-label="Quitar ítem" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Textarea aria-label="Detalle" rows={2} maxLength={MAX_DETAIL} placeholder="Detalle: qué incluye, entregables…" value={l.detail} onChange={(e) => update(l.key, { detail: e.target.value })} />
              <div className="grid grid-cols-[5rem_1fr] gap-2">
                <Input aria-label="Cantidad" inputMode="numeric" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} />
                <Input aria-label="Precio" inputMode="decimal" placeholder={l.suggested || "Precio unitario"} aria-invalid={checked && parseMoneyInput(l.price, currency) === null} value={l.price} onChange={(e) => update(l.key, { price: e.target.value })} />
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setPicking(true)}>
              <Plus className="h-4 w-4" /> Del catálogo
            </Button>
            <Button variant="ghost" onClick={() => setLines((ls) => [...ls, { key: newKey(), title: "", detail: "", quantity: "1", price: "", catalogItemId: null }])}>
              <Plus className="h-4 w-4" /> Ítem libre
            </Button>
          </div>
          <div className="space-y-1 border-t pt-3 text-right">
            <p className="text-lg font-bold">Total: {formatMoney(total, currency)}</p>
            {Number.isFinite(advancePct) && advancePct > 0 && (
              <p className="text-sm text-muted-foreground">
                Anticipo ({advancePct}%): {formatMoney(Math.round((total * advancePct) / 100), currency)}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="max-w-[10rem] space-y-1.5">
            <Label htmlFor="adv">Anticipo (%)</Label>
            <Input id="adv" inputMode="numeric" value={advance} onChange={(e) => setAdvance(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notas para el cliente</Label>
            <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cond">Condiciones (una por línea)</Label>
            <Textarea id="cond" rows={6} value={conditions} onChange={(e) => setConditions(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={save.isPending} onClick={() => submit(false)}>
          Guardar borrador
        </Button>
        <Button disabled={save.isPending || !client} onClick={() => submit(true)}>
          Guardar y enviar por WhatsApp
        </Button>
      </div>

      <CatalogPicker
        open={picking}
        onOpenChange={setPicking}
        currency={currency}
        defaultService={service}
        onAdd={(picked) => {
          if (lines.length === 0 && picked[0] && picked[0].service !== "general") setService(picked[0].service);
          setLines((ls) => [...ls, ...picked.map((it) => ({ key: newKey(), ...catalogLine(it) }))]);
        }}
      />
    </div>
  );
}
