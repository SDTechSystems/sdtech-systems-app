import type { Billing, Service } from "../../shared/types";

export interface SeedItem {
  id: string;
  service: Service;
  name: string;
  description: string;
  price: number;
  billing: Billing;
  priceFrom: boolean;
}

/** Catálogo inicial (diseño § 9). Precios en pesos colombianos; Juan los edita en el panel. */
export const CATALOG_SEED: SeedItem[] = [
  { id: "seed-asesoria", service: "general", name: "Asesoría y diagnóstico", description: "Conversación inicial para entender el negocio y recomendar la mejor solución.", price: 0, billing: "unico", priceFrom: false },
  { id: "seed-landing", service: "web", name: "Landing page", description: "1 página, hasta 6 secciones, botón de WhatsApp, redes, mapa, adaptada a celular, SEO básico y publicación.", price: 650000, billing: "unico", priceFrom: false },
  { id: "seed-sitio", service: "web", name: "Sitio informativo", description: "Hasta 5 páginas, con formulario de contacto y galería.", price: 1200000, billing: "unico", priceFrom: false },
  { id: "seed-catalogo", service: "web", name: "Catálogo con pedido por WhatsApp", description: "Sitio informativo con catálogo de hasta 30 productos y botón de pedido por WhatsApp.", price: 1500000, billing: "unico", priceFrom: false },
  { id: "seed-tienda", service: "web", name: "Tienda en línea", description: "Configuración de la tienda, 30 productos cargados, pasarela de pagos del cliente y capacitación de 1 hora.", price: 2200000, billing: "unico", priceFrom: true },
  { id: "seed-pagina-extra", service: "web", name: "Página adicional", description: "Una página más dentro del sitio.", price: 120000, billing: "unico", priceFrom: false },
  { id: "seed-mant-web", service: "web", name: "Mantenimiento web", description: "Cambios menores, copias de seguridad y actualizaciones.", price: 80000, billing: "mensual", priceFrom: false },
  { id: "seed-hosting", service: "web", name: "Gestión de hosting y dominio", description: "Administración del hosting y el dominio (más el costo del proveedor)", price: 25000, billing: "mensual", priceFrom: false },
  { id: "seed-kit-marca", service: "marca", name: "Kit de marca estándar", description: "2 propuestas de logo, logo y versiones, paleta, tipografías, mini guía de marca, 3 stickers, 2 banners e imagen de perfil.", price: 450000, billing: "unico", priceFrom: false },
  { id: "seed-ronda", service: "marca", name: "Ronda de ajustes adicional", description: "Una ronda más de cambios sobre la propuesta elegida.", price: 40000, billing: "unico", priceFrom: false },
  { id: "seed-sheets", service: "software", name: "Herramienta en Google Sheets", description: "Hoja de cálculo estructurada con automatizaciones.", price: 500000, billing: "unico", priceFrom: false },
  { id: "seed-app-fase1", service: "software", name: "Aplicación a medida · Fase 1 (MVP)", description: "Funciones esenciales, usuarios y roles, copias de seguridad, despliegue y manual de uso.", price: 2500000, billing: "unico", priceFrom: true },
  { id: "seed-soporte", service: "software", name: "Soporte y mantenimiento de software", description: "Soporte y ajustes menores del software entregado.", price: 120000, billing: "mensual", priceFrom: false },
  { id: "seed-capacitacion", service: "general", name: "Capacitación adicional (por hora)", description: "Hora adicional de capacitación.", price: 50000, billing: "unico", priceFrom: false },
];
