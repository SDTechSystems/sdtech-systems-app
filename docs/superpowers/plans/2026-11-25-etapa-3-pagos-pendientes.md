# Etapa 3 · Pagos, saldo, «Pendientes» y mensajes de WhatsApp — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Juan registra compromisos de pago y pagos por proyecto, ve el saldo, le cobra al cliente con un botón de WhatsApp de mensaje editable, y el Inicio le muestra en una sola lista lo que se le puede olvidar: cobros, entregas, fases, cotizaciones por vencer, novedades del portal y proyectos quietos.

**Architecture:** Sigue las etapas 1 y 2. Migración `0003_payments` con `payment_plans` y `payments`. El saldo se calcula al leer. «Pendientes» es un endpoint que arma las secciones con consultas a D1; nada se guarda aparte, salvo la marca de «visto» de las novedades del portal. Las plantillas de WhatsApp viven en `settings`, y `shared/templates.ts` las rellena (lo usan panel y pruebas).

**Tech Stack:** el de las etapas anteriores.

**Spec:** `docs/superpowers/specs/2026-11-25-sdtech-systems-app-design.md` — § 6.1, § 6.7, § 6.11, § 6.12 (pagos en el portal), § 6.13 (avisos, plantillas), § 11 etapa 3. Lo que § 6.1 menciona de reuniones (etapa 4) y suscripciones (etapa 6) queda fuera; la respuesta de Pendientes ya trae esas secciones, vacías.

## Global Constraints

- Lo de las etapas 1 y 2 sigue vigente: montos enteros en la moneda del proyecto, America/Bogota, `activity_log` en cada mutación, `readJson` (415), `esc()` en el portal.
- **Pagos solo para owner.** El colaborador no ve el bloque de pagos, y su Pendientes no trae cobros ni cotizaciones.
- **Medios de pago:** `nequi | bancolombia | efectivo | breb` (Nequi, Bancolombia, Efectivo, Bre-B).
- **Estado de un compromiso:**
  - `paid` si `paid_at` no es nulo;
  - si no, `overdue` cuando `dueDate < hoy` (Bogotá);
  - si no, `pending`.
- **Saldo** = `project.total − Σ pagos` (los cambios aprobados se suman en la etapa 5). Puede ser negativo, si el cliente pagó de más.
- **Anticipo automático:** al aprobar una cotización con `advancePercent > 0` se crea el compromiso «Anticipo» por `advanceAmount`, con fecha `hoy + 3`.
- **Plantillas por defecto** (variables entre llaves; las que no existan quedan tal cual):
  - `quote`: `Hola {nombre}, te comparto la cotización {numero} por {total}. Puedes verla y aprobarla aquí: {link}. Es válida hasta el {vence}.`
  - `payment`: `Hola {nombre}, te recuerdo el pago de {concepto} por {monto}, acordado para el {fecha}. Puedes pagar con la llave Bre-B {llave} ({banco}). Aquí ves el detalle: {link}. ¡Gracias!`
  - `progress`: `Hola {nombre}, te cuento cómo va {proyecto}: ya estamos en «{fase}» ({avance}%). Puedes verlo aquí: {link}`
  - `delivery`: `Hola {nombre}, ¡{proyecto} está listo! Ya puedes verlo en tu página: {link}`
  - `meeting`: `Hola {nombre}, te recuerdo nuestra reunión el {fecha} a las {hora}. Enlace: {meet}`
  - `subscription`: `Hola {nombre}, te recuerdo el pago de {servicio} por {monto}, que vence el {fecha}. Llave Bre-B {llave} ({banco}).`
- **Avisos:** `settings.alerts = { staleDays: 7, dueSoonDays: 7, quoteExpiringDays: 5 }`.

## Review Focus

1. **Pago parcial y pago de más:** registrar $ 200.000 de un anticipo de $ 385.000 no lo marca pagado. El saldo baja exacto, y un total sobrepagado muestra el saldo negativo sin romper nada. Prueba en Task 1.
2. **Compromiso que vence hoy:** aparece como «hoy», no como vencido. Mañana pasa a vencido (fecha de Bogotá). Prueba en Task 3.
3. **Plantilla con variable mal escrita o vacía:** `{nombr}` queda literal y no rompe. Una variable sin valor (`{link}` sin link) queda vacía, sin la palabra «undefined». Prueba en Task 2.
4. **Proyecto quieto:** cuenta cualquier movimiento, sea un cambio de fase, un pago o una nota (`activity_log`), no solo `updated_at`. Un proyecto entregado o en pausa no alerta. Prueba en Task 3.
5. **El colaborador** pidiendo pagos o Pendientes no recibe montos (403 o secciones vacías). Prueba en Tasks 1 y 3.

