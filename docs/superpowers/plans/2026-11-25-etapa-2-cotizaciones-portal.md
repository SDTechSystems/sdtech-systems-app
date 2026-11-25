# Etapa 2 · Cotizaciones, portal del cliente y proyectos con fases — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Juan arma cotizaciones con ítems discriminados, se las manda al cliente por WhatsApp con el link a su portal, el cliente las ve con logo, llave Bre-B y QR, y las aprueba con su nombre y un comentario; al aprobarse se crea el proyecto con las fases de su servicio, que Juan avanza y el cliente ve.

**Architecture:** Sigue la etapa 1: un Worker con API `/api/admin/*` (panel, tras Access) y ahora también páginas y API públicas en `clientes.sdtechsystems.dev` autenticadas solo por el token del link. El documento de la cotización lo renderiza el Worker (HTML imprimible), así el mismo documento sirve al cliente y a Juan. Ajustes del negocio en la tabla `settings`.

**Tech Stack:** el de la etapa 1, más `qrcode-generator` (QR en SVG, JS puro) en el Worker.

**Spec:** `docs/superpowers/specs/2026-11-25-sdtech-systems-app-design.md` — § 6.4, § 6.5, § 6.12 (lo que toca a cotizaciones y fases), § 6.13 (empresa, pagos, cotizaciones, plantillas de fases), § 7, § 11 etapa 2.

## Global Constraints

- Todo lo de la etapa 1 sigue vigente: montos enteros (COP pesos, USD centavos), America/Bogota, roles, `activity_log` en cada mutación y `readJson` (415) en cada mutación del panel.
- **Datos de pago en la cotización:** solo «Llave Bre-B 3058147293 · Davibank», tomada de `settings.payment.brebKey` y `settings.payment.bank`.
- **Vigencia:** `settings.quotes.validityDays` (30). El anticipo por defecto es `settings.quotes.advancePercent` (50).
- **Numeración:** `COT-0001`, `COT-0002`… consecutivo atómico.
- **Fechas:** las de calendario se guardan `YYYY-MM-DD` en hora de Bogotá; los instantes, en ISO.
- **Cotizaciones solo para owner.** El colaborador ve proyectos y fases, pero no montos (`total`, `currency` y `advancePercent` van como `null`).
- **Portal:**
  - token de 32 bytes aleatorios en base64url;
  - headers `noindex` y `no-referrer`;
  - token desconocido o revocado → la misma página 404 («Este enlace no es válido»);
  - límite de 60 peticiones por minuto por IP;
  - nunca muestra notas internas.
- **Condiciones por defecto:** las 6 del § 7 del diseño, una por línea.

## Review Focus

1. **Aprobar una cotización vencida o ya aprobada** desde el portal (doble clic, pestaña vieja): responde 409 sin crear un segundo proyecto. Prueba en Task 4.
2. **Vencimiento en el borde del día:** una cotización con `validUntil = hoy` (Bogotá) todavía se puede aprobar; al día siguiente aparece `expired`. Calcular con la fecha de Bogotá, no la UTC (a las 8 p. m. de Bogotá ya es mañana en UTC). Prueba en Task 2.
3. **Token de otro cliente:** con el token de A no se puede aprobar ni ver la cotización de B (404). Prueba en Task 4.
4. **Texto del cliente con HTML** (`<script>` en el comentario o en el nombre) se muestra escapado en el portal y el panel. Prueba en Task 4.
5. **Colaborador** pidiendo `/api/admin/projects/:id` no recibe montos. Prueba en Task 3.

---

## Estructura de archivos

