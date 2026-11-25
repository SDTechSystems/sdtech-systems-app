# Etapa 6 · Suscripciones, factura final y exportación — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- **Suscripciones:** Juan lleva los servicios recurrentes de cada cliente (hosting, dominio, mantenimiento, soporte). Los cobros aparecen en Pendientes y en su calendario, con botón de cobro por WhatsApp, y registrar el pago avanza la próxima fecha.
- **Factura final:** se emite desde el proyecto con los ítems de la cotización más cada cambio aprobado, los pagos y el saldo, y un QR al portal. Tiene un código que cualquiera puede verificar en `/verificar/<código>`.
- **Datos:** Juan descarga todos sus datos en JSON.
- **Pendientes del diseño:** se cierran el historial en el proyecto (§ 6.14) y la hora de los eventos en Ajustes (§ 6.13).

**Architecture:**
- **Base de datos:** migración `0006_subscriptions_invoices` con `subscriptions` e `invoices`.
- **Factura:** guarda una copia inmutable de lo facturado (ítems, pagos y totales) al emitirse; el documento se arma con esa copia, como la cotización.
- **Sincronización con el calendario:** suma claves `subscription:<id>`.
- **Pendientes:** suma ítems de tipo `subscription`; desaparece el campo vacío `Pending.subscriptions`.

**Spec:** `docs/superpowers/specs/2026-11-25-sdtech-systems-app-design.md` — § 6.8, § 6.10, § 6.12 (servicios y facturas en el portal), § 6.13 (exportar, hora de eventos), § 6.14, § 11 etapa 6.

## Global Constraints

- **Vigente de etapas anteriores:** todo lo de las etapas 1 a 5 (`esc()`, JSON obligatorio, `activity_log`, Bogotá, montos enteros, dinero solo para el owner).
- **Suscripciones:**
  - `kind ∈ hosting | dominio | mantenimiento | soporte | otro`;
  - `cycle ∈ mensual | anual`;
  - `status ∈ active | paused | cancelled`;
  - `amount` entero > 0;
  - `nextDue` `YYYY-MM-DD`.
  - Las notas nunca piden claves; el formulario dice «No guardes contraseñas aquí».
- **Avanzar un ciclo:** se suma 1 mes (o 1 año) y, si el día no existe en el mes destino, se toma el último día de ese mes: `2026-01-31` + 1 mes = `2026-02-28`.
- **Facturas:**
  - número `FAC-0001` (contador `invoice`, que ya existe);
  - `verify_code` de 10 caracteres base32 en mayúsculas, sin I, O, 0 ni 1;
  - se pueden anular, nunca borrar;
  - la ruta pública `/verificar/<código>` en `clientes.` muestra solo número, fecha, nombre del cliente con el apellido en inicial, total y estado («Válida» o «Anulada»), con `noindex`.
- **Exportación:** `GET /api/admin/export` (owner) devuelve todas las tablas menos `oauth_states` y menos la clave `google` de `settings` (el token cifrado).

## Review Focus

1. **Fin de mes:** una suscripción mensual que vence el 31 de enero pasa al 28 de febrero al pagar, y la siguiente del 28 de febrero pasa al 28 de marzo (no recupera el 31, aceptado). Prueba en Task 1.
2. **Factura inmutable:** emitir la factura y luego registrar otro pago o aprobar otro cambio no altera la factura ya emitida. Prueba en Task 2.
3. **Verificación pública:** un código inventado da «No encontramos esta factura» con 404. El HTML nunca muestra el link del portal, el teléfono ni el correo. Prueba en Task 2.
4. **La exportación** no contiene el refresh token cifrado de Google ni los `oauth_states`. Prueba en Task 3.
5. **El colaborador** no ve suscripciones, facturas ni la exportación (403). Prueba en Tasks 1–3.

---

### Task 1: Suscripciones