---

## Estructura de archivos

```
worker/db/migrations.ts     + 0003_payments
worker/payments/repo.ts     loadPayments(db, projectId, today) → PaymentSummary
worker/api/payments.ts      /api/admin/projects/:id/payment-plans, /payments; /api/admin/payment-plans/:id; /api/admin/payments/:id
worker/api/pending.ts       GET /api/admin/pending, POST /api/admin/pending/seen
worker/api/reminders.ts     POST /api/admin/reminders
worker/quotes/approve.ts    + compromiso «Anticipo»
worker/portal/page.ts       + bloque de pagos por proyecto
worker/settings.ts          + alerts, templates
shared/templates.ts         fillTemplate(), DEFAULT_TEMPLATES, TemplateKey
shared/types.ts             + PaymentPlan, Payment, PaymentSummary, PendingItem, Pending
src/components/PaymentsCard.tsx, TemplatesCard.tsx, PendingList.tsx
src/pages/Home.tsx          Pendientes
src/lib/whatsapp.ts         sendWhatsApp(template, vars, phone, log)
```

---

### Task 1: Compromisos, pagos y saldo

**Files:**
- Create: `worker/payments/repo.ts`, `worker/api/payments.ts`
- Modify: `worker/db/migrations.ts`, `worker/quotes/approve.ts`, `worker/api/projects.ts` (despacho de subrutas), `worker/index.ts` (`payment-plans`, `payments`), `shared/types.ts`
- Test: `test/payments.test.ts`

**Interfaces:**
- Migración `0003_payments`:
  - `payment_plans(id PK, project_id NOT NULL, label TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0), due_date TEXT NOT NULL, paid_at TEXT, created_at)`
  - `payments(id PK, project_id NOT NULL, plan_id TEXT, amount INTEGER NOT NULL CHECK(amount > 0), paid_on TEXT NOT NULL, method TEXT NOT NULL CHECK(method IN ('nequi','bancolombia','efectivo','breb')), note TEXT, created_at)`
  - índices por `project_id`.
- Tipos:
  - `PaymentPlan { id; projectId; label; amount; dueDate; status: 'pending' | 'overdue' | 'paid'; paidAt: string | null; paidAmount: number }`. `paidAmount` es la suma de los pagos con ese `planId`.
  - `Payment { id; projectId; planId: string | null; amount; paidOn; method: PaymentMethod; note: string | null }`
  - `PaymentSummary { currency: Currency; total: number; paid: number; balance: number; plans: PaymentPlan[]; payments: Payment[] }`
- `loadPayments(db, projectId, today = todayBogota()): Promise<PaymentSummary>`
- Rutas (solo owner; si no → 403):
  - `GET /api/admin/projects/:id/payments` → `PaymentSummary`.
  - `POST /api/admin/projects/:id/payment-plans` `{ label, amount, dueDate }` → 201 `PaymentSummary`. Errores: `label_required`, `invalid_amount` (entero > 0) e `invalid_date`.
  - `PATCH /api/admin/payment-plans/:id` `{ label?, amount?, dueDate?, paid?: boolean }`. `paid: true` fija `paid_at = now`; `false` lo limpia.
  - `DELETE /api/admin/payment-plans/:id`.
  - `POST /api/admin/projects/:id/payments` `{ amount, paidOn, method, planId?, note? }` → 201 `PaymentSummary`.
    - Si `planId` se da y la suma pagada a ese plan llega a su monto, el plan queda `paid` automáticamente.
    - Error con `planId` de otro proyecto: 400 `invalid_plan`.
  - `DELETE /api/admin/payments/:id`. Si deja al plan debajo de su monto, le limpia `paid_at`.
  - Un proyecto sin `total` → `total: 0` y `balance: −pagado`.
