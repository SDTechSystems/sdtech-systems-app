import { useState } from "react";
import { FileText, FolderKanban, Home, MoreHorizontal, Package, Settings, Users } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useMe } from "@/lib/session";

const NAV = [
  { to: "/", label: "Inicio", icon: Home, owner: false, mobile: true },
  { to: "/clientes", label: "Clientes", icon: Users, owner: false, mobile: true },
  { to: "/cotizaciones", label: "Cotizaciones", icon: FileText, owner: true, mobile: true },
  { to: "/proyectos", label: "Proyectos", icon: FolderKanban, owner: false, mobile: true },
  { to: "/catalogo", label: "Catálogo", icon: Package, owner: true, mobile: false },
  { to: "/ajustes", label: "Ajustes", icon: Settings, owner: true, mobile: false },
];

export function AppLayout() {
  const { data: me } = useMe();
  const { pathname } = useLocation();
  const [more, setMore] = useState(false);
  const items = NAV.filter((n) => !n.owner || me?.role === "owner");
  const mobileMain = items.filter((n) => n.mobile);
  const mobileMore = items.filter((n) => !n.mobile);
  const moreActive = mobileMore.some((n) => pathname.startsWith(n.to));

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 bg-[var(--sd-ink)] text-[var(--sd-white)]">
        <div className="px-5 py-6">
          <img src="/brand/logo-white.svg" alt="SD Tech Systems" className="w-44" />
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive ? "bg-[var(--sd-navy)] text-[var(--sd-cyan)]" : "text-[var(--sd-muted)] hover:bg-white/5 hover:text-white",
                )
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </nav>
        {me && <p className="px-5 py-4 text-xs text-[var(--sd-muted)] truncate">{me.email}</p>}
      </aside>

      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between bg-[var(--sd-ink)] px-4 py-3">
        <img src="/brand/logo-white.svg" alt="SD Tech Systems" className="h-8" />
      </header>

      <main className="flex-1 md:ml-60 pb-24 md:pb-8">
        <div className="mx-auto max-w-5xl px-4 py-5 md:px-8 md:py-8">
          <Outlet />
        </div>
      </main>

      {more && (
        <div className="md:hidden fixed inset-0 z-30" onClick={() => setMore(false)}>
          <div className="absolute bottom-16 right-3 w-48 rounded-xl border bg-card p-1 shadow-lg">
            {mobileMore.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted">
                <Icon className="h-4 w-4" /> {label}
              </NavLink>
            ))}
          </div>
        </div>
      )}

      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 grid border-t bg-card"
        style={{ gridTemplateColumns: `repeat(${mobileMain.length + (mobileMore.length ? 1 : 0)}, 1fr)` }}
      >
        {mobileMain.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            onClick={() => setMore(false)}
            className={({ isActive }) => cn("flex flex-col items-center gap-1 py-2.5 text-[11px]", isActive ? "text-primary font-semibold" : "text-muted-foreground")}
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
        {mobileMore.length > 0 && (
          <button
            onClick={() => setMore(!more)}
            className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px]", moreActive ? "text-primary font-semibold" : "text-muted-foreground")}
          >
            <MoreHorizontal className="h-5 w-5" />
            Más
          </button>
        )}
      </nav>
    </div>
  );
}