```
shared/dates.ts            todayBogota(), addDays(), isExpired()
shared/types.ts            + Quote, QuoteItem, QuoteStatus, Project, Phase, Settings
shared/phases.ts           DEFAULT_PHASE_TEMPLATES
worker/db/migrations.ts    + 0002_quotes_projects
worker/settings.ts         getSettings(db), DEFAULT_SETTINGS, nextNumber(db, key)
worker/api/settings.ts     GET/PATCH /api/admin/settings
worker/api/quotes.ts       /api/admin/quotes…
worker/quotes/approve.ts   approveQuote(db, quoteId, by) → crea proyecto + fases (compartido panel/portal)
worker/api/projects.ts     /api/admin/projects…, /api/admin/phases/:id
worker/api/portal-links.ts /api/admin/clients/:id/portal-link
worker/portal/tokens.ts    newToken(), findClientByToken()
worker/portal/page.ts      renderPortal(data) HTML
worker/portal/quote-doc.ts renderQuoteDocument(data) HTML imprimible
worker/portal/api.ts       POST /api/portal/:token/quotes/:id/{approve,reject}
worker/portal/html.ts      esc(), layout(), qrSvg()
src/pages/Quotes.tsx, QuoteEditor.tsx, QuoteDetail.tsx, Projects.tsx, ProjectDetail.tsx
src/components/PortalLinkCard.tsx, SettingsBusiness.tsx, PhaseTemplatesCard.tsx
```

---

### Task 1: Ajustes del negocio y consecutivos

**Files:**
- Create: `worker/settings.ts`, `worker/api/settings.ts`
- Modify: `worker/db/migrations.ts` (migración `0002_quotes_projects`, con todas las tablas de la etapa), `shared/types.ts`, `shared/phases.ts`, `worker/index.ts`
- Test: `test/settings.test.ts`

**Interfaces:**
- Produces:
  - `interface Settings { company: { name: string; phone: string; email: string; website: string }; payment: { brebKey: string; bank: string; usdText: string }; quotes: { validityDays: number; advancePercent: number; conditions: string }; phaseTemplates: Record<Service, string[]> }`
  - `DEFAULT_SETTINGS: Settings`, con:
    - `company`: `{ name: 'SD Tech Systems', phone: '+57 305 814 7293', email: 'contacto@sdtechsystems.dev', website: 'sdtechsystems.dev' }`;
    - `payment`: `{ brebKey: '3058147293', bank: 'Davibank', usdText: '' }`;
    - `quotes`: `{ validityDays: 30, advancePercent: 50, conditions: <6 líneas del § 7> }`;
    - `phaseTemplates`: `DEFAULT_PHASE_TEMPLATES`.
  - `getSettings(db): Promise<Settings>`: une lo guardado en `settings` (clave `app`, JSON) sobre los valores por defecto.
  - `nextNumber(db, counter: 'quote' | 'invoice'): Promise<number>`: usa `UPDATE … SET value = value + 1 … RETURNING`, con la fila sembrada en la migración.
  - `DEFAULT_PHASE_TEMPLATES`:
    - `web`: Diagnóstico, Cotización, Contenido, Maqueta, Construcción, Revisión, Publicación, Entrega.
    - `marca`: Brief, Borrador (propuestas), Elección, Ediciones y retoques, Versión final, Entrega.
    - `software`: Diagnóstico, Requerimientos, Propuesta, Desarrollo, Pruebas, Entrega, Soporte.
    - `general`: Inicio, Desarrollo, Entrega.
  - Rutas:
    - `GET /api/admin/settings` → `{ settings }`, solo owner.
    - `PATCH /api/admin/settings` → `{ settings }`. Mezcla por sección.
    - Validación: `validityDays` entre 1 y 365; `advancePercent` entre 0 y 100; cada plantilla con al menos 1 fase. Si no → 400 `invalid_settings`.
  - Migración `0002_quotes_projects`:
    - `counters(name PK, value INTEGER)`, con `quote = 0` e `invoice = 0`;
    - `quotes`, `quote_items`, `projects`, `phases` y `portal_tokens`, con las columnas de los tipos de las Tasks 2–4.