- `approveQuote` agrega al batch el compromiso «Anticipo» (con la misma guarda `EXISTS`), con `due_date = addDays(today, 3)`, solo si `advanceAmount > 0`.

- [ ] **Step 1: Escribir las pruebas que fallan.**
  - aprobar una cotización de $ 770.000 con 50% crea el plan «Anticipo» por $ 385.000 con fecha hoy + 3 y estado `pending`;
  - un pago de $ 200.000 a ese plan deja el plan `pending` con `paidAmount 200000` y el saldo en $ 570.000;
  - un pago de $ 185.000 más lo pasa a `paid` y el saldo queda en $ 385.000;
  - borrar ese último pago lo devuelve a `pending`;
  - un pago de $ 900.000 sin plan deja el saldo en −$ 130.000 (sobrepago visible);
  - un plan con `dueDate` ayer está `overdue`;
  - `method: 'paypal'` → 400 `invalid_method`;
  - `amount: 0` → 400 `invalid_amount`;
  - el colaborador → 403 en GET y POST.

- [ ] **Step 2: Verla fallar, implementar y correr `npm test`.** Esperado: PASS.

- [ ] **Step 3: Commit** `feat: payment plans, payments and project balance`

---

### Task 2: Plantillas de WhatsApp y registro de recordatorios

**Files:**
- Create: `shared/templates.ts`, `worker/api/reminders.ts`
- Modify: `worker/settings.ts` (`templates`, `alerts`; validación), `shared/types.ts` (`Settings.templates`, `Settings.alerts`), `worker/index.ts`, `src/lib/labels.ts` (`quoteWhatsAppText` pasa a usar `fillTemplate` y la plantilla `quote`)
- Test: `test/templates.test.ts`, `test/reminders.test.ts`

**Interfaces:**
- `type TemplateKey = 'quote' | 'payment' | 'progress' | 'delivery' | 'meeting' | 'subscription'`
- `DEFAULT_TEMPLATES: Record<TemplateKey, string>`, exactamente como en Global Constraints.
- `fillTemplate(template: string, vars: Record<string, string | null | undefined>): string`
  - reemplaza `{clave}` por su valor;
  - una clave presente con valor `null`, `undefined` o vacío queda como cadena vacía;
  - una clave que no está en `vars` queda literal.
- `quoteWhatsAppText(q, clientName, portalUrl, template = DEFAULT_TEMPLATES.quote)` sigue dando el mismo texto que en la etapa 2 (la prueba existente debe seguir pasando).
- `POST /api/admin/reminders` `{ entityType: 'project' | 'quote' | 'payment_plan' | 'client', entityId, kind: TemplateKey }` → 201. Escribe en `activity_log`:
  - `action = 'reminder'`, `detail = { kind }`;
  - para `payment_plan`, la entrada va al proyecto del plan, con `detail.planId`.
  - Cualquier rol puede registrarlo, menos `kind` `payment` o `subscription`, que son solo del owner.
- `PATCH /api/admin/settings` acepta `templates` (cada una no vacía) y `alerts` (enteros entre 1 y 90).

- [ ] **Step 1: Escribir las pruebas que fallan.**
  - `fillTemplate('Hola {nombre}, {link}', { nombre: 'María', link: null }) === 'Hola María, '`;
  - `fillTemplate('{nombr} {monto}', { monto: '$ 5' }) === '{nombr} $ 5'`;
  - `getSettings` trae las 6 plantillas por defecto y `alerts.staleDays === 7`;
  - registrar un recordatorio de un `payment_plan` deja una fila `reminder` en el `activity_log` del proyecto;
  - el colaborador registrando `kind: 'payment'` → 403;
  - `templates: { payment: '' }` → 400 `invalid_settings`.

- [ ] **Step 2: Verla fallar, implementar y correr `npm test`.** Esperado: PASS, incluida la prueba de `labels` de la etapa 2.

- [ ] **Step 3: Commit** `feat: editable WhatsApp templates and reminder log`

---

### Task 3: «Pendientes»

**Files:**
- Create: `worker/api/pending.ts`
- Modify: `shared/types.ts`, `worker/index.ts`
- Test: `test/pending.test.ts`

