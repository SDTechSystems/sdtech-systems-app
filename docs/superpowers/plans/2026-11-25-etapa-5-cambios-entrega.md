# Etapa 5 · Cambios de costo, pedidos de ajuste y entrega — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- El cliente pide ajustes desde su portal.
- Juan los resuelve o los convierte en cambios de costo.
- Cada cambio de costo (+ o −) queda pendiente hasta que el cliente lo aprueba en el portal con su nombre, o Juan lo marca como aprobado por WhatsApp, y solo entonces se suma al total y al saldo.
- La entrega (link de Drive) aparece en el portal solo cuando Juan la libera.
- En el Inicio, un botón agenda reuniones escogiendo el cliente.

**Architecture:**
- **Datos:** migración `0005_changes` con `change_requests` y el link de entrega en `projects` (ya existen `delivery_url` y `delivery_released`).
- **Total del proyecto:** `total efectivo = projects.total + Σ cambios de costo aprobados`. Lo calcula `loadPayments` y lo usan el saldo, Pendientes, el calendario y el portal.
- **Acciones del portal:** van por `/api/portal/:token/...` como la aprobación de cotizaciones.

**Spec:** `docs/superpowers/specs/2026-11-25-sdtech-systems-app-design.md` — § 6.6, § 6.7 (entrega), § 6.12 (cambios, ajustes y entrega en el portal), § 11 etapa 5.

## Global Constraints

- Lo de las etapas 1 a 4 sigue vigente: `esc()` en el portal, JSON obligatorio (415), `activity_log`, America/Bogota y montos enteros en la moneda del proyecto.
- **Cambios de costo:**
  - los crea solo el owner;
  - `amount` es un entero distinto de 0 (positivo aumenta, negativo reduce);
  - `description` es obligatoria.
- **Pedidos de ajuste:** solo desde el portal; texto de 3 a 1000 caracteres.
- **Aprobar desde el portal** exige nombre (2 a 80 caracteres), igual que las cotizaciones. Se guarda una copia inmutable: `{ description, amount, currency, approvedName, comment, at }`.
- **Estados:**
  - cambio de costo: `pending → approved | rejected` (una sola vez; repetir → 409);
  - pedido de ajuste: `pending → resolved | converted`.
- **Link de entrega:** solo `https://`; si no → 400 `invalid_url`. El portal solo lo muestra si `delivery_released = 1`. Liberar o retirar la entrega es solo del owner.
- **Colaborador:** ve los pedidos de ajuste y los puede marcar resueltos. No ve montos ni cambios de costo, y no toca la entrega.

## Review Focus

1. **Doble aprobación o pestaña vieja:** aprobar un cambio ya aprobado o rechazado → 409, y el total no se suma dos veces. Prueba en Task 1 y Task 2.
2. **Reducción de costo:** un cambio de −$ 120.000 aprobado baja el total y el saldo; si el saldo queda negativo, el portal muestra $ 0 (regla de la etapa 3). Prueba en Task 1.
3. **Token de otro cliente:** con el link de A no se aprueba un cambio ni se pide un ajuste en un proyecto de B (404). Prueba en Task 2.
4. **El link de entrega** no aparece en el HTML del portal mientras no esté liberado, ni siquiera escondido. Prueba en Task 3.
5. **Texto del cliente con HTML** en el pedido de ajuste se muestra escapado en el portal. Prueba en Task 2.

---

### Task 1: Cambios de costo y pedidos de ajuste (API del panel)

**Files:**
- Create: `worker/api/changes.ts`, `worker/changes/repo.ts`
- Modify: `worker/db/migrations.ts` (`0005_changes`), `worker/payments/repo.ts` (total con cambios aprobados), `worker/api/projects.ts` (despacho de `/projects/:id/changes`), `worker/index.ts` (`changes`), `shared/types.ts`
- Test: `test/changes.test.ts`

