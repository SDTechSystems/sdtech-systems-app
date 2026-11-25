import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatMoney, parseMoneyInput } from "../../shared/money";
import type { Billing, CatalogItem, Currency, Service } from "../../shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiSend } from "@/lib/api";
import { BILLING_LABEL, SERVICE_LABEL, errorMessage } from "@/lib/labels";

const priceText = (amount: number, currency: Currency) => formatMoney(amount, currency).replace(/^US\$ |^\$ /, "");

export function CatalogItemForm({ item, onDone }: { item?: CatalogItem; onDone: () => void }) {
  const qc = useQueryClient();
  const [service, setService] = useState<Service>(item?.service ?? "web");
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [currency, setCurrency] = useState<Currency>(item?.currency ?? "COP");
  const [price, setPrice] = useState(item ? priceText(item.price, item.currency) : "");
  const [billing, setBilling] = useState<Billing>(item?.billing ?? "unico");
  const [priceFrom, setPriceFrom] = useState(item?.priceFrom ?? false);

  const save = useMutation({
    mutationFn: () => {
      const amount = parseMoneyInput(price, currency);
      const body = { service, name, description, currency, price: amount ?? -1, billing, priceFrom };
      return item ? apiSend("PATCH", `/api/admin/catalog/${item.id}`, body) : apiSend("POST", "/api/admin/catalog", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalog"] });
      toast.success("Guardado");
      onDone();
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
      <div className="space-y-1.5">
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
        <Label htmlFor="name">Nombre *</Label>
        <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">Qué incluye</Label>
        <Textarea id="description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="price">Precio *</Label>
          <Input id="price" inputMode="decimal" required placeholder="650.000" value={price} onChange={(e) => setPrice(e.target.value)} />
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
      </div>
      <div className="space-y-1.5">
        <Label>Cobro</Label>
        <Select value={billing} onValueChange={(v) => setBilling(v as Billing)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(BILLING_LABEL) as Billing[]).map((b) => (
              <SelectItem key={b} value={b}>
                {BILLING_LABEL[b]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Switch id="from" checked={priceFrom} onCheckedChange={setPriceFrom} />
        <Label htmlFor="from">Mostrar como «desde» (precio mínimo)</Label>
      </div>
      <Button type="submit" className="w-full" disabled={save.isPending}>
        {save.isPending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}