**Interfaces:**
- `interface PendingItem { kind: 'payment' | 'delivery' | 'phase' | 'quote_expiring' | 'quote_expired' | 'portal' | 'stale'; title: string; subtitle: string; date: string | null; urgency: 'overdue' | 'today' | 'soon' | 'info'; link: string; clientId: string; clientName: string; clientPhone: string | null; projectId?: string; quoteId?: string; planId?: string; amount?: number; currency?: Currency; lastReminderAt?: string | null }`
- `interface Pending { today: string; items: PendingItem[]; meetings: []; subscriptions: [] }`
- `GET /api/admin/pending?today=` (el parámetro solo se usa en pruebas; en producción, hoy en Bogotá). Reglas, sobre proyectos `active`:
  - **`payment`** (solo owner): compromisos sin pagar con `dueDate ≤ hoy + dueSoonDays`. `urgency`: `overdue` si la fecha ya pasó, `today` si es hoy, `soon` si viene. `lastReminderAt` es la última entrada `reminder` con `detail.planId` igual al plan.
  - **`delivery`:** proyecto con `dueDate ≤ hoy + dueSoonDays`.
  - **`phase`:** fase no hecha con `dueDate ≤ hoy + dueSoonDays`.
  - **`quote_expiring`** (solo owner): enviada y vigente, con `validUntil ≤ hoy + quoteExpiringDays`. `urgency: 'soon'`, o `'today'` si vence hoy.
  - **`quote_expired`** (solo owner): vencida (enviada y pasada), en los últimos 30 días. `urgency: 'info'`.
  - **`portal`:** entradas de `activity_log` con `actor = 'cliente (portal)'` posteriores a `settings.portalSeenAt` (vacío = últimos 7 días). `urgency: 'info'`. El `title` dice qué hizo, por ejemplo «María aprobó COT-0003» o «María rechazó COT-0002».
  - **`stale`:** proyecto `active` cuya última entrada de `activity_log` (de `project`, o de un `payment_plan` del proyecto), o su `created_at` si no tiene, es anterior a `hoy − staleDays`. `urgency: 'soon'`.
  - Orden: `overdue`, `today`, `soon`, `info`; dentro de cada grupo, por fecha ascendente (sin fecha al final).
- `POST /api/admin/pending/seen` → guarda `settings.portalSeenAt = now`, solo owner.

- [ ] **Step 1: Escribir las pruebas que fallan**, con `today` fijo en `2026-12-10`:
  - un plan con fecha `2026-12-09` → `payment` `overdue`; con `2026-12-10` → `today`; con `2026-12-15` → `soon`; con `2026-12-30` no aparece;
  - un proyecto con `dueDate 2026-12-12` → `delivery` `soon`;
  - una cotización enviada con `validUntil 2026-12-13` → `quote_expiring`;
  - aprobar desde el portal crea un ítem `portal`, y después de `POST /pending/seen` ya no aparece;
  - un proyecto activo con su última actividad el `2026-11-30` → `stale`; en pausa → no aparece;
  - un recordatorio registrado del plan rellena `lastReminderAt`;
  - para el colaborador no hay ítems `payment` ni `quote_*`;
  - el orden: los `overdue` van antes que los `today`.

- [ ] **Step 2: Verla fallar, implementar y correr `npm test`.** Esperado: PASS.

- [ ] **Step 3: Commit** `feat: pending list for overdue payments, deadlines, quotes, portal news and stale projects`

---

### Task 4: Pagos en el portal

**Files:**
- Modify: `worker/portal/page.ts`, `worker/portal/api.ts`
- Test: `test/portal.test.ts` (casos nuevos)

**Interfaces:**
- Cada proyecto en el portal que tenga `total` muestra:
  - un bloque «Pagos» con Total, Pagado y Saldo;
  - la lista de compromisos (etiqueta, monto, fecha y estado: «Pagado», «Vence el …» o «Venció el …»);
  - si hay compromisos sin pagar en COP, el texto «Llave Bre-B 3058147293 · Davibank» con un botón «Copiar llave» (`navigator.clipboard`, script inline);
  - no muestra las notas de los pagos.

- [ ] **Step 1: Escribir las pruebas que fallan.**
  - después de aprobar y registrar un pago de $ 200.000, el portal muestra «Pagado» con $ 200.000, «Saldo» con $ 570.000, «Anticipo» y «Copiar llave»;
  - la nota interna del pago («transferencia de la mamá») no aparece en el HTML.

