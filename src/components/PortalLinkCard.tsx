import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Link2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet, apiSend } from "@/lib/api";
import { errorMessage } from "@/lib/labels";

export function PortalLinkCard({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const key = ["portal-link", clientId];
  const { data } = useQuery({ queryKey: key, queryFn: () => apiGet<{ url: string | null }>(`/api/admin/clients/${clientId}/portal-link`) });
  const create = useMutation({
    mutationFn: (regenerate: boolean) => apiSend<{ url: string }>("POST", `/api/admin/clients/${clientId}/portal-link`, { regenerate }),
    onSuccess: (r, regenerate) => {
      qc.setQueryData(key, r);
      toast.success(regenerate ? "Link nuevo creado. El anterior ya no funciona." : "Link creado");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const url = data?.url;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="h-4 w-4" /> Página de seguimiento
        </CardTitle>
        <CardDescription>El cliente ve aquí sus cotizaciones, las aprueba y sigue el avance. El link es privado.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {url ? (
          <>
            <p className="break-all rounded-lg bg-muted px-3 py-2 font-mono text-xs">{url}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigator.clipboard.writeText(url).then(() => toast.success("Link copiado"))}
              >
                <Copy className="h-4 w-4" /> Copiar
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" /> Ver como cliente
                </a>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => confirm("¿Crear un link nuevo? El actual dejará de funcionar.") && create.mutate(true)}
              >
                <RefreshCw className="h-4 w-4" /> Cambiar link
              </Button>
            </div>
          </>
        ) : (
          <Button onClick={() => create.mutate(false)} disabled={create.isPending}>
            Crear link
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
