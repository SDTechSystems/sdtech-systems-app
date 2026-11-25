import { useState } from "react";
import { FileText, FolderKanban, Home, MoreHorizontal, Package, Repeat, Settings, Users } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useMe } from "@/lib/session";

const NAV = [
  { to: "/", label: "Inicio", icon: Home, owner: false, mobile: true },
  { to: "/clientes", label: "Clientes", icon: Users, owner: false, mobile: true },
  { to: "/cotizaciones", label: "Cotizaciones", icon: FileText, owner: true, mobile: true },
  { to: "/proyectos", label: "Proyectos", icon: FolderKanban, owner: false, mobile: true },
  { to: "/suscripciones", label: "Suscripciones", icon: Repeat, owner: true, mobile: false },
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
      <aside className="hidden md:fixed md:inset-y-0 md:flex md:w-64 md:flex-col md:border-r md:border-[var(--sd-line)] bg-[var(--sd-ink)]">
        <div className="px-6 pb-8 pt-7">
          <img src="/brand/logo-white.svg" alt="SD Tech Systems" className="w-44" />
          <p className="sd-mono mt-3 text-[10px] tracking-widest text-[var(--sd-muted)]">PANEL · CLIENTES Y PROYECTOS</p>
        </div>
        <nav className="flex-1 space-y-1 px-4">
          {items.map(({ to, label, icon: Icon }, i) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "group flex items-center gap-3 rounded-full border px-4 py-2.5 text-sm transition-colors",
                  isActive ? "border-[#3a5f95] bg-[var(--sd-navy)] text-[var(--sd-white)]" : "border-transparent text-[var(--sd-muted)] hover:text-[var(--sd-cyan)]",
                )
              }
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{label}</span>
              <span className="sd-mono text-[10px] text-[var(--sd-muted)] group-[.active]:text-[var(--sd-cyan)]">{String(i + 1).padStart(2, "0")}</span>
            </NavLink>
          ))}
        </nav>
        {me && (
          <div className="border-t border-[var(--sd-line)] px-6 py-4">
            <p className="sd-mono text-[10px] tracking-widest text-[var(--sd-muted)]">{me.role === "owner" ? "DUEÑO" : "COLABORADOR"}</p>
            <p className="truncate text-xs text-[var(--sd-white)]">{me.email}</p>
          </div>
        )}
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--sd-line)] bg-[var(--sd-ink)]/95 px-4 py-3 backdrop-blur md:hidden">
        <img src="/brand/logo-white.svg" alt="SD Tech Systems" className="h-8" />
      </header>

      <main className="flex-1 pb-24 md:ml-64 md:pb-10">
        <div key={pathname} className="sd-arrive mx-auto max-w-5xl px-4 py-6 md:px-10 md:py-10">
          <Outlet />
        </div>
      </main>

      {more && (
        <div className="fixed inset-0 z-30 md:hidden" onClick={() => setMore(false)}>
          <div className="sd-arrive absolute bottom-20 right-3 w-52 rounded-2xl border border-[#2f4664] bg-[#0a1729f2] p-1.5 shadow-2xl backdrop-blur">
            {mobileMore.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-[#12294a]">
                <Icon className="h-4 w-4 text-[var(--sd-cyan)]" /> {label}
              </NavLink>
            ))}
          </div>
        </div>
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid border-t border-[var(--sd-line)] bg-[var(--sd-ink)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        style={{ gridTemplateColumns: `repeat(${mobileMain.length + (mobileMore.length ? 1 : 0)}, 1fr)` }}
      >
        {mobileMain.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            onClick={() => setMore(false)}
            className={({ isActive }) => cn("flex flex-col items-center gap-1 py-2.5 text-[11px]", isActive ? "font-semibold text-[var(--sd-cyan)]" : "text-[var(--sd-muted)]")}
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
        {mobileMore.length > 0 && (
          <button
            onClick={() => setMore(!more)}
            className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px]", moreActive ? "font-semibold text-[var(--sd-cyan)]" : "text-[var(--sd-muted)]")}
          >
            <MoreHorizontal className="h-5 w-5" />
            Más
          </button>
        )}
      </nav>
    </div>
  );
}