**Files:**
- Create: `worker/api/subscriptions.ts`, `shared/cycles.ts`
- Modify: `worker/db/migrations.ts` (`0006_subscriptions_invoices`), `worker/api/pending.ts` (ítems `subscription`), `worker/google/sync.ts` (`subscription:<id>`), `worker/index.ts` (`subscriptions`, y la ruta en `CALENDAR_SOURCES`), `shared/types.ts`
- Test: `test/subscriptions.test.ts`, `test/cycles.test.ts`

**Interfaces:**
- Tabla `subscriptions(id PK, client_id NOT NULL, project_id, kind NOT NULL, name NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0), currency NOT NULL DEFAULT 'COP', cycle NOT NULL, next_due NOT NULL, provider, notes, status NOT NULL DEFAULT 'active', last_paid_on, created_at, updated_at)`.
- `addCycle(date: string, cycle: 'mensual' | 'anual'): string`.
- `Subscription { id; clientId; clientName; clientPhone; projectId: string | null; kind; name; amount; currency; cycle; nextDue; provider: string | null; notes: string | null; status; lastPaidOn: string | null }`
- Rutas (owner):
  - `GET /api/admin/subscriptions?clientId=&status=` → `{ subscriptions }`, por defecto las activas, ordenadas por `nextDue`.
  - `POST /api/admin/subscriptions` → 201. Errores `invalid_client`, `name_required`, `invalid_amount`, `invalid_kind`, `invalid_cycle` e `invalid_date`.
  - `PATCH /api/admin/subscriptions/:id`: cualquier campo, incluido `status`.
  - `POST /api/admin/subscriptions/:id/pay` `{ paidOn?, method }`:
    - deja `last_paid_on`;
    - `next_due = addCycle(next_due, cycle)`;
    - registra la actividad `subscription_paid` del cliente con monto y medio.
- **Pendientes:** ítem `kind: 'subscription'` para las activas con `nextDue ≤ hoy + dueSoonDays` (solo owner):
  - `title`: «Cobro: {name}»;
  - `amount` y `currency`;
  - `link`: `/clientes/{clientId}`;
  - `subscriptionId`;
  - urgencia según la fecha.
- **Calendario:** la clave `subscription:<id>` aplica a las activas. `summary`: «Cobro suscripción: {name} {monto} · {cliente}», en `nextDue`.

- [ ] **Step 1: Escribir las pruebas que fallan.**
  - `addCycle('2026-01-31', 'mensual') === '2026-02-28'`;
  - `addCycle('2026-02-28', 'mensual') === '2026-03-28'`;
  - `addCycle('2028-02-29', 'anual') === '2029-02-28'`;
  - `addCycle('2026-12-15', 'mensual') === '2027-01-15'`;
  - crear un hosting de $ 25.000 mensual que vence el `2026-12-12`, y con `today 2026-12-10` aparece en Pendientes como `soon`;
  - pagarlo lo pasa a `2027-01-12` y deja de aparecer;
  - una pausada no aparece;
  - el sync crea `subscription:<id>`, y al cancelarla la borra;
  - el colaborador → 403;
  - `amount: 0` → 400.

- [ ] **Step 2: Verla fallar, implementar y correr `npm test`.** Esperado: PASS.

- [ ] **Step 3: Commit** `feat: recurring subscriptions with reminders, calendar events and payments`

---

### Task 2: Factura final y verificación pública

**Files:**
- Create: `worker/api/invoices.ts`, `worker/portal/invoice-doc.ts`, `worker/portal/verify.ts`
- Modify: `worker/portal/api.ts` (`/c/:token/factura/:number`), `worker/index.ts` (`invoices`; `/verificar/:code` en `clientes.`), `worker/portal/page.ts` (sección «Tus facturas»), `shared/types.ts`
- Test: `test/invoices.test.ts`