**Interfaces:**
- Tabla `change_requests(id PK, project_id NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('adjustment','cost')), description TEXT NOT NULL, amount INTEGER, status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','resolved','converted')), requested_by TEXT NOT NULL CHECK(requested_by IN ('client','owner')), decided_by TEXT, approved_name TEXT, client_comment TEXT, snapshot TEXT, source_id TEXT, created_at TEXT NOT NULL, decided_at TEXT)`, con índice por `project_id`.
- `ChangeRequest { id; projectId; kind: 'adjustment' | 'cost'; description; amount: number | null; status; requestedBy: 'client' | 'owner'; decidedBy: 'client' | 'owner' | null; approvedName: string | null; clientComment: string | null; createdAt; decidedAt: string | null }`
- `listChanges(db, projectId): Promise<ChangeRequest[]>`, más recientes primero.
- `approvedChangesTotal(db, projectId): Promise<number>`.
- `PaymentSummary` agrega `baseTotal` (lo de la cotización) y `changesTotal`; `total = baseTotal + changesTotal`.
- Rutas:
  - `GET /api/admin/projects/:id/changes` → `{ changes }`. El colaborador recibe solo los `adjustment`.
  - `POST /api/admin/projects/:id/changes` `{ description, amount }` → 201 cambio de costo `pending` (solo owner). Errores `description_required` e `invalid_amount`.
  - `POST /api/admin/changes/:id/approve` `{ note? }` (owner) → `approved`, `decided_by 'owner'`, copia guardada. 409 si no está `pending`.
  - `POST /api/admin/changes/:id/reject` (owner) → `rejected`.
  - `POST /api/admin/changes/:id/resolve` → `adjustment` pasa a `resolved`. Cualquier rol.
  - `POST /api/admin/changes/:id/convert` `{ amount, description? }` (owner) → el ajuste queda `converted` y se crea un cambio de costo `pending` con `source_id` = el ajuste.
  - `DELETE /api/admin/changes/:id` (owner): solo cambios de costo `pending`.

- [ ] **Step 1: Escribir las pruebas que fallan.**
  - un cambio de +$ 150.000 pendiente no cambia el total ($ 770.000); aprobado por el owner, el total sube a $ 920.000 y el saldo también;
  - aprobarlo de nuevo → 409 y el total sigue en $ 920.000;
  - un cambio de −$ 120.000 aprobado baja el total a $ 650.000;
  - `amount: 0` → 400 `invalid_amount`;
  - un pedido de ajuste (insertado como si viniera del portal) se convierte con `amount 80000` → el ajuste queda `converted` y hay un cambio de costo `pending` de 80000 con `source_id`;
  - el colaborador no ve los cambios de costo y al crear uno recibe 403;
  - el colaborador puede marcar un ajuste como `resolved`.

- [ ] **Step 2: Verla fallar, implementar y correr `npm test`.** Esperado: PASS.

- [ ] **Step 3: Commit** `feat: cost changes and adjustment requests with approved totals`

---

### Task 2: Cambios y ajustes en el portal

**Files:**
- Modify: `worker/portal/api.ts` (rutas nuevas), `worker/portal/page.ts` (bloques nuevos en la tarjeta del proyecto), `worker/api/pending.ts` (novedades del portal sobre cambios y ajustes)
- Test: `test/portal.test.ts`, `test/pending.test.ts` (casos nuevos)

**Interfaces:**
- `POST /api/portal/:token/projects/:projectId/adjustments` `{ text }` → 201. Crea `adjustment` con `requested_by 'client'`. 404 si el proyecto no es del cliente; 400 `text_required` si tiene menos de 3 caracteres.
- `POST /api/portal/:token/changes/:id/approve` `{ name, comment? }` y `.../reject` `{ comment? }`. 404 si el cambio no es de un proyecto del cliente; 409 si no está `pending`.
- Actividad con actor `cliente (portal)`:
  - `entity_type 'project'`;
  - acciones `adjustment_requested`, `change_approved` y `change_rejected`;
  - `detail` con la descripción y el monto.
- **Portal, en cada proyecto:**
  - «Cambios por aprobar»: descripción, monto con signo («+ $ 150.000» o «− $ 120.000») y el formulario Aprobar (nombre y comentario) o Rechazar;
  - «Cambios aprobados»: descripción, monto, quién y cuándo;
  - «Pedir un ajuste»: textarea y enviar, y la lista de ajustes pedidos con su estado («Recibido», «Hecho» o «Cotizado»);
  - el bloque de pagos usa el total con cambios.
- **Pendientes:** novedades `portal` también para estas acciones. Títulos: «María pidió un ajuste en Landing page», «María aprobó un cambio de + $ 150.000» y «María rechazó un cambio».

- [ ] **Step 1: Escribir las pruebas que fallan.**
  - el cliente pide un ajuste «Cambiar el color del botón <b>» → 201; el portal lo muestra escapado (`&lt;b&gt;`) con estado «Recibido»;
  - Juan crea un cambio de +$ 150.000; el portal lo muestra en «Cambios por aprobar»;
  - el cliente lo aprueba con su nombre → el total del portal pasa a $ 920.000;
  - aprobarlo otra vez → 409;
  - con el token de otro cliente → 404 en los dos endpoints;
  - Pendientes muestra «María Gómez pidió un ajuste en Landing page».

- [ ] **Step 2: Verla fallar, implementar y correr `npm test`.** Esperado: PASS.

