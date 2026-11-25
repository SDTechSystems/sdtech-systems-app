import { Home, Package, Settings, Users } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useMe } from "@/lib/session";

const NAV = [
  { to: "/", label: "Inicio", icon: Home, owner: false },
  { to: "/clientes", label: "Clientes", icon: Users, owner: false },
  { to: "/catalogo", label: "Catálogo", icon: Package, owner: true },
  { to: "/ajustes", label: "Ajustes", icon: Settings, owner: true },
];

export function AppLayout() {
  const { data: me } = useMe();
  const items = NAV.filter((n) => !n.owner || me?.role === "owner");

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

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 grid border-t bg-card" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) => cn("flex flex-col items-center gap-1 py-2.5 text-xs", isActive ? "text-primary font-semibold" : "text-muted-foreground")}
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