**Interfaces:**
- Tabla `invoices(id PK, number UNIQUE NOT NULL, project_id NOT NULL, client_id NOT NULL, issued_at NOT NULL, currency NOT NULL, snapshot TEXT NOT NULL, total INTEGER NOT NULL, paid INTEGER NOT NULL, balance INTEGER NOT NULL, verify_code UNIQUE NOT NULL, voided_at, created_at)`.
- `snapshot = { lines: { title, detail, quantity, unitPrice, total }[], payments: { paidOn, method, amount }[], projectTitle, client: { name, company, document, city, phone, email } }`. Las líneas son los ítems de la cotización (si hay) o una línea con el título y el total del proyecto, más una línea por cambio aprobado («Cambio aprobado: {descripción}», cantidad 1, su monto).
- Rutas (owner):
  - `POST /api/admin/projects/:id/invoices` → 201 `{ invoice }`;
  - `GET /api/admin/projects/:id/invoices` → `{ invoices }`;
  - `POST /api/admin/invoices/:id/void` → anulada.
- `Invoice { id; number; projectId; clientId; issuedAt; currency; total; paid; balance; verifyCode; voided: boolean; lines; payments }`
- **Documento** `/c/:token/factura/:number` (solo facturas del cliente del token):
  - hoja blanca como la cotización;
  - «FACTURA», el número y la fecha;
  - datos del cliente;
  - tabla de líneas;
  - Total, «Pagos recibidos» con cada pago, y Saldo;
  - QR al portal con el texto «Escanea para ver tu proyecto, tus servicios y tus pagos»;
  - «Código de verificación: XXXXXXXXXX — clientes.sdtechsystems.dev/verificar/XXXXXXXXXX»;
  - si está anulada, la marca «ANULADA».
- **`/verificar/:code`** (público, `noindex`): página simple con logo que dice «Factura FAC-0001 · emitida el … · María G. · $ 920.000 · Válida» (o «Anulada»). Un código desconocido → 404 «No encontramos esta factura».
- **Portal:** «Tus facturas» lista el número, la fecha, el total y el enlace al documento (las anuladas, marcadas).

- [ ] **Step 1: Escribir las pruebas que fallan.**
  - aprobar la cotización de $ 770.000, aprobar un cambio de +$ 150.000 y pagar $ 385.000, y emitir: la factura sale `FAC-0001` con 3 líneas (2 ítems y el cambio), total 920000, pagado 385000 y saldo 535000;
  - registrar otro pago no cambia la factura;
  - el documento con el token del cliente muestra «FAC-0001», «Cambio aprobado», «$ 535.000», el código y un `<svg`;
  - con el token de otro cliente → 404;
  - `/verificar/<código>` muestra «Válida» y «María G.», y no contiene `/c/` ni el teléfono;
  - después de anular, muestra «Anulada»;
  - un código inventado → 404;
  - el colaborador → 403 al emitir.

- [ ] **Step 2: Verla fallar, implementar y correr `npm test`.** Esperado: PASS.

- [ ] **Step 3: Commit** `feat: final invoices with approved changes, payments, QR and public verification`

---

### Task 3: Exportación y servicios en el portal

**Files:**
- Create: `worker/api/export.ts`
- Modify: `worker/index.ts` (`export`), `worker/portal/page.ts` y `worker/portal/api.ts` (sección «Tus servicios»: nombre, monto por ciclo y próxima fecha de las suscripciones activas)
- Test: `test/export.test.ts`, `test/portal.test.ts` (caso nuevo)

**Interfaces:**
- `GET /api/admin/export` → JSON `{ exportedAt, version: 1, tables: { [nombre]: filas[] } }` con `content-disposition: attachment; filename="sdtech-systems-YYYY-MM-DD.json"`.
  - Excluye `oauth_states` y la fila `google` de `settings`.
  - Solo owner.

- [ ] **Step 1: Escribir las pruebas que fallan.**
  - la exportación trae `clients`, `quotes`, `projects`, `payments` y `subscriptions`;
  - con Google conectado, el JSON no contiene `refreshToken` ni el nombre de la tabla `oauth_states`;
  - el colaborador → 403;
  - el portal muestra «Tus servicios» con «Hosting · $ 25.000/mes · próximo cobro el 12 de diciembre de 2026».