- [ ] **Step 3: Commit** `feat: clients approve cost changes and request adjustments on the portal`

---

### Task 3: Entrega por link de Drive

**Files:**
- Modify: `worker/api/projects.ts` (`PATCH` acepta `deliveryUrl`; `POST /projects/:id/delivery` `{ release: boolean }`), `worker/projects/repo.ts` (`Project.deliveryUrl` y `deliveryReleased`; `deliveryUrl` es `null` para el colaborador), `worker/portal/page.ts`, `shared/types.ts`
- Test: `test/delivery.test.ts`

**Interfaces:**
- `PATCH /api/admin/projects/:id` `{ deliveryUrl }`: solo owner. Acepta `https://…` o `null`; si no → 400 `invalid_url`.
- `POST /api/admin/projects/:id/delivery` `{ release: true | false }` (owner).
  - Liberar sin link → 400 `delivery_url_required`.
  - Deja actividad `delivery_released` o `delivery_withdrawn`.
- **Portal:** con la entrega liberada, el proyecto muestra «Tu entrega está lista» y el botón «Descargar entrega», que abre el link en otra pestaña. Sin liberar, el HTML no contiene el link.

- [ ] **Step 1: Escribir las pruebas que fallan.**
  - `deliveryUrl: 'ftp://x'` → 400;
  - guardar `https://drive.google.com/drive/folders/abc` sin liberar → el portal no contiene `drive.google.com`;
  - al liberar, el portal muestra «Descargar entrega» con el link;
  - liberar sin link → 400;
  - el colaborador → 403 al liberar.

- [ ] **Step 2: Verla fallar, implementar y correr `npm test`.** Esperado: PASS.

- [ ] **Step 3: Commit** `feat: release the Drive delivery link to the client portal`

---

### Task 4: Panel: cambios, ajustes, entrega y «Agendar reunión» en el Inicio

**Files:**
- Create: `src/components/ChangesCard.tsx`, `src/components/DeliveryCard.tsx`
- Modify:
  - `src/pages/ProjectDetail.tsx`;
  - `src/components/PaymentsCard.tsx` (muestra «Base» y «Cambios» cuando hay cambios aprobados);
  - `src/components/MeetingDialog.tsx` (si no recibe `clientId`, muestra un selector de cliente);
  - `src/pages/Home.tsx` (botón «Agendar reunión»);
  - `src/components/PendingList.tsx` (iconos de las nuevas novedades).
- Test: `test/labels.test.ts` (caso nuevo de `signedMoney`)

**Interfaces:**
- `signedMoney(amount, currency)`: `150000` → `"+ $ 150.000"`, `-120000` → `"− $ 120.000"` (signo menos tipográfico U+2212).
- **ChangesCard:**
  - pedidos del cliente con «Marcar hecho» y «Cotizar» (este último solo owner; abre un diálogo de monto);
  - cambios de costo con estado, y para los pendientes «Aprobado por WhatsApp», «Rechazado» y «Borrar»;
  - botón «Nuevo cambio de costo» (owner), con descripción, «Aumenta» o «Reduce», y monto;
  - por cada cambio pendiente, botón «Enviar por WhatsApp» con el texto «Hola {nombre}, agregué un cambio a {proyecto}: {descripción} ({monto}). Puedes aprobarlo aquí: {link}».
- **DeliveryCard** (owner):
  - link de Drive con Guardar;
  - estado «No liberada» o «Liberada»;
  - botones «Liberar al cliente» y «Retirar»;
  - si el saldo es mayor que 0 y Juan intenta liberar, confirmación «El cliente aún debe $ X. ¿Liberar igual?»;
  - después de liberar, botón «Avisar por WhatsApp» con la plantilla `delivery`.
- **Inicio:** botón «Agendar reunión» que abre `MeetingDialog` con selector de cliente.

- [ ] **Step 1: Escribir la prueba que falla** de `signedMoney`.

- [ ] **Step 2: Verla fallar e implementar.** Esperado: PASS.

- [ ] **Step 3: Implementar las pantallas** con el estilo de marca.

- [ ] **Step 4: Verificar a mano** con dos `wrangler dev` y Playwright:
  - crear un cambio de costo;
  - aprobarlo en el portal;
  - el saldo sube;
  - pedir un ajuste desde el portal y verlo en Pendientes y en el proyecto;
  - liberar la entrega y verla en el portal;
  - agendar una reunión desde el Inicio.

  Capturas en celular y computador.

- [ ] **Step 5: Correr `npm test && npm run typecheck && npm run lint && npm run build`.** Esperado: PASS.

- [ ] **Step 6: Commit** `feat: panel screens for cost changes, adjustments, delivery and quick meeting scheduling`
