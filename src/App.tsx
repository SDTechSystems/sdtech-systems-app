import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Toaster } from "@/components/ui/sonner";
import { ApiError } from "@/lib/api";
import { useMe } from "@/lib/session";
import Catalog from "@/pages/Catalog";
import ClientDetail from "@/pages/ClientDetail";
import Clients from "@/pages/Clients";
import Home from "@/pages/Home";
import NoAccess from "@/pages/NoAccess";
import ProjectDetail from "@/pages/ProjectDetail";
import Projects from "@/pages/Projects";
import QuoteDetail from "@/pages/QuoteDetail";
import QuoteEditor from "@/pages/QuoteEditor";
import Quotes from "@/pages/Quotes";
import Settings from "@/pages/Settings";
import Subscriptions from "@/pages/Subscriptions";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: (count, e) => !(e instanceof ApiError && e.status < 500) && count < 2, refetchOnWindowFocus: true },
  },
});

function OwnerOnly({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  if (isLoading) return null;
  return me?.role === "owner" ? <>{children}</> : <NoAccess />;
}

function Gate({ children }: { children: ReactNode }) {
  const { error, isLoading } = useMe();
  if (isLoading) return <div className="min-h-screen bg-[var(--sd-ink)]" />;
  const message =
    error instanceof ApiError
      ? ({
          not_allowed: "Tu correo no tiene acceso a este panel.",
          unauthenticated: "No se pudo confirmar tu sesión. Cierra y vuelve a abrir el panel; si sigue igual, revisa ACCESS_AUD y ACCESS_TEAM_DOMAIN en Cloudflare.",
          access_not_configured: "El panel todavía no está configurado: faltan los secretos de Cloudflare Access (ver README).",
        } as Record<string, string>)[error.code]
      : undefined;
  if (message)
    return (
      <div className="min-h-screen grid place-items-center bg-[var(--sd-ink)] p-6 text-center text-[var(--sd-white)]">
        <div className="max-w-md space-y-4">
          <img src="/brand/logo-white.svg" alt="SD Tech Systems" className="mx-auto w-56" />
          <p>{message}</p>
        </div>
      </div>
    );
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Gate>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<Home />} />
              <Route path="clientes" element={<Clients />} />
              <Route path="clientes/:id" element={<ClientDetail />} />
              <Route path="cotizaciones" element={<OwnerOnly><Quotes /></OwnerOnly>} />
              <Route path="cotizaciones/nueva" element={<OwnerOnly><QuoteEditor /></OwnerOnly>} />
              <Route path="cotizaciones/:id" element={<OwnerOnly><QuoteDetail /></OwnerOnly>} />
              <Route path="cotizaciones/:id/editar" element={<OwnerOnly><QuoteEditor /></OwnerOnly>} />
              <Route path="proyectos" element={<Projects />} />
              <Route path="proyectos/:id" element={<ProjectDetail />} />
              <Route path="suscripciones" element={<OwnerOnly><Subscriptions /></OwnerOnly>} />
              <Route path="catalogo" element={<OwnerOnly><Catalog /></OwnerOnly>} />
              <Route path="ajustes" element={<OwnerOnly><Settings /></OwnerOnly>} />
              <Route path="*" element={<Home />} />
            </Route>
          </Routes>
        </Gate>
      </BrowserRouter>
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