- [ ] **Step 2: Verla fallar, implementar y correr `npm test`.** Esperado: PASS.

- [ ] **Step 3: Commit** `feat: data export and active services on the client portal`

---

### Task 4: Panel: suscripciones, facturas, historial, hora de eventos y exportar

**Files:**
- Create: `src/pages/Subscriptions.tsx`, `src/components/SubscriptionsCard.tsx`, `src/components/SubscriptionDialog.tsx`, `src/components/InvoicesCard.tsx`, `src/components/ActivityCard.tsx`
- Modify:
  - `src/App.tsx`: ruta `/suscripciones` (owner);
  - `src/components/layout/AppLayout.tsx`: «Suscripciones» en la navegación (owner; en celular, dentro de «Más»);
  - `src/pages/ClientDetail.tsx`: SubscriptionsCard (owner);
  - `src/pages/ProjectDetail.tsx`: InvoicesCard (owner) y ActivityCard;
  - `src/components/PendingList.tsx`: el ítem `subscription` con «Cobrar» (plantilla `subscription`) y «Registrar pago»;
  - `src/components/TemplatesCard.tsx`: la hora de los eventos;
  - `src/pages/Settings.tsx`: botón «Descargar copia (JSON)» activo;
  - `src/lib/whatsapp.ts`: `subscriptionVars`;
  - `src/lib/labels.ts`: etiquetas de suscripciones y de la actividad.
- Test: `test/whatsapp.test.ts` (caso de `subscriptionVars`)

**Interfaces:**
- `subscriptionVars(sub, settings)` → `{ nombre, servicio: name, monto, fecha: fecha larga, llave, banco }`.
- **Página «Suscripciones»:**
  - lista de activas por fecha de cobro, con cliente, servicio, monto por ciclo y próxima fecha (en rojo si ya pasó);
  - botones «Cobrar», «Registrar pago» (diálogo con medio y fecha) y «Editar»;
  - filtro «Ver pausadas y canceladas»;
  - total mensual estimado: mensuales + anuales / 12, por moneda.
- **SubscriptionDialog:**
  - campos: cliente (selector si no viene dado), proyecto (opcional), tipo, nombre, monto, moneda, ciclo, próxima fecha, proveedor y notas, con la ayuda «No guardes contraseñas aquí»;
  - botón «Desde el catálogo»: precarga desde los ítems mensuales o anuales.
- **InvoicesCard:**
  - «Emitir factura», con la confirmación «Se guardará una copia de cómo está el proyecto hoy»;
  - lista con «Ver», «Enviar por WhatsApp» (texto «Hola {nombre}, te comparto la factura {número}: {link}») y «Anular».
- **ActivityCard:** el historial del proyecto, con fecha, autor y la acción en español.

- [ ] **Step 1: Escribir la prueba que falla** de `subscriptionVars` con la plantilla `subscription`:
  `"Hola María, te recuerdo el pago de Hosting por $ 25.000, que vence el 12 de diciembre de 2026. Llave Bre-B 3058147293 (Davibank)."`

- [ ] **Step 2: Verla fallar e implementar.** Esperado: PASS.

- [ ] **Step 3: Implementar las pantallas** con el estilo de marca.

- [ ] **Step 4: Verificar a mano** con dos `wrangler dev` y Playwright:
  - crear una suscripción, verla en Pendientes y registrar su pago;
  - emitir la factura de un proyecto y abrirla;
  - abrir la verificación;
  - descargar la exportación.

  Capturas en celular y computador.

- [ ] **Step 5: Correr `npm test && npm run typecheck && npm run lint && npm run build`.** Esperado: PASS.

- [ ] **Step 6: Commit** `feat: panel screens for subscriptions, invoices, project history and data export`