- [ ] **Step 2: Verla fallar, implementar y correr `npm test`.** Esperado: PASS.

- [ ] **Step 3: Commit** `feat: show payments, balance and Bre-B key on the client portal`

---

### Task 5: Panel: pagos, Inicio con Pendientes y plantillas

**Files:**
- Create: `src/components/PaymentsCard.tsx`, `src/components/PendingList.tsx`, `src/components/TemplatesCard.tsx`, `src/lib/whatsapp.ts`
- Modify: `src/pages/Home.tsx`, `src/pages/ProjectDetail.tsx` (PaymentsCard para owner; botón «Enviar avance» por WhatsApp), `src/pages/Settings.tsx` (TemplatesCard y avisos), `src/lib/quote-actions.ts` (usa la plantilla `quote` de ajustes)
- Test: `test/whatsapp.test.ts`

**Interfaces:**
- `paymentVars(plan, project, client, settings, portalUrl): Record<string,string>` en `src/lib/whatsapp.ts` → `{ nombre: primer nombre, concepto: plan.label, monto, fecha: fecha larga, llave, banco, link }`.
- `progressVars(project, client, portalUrl)` → `{ nombre, proyecto, fase: fase en curso o la última hecha, avance, link }`.
- `openWhatsApp(phone: string | null, text: string): Promise<boolean>`: abre `waLink` en una pestaña nueva. Sin teléfono, copia el texto y devuelve `false`.
- **PaymentsCard:**
  - resumen Total, Pagado y Saldo;
  - compromisos con estado y acciones: «Cobrar por WhatsApp» (llena la plantilla `payment`, abre WhatsApp y registra el recordatorio, mostrando «Último recordatorio: fecha»), «Registrar pago» (precarga el monto pendiente del plan) y «Marcar pagado»;
  - botones «Nuevo compromiso» y «Registrar pago» sin plan;
  - lista de pagos con medio y fecha, y opción de borrar.
- **Home:**
  - «Hola 👋» y el resumen de cuántos vencidos, para hoy y próximos;
  - `PendingList` agrupado por urgencia («Vencidos», «Hoy», «Próximos días», «Novedades»);
  - cada ítem con su icono y enlace;
  - los de `payment` con «Cobrar» y «Registrar pago»;
  - en las novedades del portal, «Marcar como visto»;
  - si no hay nada: «Todo al día ✅».
- **Ajustes:** «Mensajes de WhatsApp», una caja por plantilla con la lista de variables disponibles debajo, y «Avisos» (días para proyecto quieto, para próximos y para cotizaciones por vencer).

- [ ] **Step 1: Escribir la prueba que falla** de `paymentVars` y la plantilla `payment`. Con el plan «Anticipo» de 385000 COP del `2026-12-13`, la cliente «María Gómez», la llave `3058147293` de `Davibank` y el link `https://clientes.sdtechsystems.dev/c/abc`, el texto es exactamente:
  `"Hola María, te recuerdo el pago de Anticipo por $ 385.000, acordado para el 13 de diciembre de 2026. Puedes pagar con la llave Bre-B 3058147293 (Davibank). Aquí ves el detalle: https://clientes.sdtechsystems.dev/c/abc. ¡Gracias!"`

- [ ] **Step 2: Verla fallar e implementar `src/lib/whatsapp.ts`.** Esperado: PASS.

- [ ] **Step 3: Implementar las pantallas.**

- [ ] **Step 4: Verificar a mano** con dos `wrangler dev` (panel en 8787, clientes en 8788 con `--host`, puertos de inspector distintos) y Playwright, enrutando `clientes.sdtechsystems.dev` al 8788 con `context.route`:
  - aprobar una cotización;
  - el Inicio muestra el anticipo como próximo;
  - registrar un pago parcial;
  - el portal muestra el saldo;
  - «Cobrar por WhatsApp» abre el texto correcto y deja «Último recordatorio».
  - Capturas en 390×844 y 1280×800.

- [ ] **Step 5: Correr `npm test && npm run typecheck && npm run lint && npm run build`.** Esperado: PASS.

- [ ] **Step 6: Commit** `feat: panel payments, pending home and editable WhatsApp messages`
