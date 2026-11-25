import type { ReactNode } from "react";

/** Encabezado con el estilo del portafolio: etiqueta ">_ SECCIÓN", título grande y cursor "_". */
export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow: string; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-1">
      <div className="min-w-0 space-y-3">
        <p className="sd-eyebrow">{eyebrow}</p>
        <h1 className="sd-title sd-caret text-[2rem] sm:text-5xl">{title}</h1>
        {subtitle && <div className="text-sm leading-relaxed text-muted-foreground">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