- [ ] **Step 1: Escribir las pruebas que fallan.**
  - `getSettings` en una base nueva devuelve `DEFAULT_SETTINGS`, con `payment.brebKey === '3058147293'` y 6 líneas en `quotes.conditions`.
  - `PATCH { quotes: { advancePercent: 40 } }` cambia solo eso y conserva `validityDays: 30`.
  - `advancePercent: 120` → 400 `invalid_settings`.
  - El colaborador → 403.
  - `nextNumber(db, 'quote')` dos veces → `1` y `2`.
  - Dos llamadas en paralelo dan números distintos.

- [ ] **Step 2: Correr la prueba y verla fallar. Implementar. Correr `npm test`.** Esperado: PASS.

- [ ] **Step 3: Commit** `feat: business settings, phase templates and numbering counters`

---

### Task 2: API de cotizaciones

**Files:**
- Create: `shared/dates.ts`, `worker/api/quotes.ts`, `worker/quotes/approve.ts`
- Test: `test/dates.test.ts`, `test/quotes.test.ts`

**Interfaces:**
- Consumes: `getSettings` y `nextNumber` (Task 1).
- Produces:
  - `todayBogota(now = new Date()): string` (`YYYY-MM-DD`), `addDays(date: string, n: number): string`, `isExpired(validUntil: string, today: string): boolean` (`today > validUntil`).
  - `type QuoteStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'expired'`. `expired` se deriva al leer, a partir de `sent` y la fecha; no se guarda.
  - `interface QuoteItem { id; title: string; detail: string; quantity: number; unitPrice: number; catalogItemId: string | null }`
  - `interface Quote { id; number: string /* COT-0001 */; clientId; clientName: string; service: Service; currency: Currency; status: QuoteStatus; items: QuoteItem[]; total: number; advancePercent: number; advanceAmount: number; notes: string; conditions: string; issuedAt: string | null; validUntil: string | null; approvedAt: string | null; approvedBy: 'owner' | 'client' | null; approvedName: string | null; clientComment: string | null; projectId: string | null; createdAt: string }`
  - `total = Σ quantity × unitPrice`. `advanceAmount = Math.round(total × advancePercent / 100)`.
  - Rutas (solo owner):
    - `GET /api/admin/quotes?clientId=&status=` → `{ quotes }`, más nuevas primero.
    - `POST /api/admin/quotes` `{ clientId, service, currency?, items, notes?, conditions?, advancePercent? }` → 201 en `draft`.
      - `conditions` y `advancePercent` por defecto desde ajustes.
      - Ítems: `title` obligatorio, `quantity` entero ≥ 1, `unitPrice` entero ≥ 0. Si no → 400 `invalid_items`.
      - Lista vacía → 400 `items_required`. Cliente inexistente → 400 `invalid_client`.
    - `GET /api/admin/quotes/:id` → `{ quote, activity }`.
    - `PATCH /api/admin/quotes/:id`: solo en `draft` (si no → 409 `not_editable`). `items` reemplaza la lista completa.
    - `POST /api/admin/quotes/:id/send` → `status = 'sent'`, `issuedAt = now`, `validUntil = addDays(todayBogota(), validityDays)`. Solo desde `draft`.
    - `POST /api/admin/quotes/:id/approve` `{ note? }` → `approveQuote(db, id, { by: 'owner', actor: session.email, note })`.
    - `POST /api/admin/quotes/:id/reject` `{ note? }` → `rejected`. Solo desde `sent`.
    - `POST /api/admin/quotes/:id/renew` → 201 con una copia nueva en `draft`, con número nuevo. Los ítems con `catalogItemId` toman el precio actual del catálogo. Solo desde `expired` o `rejected`.
  - `approveQuote(db, quoteId, { by: 'owner' | 'client', actor: string, name?: string, comment?: string, note?: string, today?: string }): Promise<{ quote: Quote; projectId: string } | Response>`
    - Solo desde `sent` y no vencida; si no → 409 `not_approvable`.
    - En un solo `batch`:
      - actualiza la cotización con un `UPDATE … WHERE status = 'sent'`. Si `changes = 0`, otra aprobación ganó y responde 409;
      - crea el proyecto (`title` = primer ítem o el nombre del servicio, `total`, `currency`, `advancePercent`, `startDate` = hoy);
      - crea las fases de `phaseTemplates[service]`. Para web y software, «Diagnóstico» y «Cotización» o «Propuesta» quedan `done`; la siguiente, `in_progress`;
      - escribe en `activity_log`. El `actor` es el correo, o `cliente (portal)` si aprueba el cliente.
    - Guarda `approval_snapshot`: JSON con los ítems, el total y la moneda tal como se aprobaron.

