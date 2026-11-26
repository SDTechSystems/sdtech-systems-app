import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Copy, ExternalLink, MessageCircle, PackageCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "../../shared/money";
import { fillTemplate } from "../../shared/templates";
import type { Client, PaymentSummary, Project } from "../../shared/types";
import { Pill } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { UploadQueue } from "@/components/UploadQueue";
import { apiSend } from "@/lib/api";
import { driveReady, useGoogleStatus } from "@/lib/google";
import { errorMessage, firstName } from "@/lib/labels";
import { getPortalUrl } from "@/lib/quote-actions";
import { useDriveUploads } from "@/lib/use-drive-uploads";
import { useSettingsQuery } from "@/lib/useSettings";
import { logReminder, openWhatsApp } from "@/lib/whatsapp";

const shortUrl = (url: string) => url.replace(/^https?:\/\//, "");

export function DeliveryCard({ project, client, payments }: { project: Project; client: Pick<Client, "id" | "name" | "phone">; payments: PaymentSummary | undefined }) {
  const qc = useQueryClient();
  const settings = useSettingsQuery();
  const google = useGoogleStatus();
  const drive = driveReady(google.data);
  const picker = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(project.deliveryUrl ?? "");
  // Una subida a Drive cambia el link: el campo muestra el nuevo, salvo que Juan esté escribiendo otro.
  const shownLink = useRef(project.deliveryUrl ?? "");
  useEffect(() => {
    const prev = shownLink.current;
    const next = project.deliveryUrl ?? "";
    shownLink.current = next;
    setUrl((current) => (current === prev ? next : current));
  }, [project.deliveryUrl]);
  const done = (r: { project: Project }) => {
    qc.setQueryData(["project", project.id], (old: object | undefined) => ({ ...(old ?? {}), project: r.project }));
  };
  const uploads = useDriveUploads({ type: "delivery", projectId: project.id }, (p) => (p ? done({ project: p }) : qc.invalidateQueries({ queryKey: ["project", project.id] })));
  const saveUrl = useMutation({
    mutationFn: () => apiSend<{ project: Project }>("PATCH", `/api/admin/projects/${project.id}`, { deliveryUrl: url.trim() || null }),
    onSuccess: (r) => {
      done(r);
      toast.success("Link guardado");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const release = useMutation({
    mutationFn: (value: boolean) => apiSend<{ project: Project }>("POST", `/api/admin/projects/${project.id}/delivery`, { release: value }),
    onSuccess: (r, value) => {
      done(r);
      toast.success(value ? "Entrega liberada: el cliente ya la ve en su página" : "Entrega retirada del portal");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const tryRelease = () => {
    const balance = payments?.balance ?? 0;
    if (balance > 0 && !confirm(`El cliente aún debe ${formatMoney(balance, payments!.currency)}. ¿Liberar la entrega igual?`)) return;
    release.mutate(true);
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(project.deliveryUrl ?? "");
      toast.success("Link copiado");
    } catch {
      toast.error("No pudimos copiar el link");
    }
  };
  const notify = async () => {
    const tab = client.phone ? window.open("about:blank", "_blank") : null;
    const link = await getPortalUrl(client.id);
    const template = settings.data?.settings.templates.delivery ?? "Hola {nombre}, ¡{proyecto} está listo! Ya puedes verlo en tu página: {link}";
    if (!openWhatsApp(client.phone, fillTemplate(template, { nombre: firstName(client.name), proyecto: project.title, link }), tab)) toast.success("El cliente no tiene WhatsApp: copiamos el mensaje.");
    void logReminder("project", project.id, "delivery");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-3 text-base">
          <PackageCheck className="h-4 w-4" /> Entrega
          {project.deliveryReleased ? <Pill tone="green">Liberada</Pill> : <Pill tone="slate">No liberada</Pill>}
        </CardTitle>
        <CardDescription>Sube los archivos finales a Drive o pega un link. El cliente solo lo ve cuando lo liberes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {drive ? (
          <>
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) uploads.add(e.target.files);
                e.target.value = "";
              }}
            />
            <Button onClick={() => picker.current?.click()}>
              <Upload className="h-4 w-4" /> Subir archivos
            </Button>
          </>
        ) : (
          google.data && (
            <p className="text-sm text-muted-foreground">
              {google.data.status === "disconnected" ? "Conecta Google para usar Drive." : "Reconecta Google para usar Drive."}{" "}
              <Link to="/ajustes" className="text-[var(--sd-cyan)] underline-offset-4 hover:underline">
                Ir a Ajustes
              </Link>
            </p>
          )
        )}
        <UploadQueue items={uploads.items} onRetry={uploads.retry} />
        {drive && <p className="text-xs text-muted-foreground">o pega un link (Canva, WeTransfer…):</p>}
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            saveUrl.mutate();
          }}
        >
          <Input type="url" inputMode="url" placeholder="https://drive.google.com/…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button type="submit" variant="outline" disabled={saveUrl.isPending || url.trim() === (project.deliveryUrl ?? "")}>
            Guardar link
          </Button>
        </form>
        {project.deliveryUrl && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="text-muted-foreground">Link de entrega:</span>
            <span className="min-w-0 flex-1 basis-40 truncate" title={project.deliveryUrl}>
              {shortUrl(project.deliveryUrl)}
            </span>
            <span className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={copyLink}>
                <Copy className="h-4 w-4" /> Copiar
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <a href={project.deliveryUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" /> Abrir
                </a>
              </Button>
            </span>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {project.deliveryReleased ? (
            <>
              <Button variant="whatsapp" onClick={notify}>
                <MessageCircle className="h-4 w-4" /> Avisar por WhatsApp
              </Button>
              <Button variant="ghost" onClick={() => release.mutate(false)}>
                Retirar del portal
              </Button>
            </>
          ) : (
            <Button disabled={!project.deliveryUrl || release.isPending} onClick={tryRelease}>
              Liberar al cliente
            </Button>
          )}
        </div>
        {payments && payments.balance <= 0 && !project.deliveryReleased && project.deliveryUrl && <p className="text-xs text-emerald-400">El saldo está en cero: ya puedes liberar la entrega.</p>}
      </CardContent>
    </Card>
  );
}
