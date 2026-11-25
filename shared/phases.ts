import type { Service } from "./types";

/** Fases por servicio (diseño § 6.5). Juan las edita en Ajustes. */
export const DEFAULT_PHASE_TEMPLATES: Record<Service, string[]> = {
  web: ["Diagnóstico", "Cotización", "Contenido", "Maqueta", "Construcción", "Revisión", "Publicación", "Entrega"],
  marca: ["Brief", "Borrador (propuestas)", "Elección", "Ediciones y retoques", "Versión final", "Entrega"],
  software: ["Diagnóstico", "Requerimientos", "Propuesta", "Desarrollo", "Pruebas", "Entrega", "Soporte"],
  general: ["Inicio", "Desarrollo", "Entrega"],
};

/** Fase de marca donde se cuelgan las rondas de cambios. */
export const BRAND_ROUNDS_PHASE = "Ediciones y retoques";