- [ ] **Step 1: Escribir las pruebas que fallan.**
  - **`dates`:**
    - `todayBogota(new Date('2026-11-26T01:30:00Z')) === '2026-11-25'`;
    - `addDays('2026-11-25', 30) === '2026-12-25'`;
    - `isExpired('2026-12-25', '2026-12-25') === false` e `isExpired('2026-12-25', '2026-12-26') === true`.
  - **`quotes`:**
    - crear con 2 ítems (650000 × 1 y 120000 × 2) → `total 890000`, `advanceAmount 445000`, `number 'COT-0001'` y luego `'COT-0002'`;
    - `items: []` → 400 `items_required`;
    - `quantity: 0` → 400 `invalid_items`;
    - el colaborador → 403;
    - `PATCH` sobre una enviada → 409;
    - `send` fija `validUntil` a hoy + 30;
    - `approve` crea exactamente 1 proyecto con 8 fases (web), las 2 primeras `done` y la tercera `in_progress`;
    - un segundo `approve` → 409 y sigue habiendo 1 proyecto;
    - aprobar con la fecha de hoy pasada (`today` inyectado = `validUntil + 1`) → 409;
    - `renew` de una vencida usa el precio actual del catálogo.

- [ ] **Step 2: Verla fallar, implementar y correr `npm test`.** Esperado: PASS.

- [ ] **Step 3: Commit** `feat: quotes API with sending, expiry, approval into projects and renewal`

---

### Task 3: API de proyectos y fases

**Files:**
- Create: `worker/api/projects.ts`
- Test: `test/projects.test.ts`

**Interfaces:**
- Produces:
  - `interface Phase { id; projectId; parentId: string | null; position: number; name: string; status: 'pending' | 'in_progress' | 'done'; dueDate: string | null; clientNote: string | null; doneAt: string | null }`
  - `interface Project { id; clientId; clientName: string; quoteId: string | null; service: Service; title: string; description: string; status: 'active' | 'paused' | 'delivered' | 'cancelled'; startDate: string | null; dueDate: string | null; total: number | null; currency: Currency | null; advancePercent: number | null; progress: number /* 0–100 */; phases: Phase[]; createdAt: string }`
  - `progress = round(100 × fases hechas / fases totales)`. Cuentan solo las fases de primer nivel; las rondas (fases con `parentId`) no.
  - Rutas (owner y colaborador; montos en `null` para el colaborador):
    - `GET /api/admin/projects?clientId=&status=` → `{ projects }`. Por defecto, los activos y en pausa, ordenados por `dueDate` (nulos al final).
    - `POST /api/admin/projects` `{ clientId, service, title, description?, dueDate?, total?, currency? }`: proyecto manual con fases de plantilla, todas `pending` y la primera `in_progress`. Solo el owner puede mandar `total`.
    - `GET /api/admin/projects/:id` → `{ project, activity }`.
    - `PATCH /api/admin/projects/:id`: `title`, `description`, `status`, `dueDate`. `total` solo el owner.
    - `POST /api/admin/projects/:id/phases` `{ name?, parentId? }`.
      - Con `parentId` agrega una ronda; si falta `name`, se llama «Ronda N», con N = rondas existentes + 1.
      - Sin `parentId`, la fase va al final.
    - `PATCH /api/admin/phases/:id` `{ status?, dueDate?, clientNote?, name? }`.
      - Pasar a `done` fija `doneAt`.
      - Si la fase era `in_progress` y queda `done`, la siguiente fase `pending` de primer nivel pasa a `in_progress`.
    - `DELETE /api/admin/phases/:id`: solo rondas (con `parentId`) y solo el owner.
  - Fechas `dueDate` con formato `YYYY-MM-DD`; si no → 400 `invalid_date`.

