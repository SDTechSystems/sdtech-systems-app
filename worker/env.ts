export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Correo del dueño (Juan). Secreto del Worker. */
  OWNER_EMAIL?: string;
  /** <equipo>.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN?: string;
  /** Application Audience (AUD) tag de la aplicación de Access. */
  ACCESS_AUD?: string;
  /** Solo en desarrollo (.dev.vars): entra como este correo sin Access. */
  DEV_AUTH_EMAIL?: string;
  /** Límite de peticiones del portal (binding ratelimits). No existe en pruebas. */
  PORTAL_LIMIT?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}