- [ ] **Step 1: Escribir las pruebas que fallan.**
  - un proyecto manual de `marca` tiene 6 fases y `progress 0`;
  - agregar dos rondas bajo «Ediciones y retoques» las nombra «Ronda 1» y «Ronda 2», y no cambian `progress`;
  - marcar `done` la fase `in_progress` avanza la siguiente y sube `progress` a 17 (1 de 6);
  - el colaborador recibe `total: null` y `currency: null`, y puede cambiar el estado de una fase;
  - el colaborador mandando `total` en `PATCH` → 403;
  - `dueDate: '25/12/2026'` → 400 `invalid_date`;
  - la lista por defecto excluye los proyectos `delivered`.

- [ ] **Step 2: Verla fallar, implementar y correr `npm test`.** Esperado: PASS.

- [ ] **Step 3: Commit** `feat: projects and phases API with open-ended brand rounds`

---

### Task 4: Portal del cliente: link, página, documento y aprobación

**Files:**
- Create: `worker/portal/tokens.ts`, `worker/portal/html.ts`, `worker/portal/page.ts`, `worker/portal/quote-doc.ts`, `worker/portal/api.ts`, `worker/api/portal-links.ts`
- Modify: `worker/index.ts` (host del portal), `wrangler.jsonc` (binding `PORTAL_LIMIT`), `worker/env.ts`, `package.json` (`qrcode-generator`)
- Remove: `worker/portal/placeholder.ts`, reemplazada por la portada del portal
- Test: `test/portal.test.ts`

**Interfaces:**
- Consumes: `approveQuote` (Task 2), la carga de proyectos (Task 3) y `getSettings` (Task 1).
- Produces:
  - `portal_tokens(token TEXT PRIMARY KEY, client_id TEXT NOT NULL, created_at, revoked_at)`. Un token activo por cliente.
  - `newToken(): string`: 32 bytes de `crypto.getRandomValues` en base64url.
  - `findClientByToken(db, token): Promise<{ id: string; name: string } | null>`: ignora los tokens revocados.
  - `POST /api/admin/clients/:id/portal-link` → `{ url }`. Crea el link o, con `{ regenerate: true }`, revoca el anterior y crea otro.
  - `GET /api/admin/clients/:id/portal-link` → `{ url | null }`.
  - `url = https://clientes.sdtechsystems.dev/c/<token>`.
  - Host del portal:
    - `GET /c/:token` → `renderPortal`:
      - logo, «Hola, <nombre>»;
      - cotizaciones enviadas, aprobadas o vencidas, cada una con número, total, estado y «Ver cotización». Las vigentes tienen además el formulario Aprobar / Rechazar: nombre (obligatorio para aprobar), comentario y botón;
      - proyectos con barra de avance, fases (✓ hecha, ● en curso, ○ pendiente), nota visible y fecha de entrega estimada;
      - nunca borradores ni notas internas.
    - `GET /c/:token/cotizacion/:number` → `renderQuoteDocument`, imprimible, con:
      - logo color y datos de la empresa;
      - número, fecha y «Válida hasta»;
      - datos del cliente;
      - tabla con título, detalle debajo, cantidad, valor unitario y total;
      - total, y «Anticipo requerido (50%): $ 445.000»;
      - «Pago: Llave Bre-B 3058147293 · Davibank» (en USD se usa `usdText`, o «Datos de pago en dólares: te los enviamos por chat» si está vacío);
      - condiciones numeradas;
      - nota «Los costos de terceros (dominio, hosting, plataformas) pueden variar según el proveedor y la tasa de cambio»;
      - QR al portal;
      - botón «Guardar PDF» (`window.print()`), oculto al imprimir.
    - `POST /api/portal/:token/quotes/:id/approve` `{ name, comment? }`:
      - exige JSON (415 si no);
      - `name` recortado de 2 a 80 caracteres; si no → 400 `name_required`;
      - `comment` de máximo 1000 caracteres;
      - llama a `approveQuote` con `by: 'client'`;
      - una cotización de otro cliente → 404.
    - `POST /api/portal/:token/quotes/:id/reject` `{ comment? }` → `rejected`.
    - Token desconocido o revocado → 404 con la página «Este enlace no es válido. Escríbenos por WhatsApp.».
    - `/brand/*` y `/fonts/*` → `ASSETS`.
    - El resto → la portada actual (placeholder sin token).
  - `esc(s: string): string`: escapa `& < > " '`. Todo texto que viene de la base pasa por `esc`.
  - Rate limit: `env.PORTAL_LIMIT?.limit({ key: ip })`. Si `success` es falso → 429. Sin binding, en pruebas, no limita. En `wrangler.jsonc`: `"ratelimits": [{ "name": "PORTAL_LIMIT", "namespace_id": "2001", "simple": { "limit": 60, "period": 60 } }]`.
  - Formularios del portal: un `<script>` inline mínimo que hace `fetch` con JSON y recarga la página. Así el portal no carga el bundle del panel.

- [ ] **Step 1: Escribir las pruebas que fallan.**
  - crear el link devuelve una URL con un token de 43 caracteres;
  - regenerar invalida el anterior (la URL vieja → 404);
  - el portal de A muestra «COT-0001» y no muestra la cotización de B;
  - el documento muestra «Llave Bre-B 3058147293 · Davibank», «Válida hasta», «$ 890.000» y un `<svg` (QR);
  - aprobar desde el portal con `name: 'Ana Pérez'` crea el proyecto, guarda `approvedBy 'client'` y `approvedName`, y el portal luego muestra el proyecto con su avance;
  - aprobar dos veces → 409;
  - aprobar con el token de A una cotización de B → 404;
  - `name: ''` → 400;
  - un comentario `<script>alert(1)</script>` aparece escapado como `&lt;script&gt;` en el HTML del portal;
  - un borrador nunca aparece en el portal.

- [ ] **Step 2: Verla fallar, implementar y correr `npm test`.** Después `npx wrangler deploy --dry-run --outdir .wrangler/dry`. Esperado: PASS y bindings `DB`, `ASSETS` y `PORTAL_LIMIT`.

- [ ] **Step 3: Commit** `feat: client portal with quote document, QR and online approval`

---

### Task 5: Panel: cotizaciones, proyectos, link del portal y ajustes

**Files:**
- Create: `src/pages/{Quotes,QuoteEditor,QuoteDetail,Projects,ProjectDetail}.tsx`, `src/components/{PortalLinkCard,SettingsBusiness,PhaseTemplatesCard,StatusBadge}.tsx`
- Modify: `src/App.tsx` (rutas), `src/components/layout/AppLayout.tsx` (nav: Inicio, Clientes, Cotizaciones*, Proyectos, Catálogo*, Ajustes*; *solo owner; en celular, la barra inferior muestra Inicio, Clientes, Cotizaciones, Proyectos y «Más» con Catálogo y Ajustes), `src/pages/ClientDetail.tsx` (link del portal, cotizaciones y proyectos del cliente), `src/pages/Settings.tsx`, `src/lib/labels.ts`
- Test: `test/labels.test.ts`

**Interfaces:**
- Consumes: las rutas de las Tasks 1–4.
- Produces:
  - `quoteStatusLabel: Record<QuoteStatus, string>`: borrador «Borrador», enviada «Enviada», aprobada «Aprobada», rechazada «Rechazada», vencida «Vencida».
  - `quoteWhatsAppText(q: Quote, clientName: string, portalUrl: string): string` =
    `"Hola <primer nombre>, te comparto la cotización <número> por <total>. Puedes verla y aprobarla aquí: <url>. Es válida hasta el <fecha larga>."`
    con fecha larga `es-CO` en Bogotá, por ejemplo «25 de diciembre de 2026».
  - **`QuoteEditor`:**
    - cliente (buscador), servicio y moneda;
    - ítems: «Agregar del catálogo», con un selector de ítems activos que copia nombre, descripción y precio, o «Ítem libre»; cada ítem con título, detalle, cantidad y precio con `parseMoneyInput`;
    - total en vivo, anticipo %, notas y condiciones (textarea precargada);
    - botones Guardar borrador y «Guardar y enviar».
  - **«Enviar»:** llama a `send`, asegura que exista el link del portal (POST portal-link) y abre `waLink(client.phone, quoteWhatsAppText(...))`. Sin teléfono, copia el texto al portapapeles y avisa.
  - **`QuoteDetail`:**
    - estado, ítems, total y anticipo;
    - botones Ver documento (abre `/c/<token>/cotizacion/<número>` en otra pestaña), Enviar o Reenviar por WhatsApp, «Aprobada por WhatsApp» (aprobar como owner con nota), Rechazar y Renovar (si está vencida o rechazada), e Ir al proyecto;
    - si aprobó el cliente: nombre, comentario y fecha.
  - **`Projects`:** tarjetas con cliente, título, barra de avance, fase actual y fecha de entrega (en rojo si ya pasó).
  - **`ProjectDetail`:**
    - fases con un botón que alterna pendiente → en curso → hecha;
    - fecha objetivo, nota para el cliente y, bajo «Ediciones y retoques», un botón «+ Ronda»;
    - estado del proyecto y fecha de entrega;
    - total, solo para el owner;
    - link «Ver como cliente», que abre el portal.
  - **Ajustes:** tarjeta «Empresa y pagos» (nombre, teléfono, correo, web, llave Bre-B, banco y texto para USD), «Cotizaciones» (vigencia, anticipo y condiciones) y «Plantillas de fases» (una fase por línea, por servicio).

- [ ] **Step 1: Escribir la prueba que falla** para `quoteWhatsAppText`: con `COT-0007`, total 650000 COP, `validUntil 2026-12-25`, cliente «María Gómez» y url `https://clientes.sdtechsystems.dev/c/abc` →
  `"Hola María, te comparto la cotización COT-0007 por $ 650.000. Puedes verla y aprobarla aquí: https://clientes.sdtechsystems.dev/c/abc. Es válida hasta el 25 de diciembre de 2026."`

- [ ] **Step 2: Verla fallar e implementar `labels.ts`.** Esperado: PASS.

- [ ] **Step 3: Implementar las pantallas.**

- [ ] **Step 4: Verificar a mano** con `wrangler dev --local` y Playwright, en 390×844 y 1280×800:
  - crear cliente → crear cotización con «Landing page» del catálogo más un ítem libre → Guardar y enviar;
  - abrir el link del portal con el host `clientes.` (en local, cabecera `Host` o `--host`) → ver el documento → aprobar con nombre;
  - el panel muestra «Aprobada» y el proyecto con 8 fases → marcar «Contenido» como hecha → el portal refleja el avance;
  - capturas en el scratchpad, sin errores en consola.

- [ ] **Step 5: Correr `npm test && npm run typecheck && npm run lint && npm run build`.** Esperado: PASS.

- [ ] **Step 6: Commit** `feat: panel screens for quotes, projects, portal links and business settings`
