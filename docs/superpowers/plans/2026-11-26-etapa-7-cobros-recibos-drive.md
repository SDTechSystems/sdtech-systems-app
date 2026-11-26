# Etapa 7 · Cuentas de cobro, recibos de pago, catálogo en píldoras y Drive — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Juan cobra con cuentas de cobro `CC-` (total, parte, anticipo o promesa), emite recibos de pago `REC-` siempre, comparte cada documento como un PDF idéntico en panel y portal, elige ítems del catálogo en píldoras y sube entregas y PDF a Drive sin organizar carpetas a mano.

**Architecture:**
- **Un modelo de documento** (`shared/docs/`) que arman cotización, cuenta de cobro y recibo. Lo consumen dos renderizadores con el mismo orden de bloques: HTML del portal (`worker/portal/doc-html.ts`) y PDF (`src/pdf/`, `@react-pdf/renderer`, cargado solo al generar). El portal descarga el PDF con un script aparte (`dist/pdf/portal.js`).
- **Cuentas de cobro** en tabla nueva `collections` con copia inmutable, enlazadas a promesas (`collection_plans`) y pagos (`payments.collection_id`). Los recibos reutilizan la tabla `invoices`.
- **Drive** con el permiso `drive.file`: el Worker crea carpetas y abre sesiones de subida reanudable; el navegador sube los bytes directo a Google.

**Tech Stack:** React 18 + Vite + Tailwind + shadcn/ui, Cloudflare Worker + D1, Vitest, `@react-pdf/renderer@4.9.2`, `qrcode-generator`, Google Drive API v3.

**Spec:** `docs/superpowers/specs/2026-11-26-cuentas-de-cobro-drive-design.md` (amplía `docs/superpowers/specs/2026-11-25-sdtech-systems-app-design.md`).

## Global Constraints

- **Vigente de etapas anteriores:** `esc()` en todo HTML, JSON obligatorio en el API, `activity_log` en cada cambio, zona America/Bogota, montos enteros (COP en pesos, USD en centavos), dinero solo para el owner (colaborador → 403).
- **Numeración:** `CC-0001` (contador `collection`), `REC-0001` (contador `receipt`). Los `FAC-` ya emitidos se conservan y se siguen viendo y verificando.
- **Copy fijo:**
  - cuenta de cobro: «Para:», «De:», «Por los servicios prestados, el valor a pagar es:», «Fecha acordada de pago:», «Medios de pago:», «Gracias por confiar en SD Tech Systems.»; nunca «DEBE A»;
  - leyenda fiscal por defecto «No responsable de IVA»;
  - medio Tarjeta por defecto: detalle «Datáfono, Bold o Nequi Negocios»;
  - en toda la UI, portal y verificación «Factura» pasa a «Recibo de pago».
- **Medios de pago iniciales** (ids fijos): `breb` «Bre-B» detalle «3058147293 · Davibank» visible; `nequi` «Nequi» detalle vacío visible; `bancolombia` «Bancolombia» oculto; `efectivo` «Efectivo» oculto; `tarjeta` «Tarjeta» visible.
- **Drive:** permiso `https://www.googleapis.com/auth/drive.file` junto a `calendar.events`. Carpetas `SD Tech Systems/Clientes/<cliente>/<proyecto>`. Lo subido queda «cualquiera con el link: lector»; **nunca** se comparte con correos ni se manda aviso. Nunca se comparten la raíz, «Clientes» ni la carpeta de un cliente.
- **PDF:** cada página con encabezado y pie «Página N de M»; el encabezado de la tabla se repite; una fila nunca se parte (`wrap={false}`); los detalles largos ajustan línea. Fuentes DejaVu y colores `#061C45` (navy), `#2563EB` (blue), `#00BDE8` (cyan).
- **Sin cambios de flujo:** cliente → proyecto → pagos → documento sigue igual; la cotización sigue mostrando solo la llave Bre-B como dato de pago.

## Review Focus

1. **Proyecto sin cotización ni total (caso Jen Essence):** con una sola promesa de $450.000, emitir una CC desde esa promesa y luego un recibo funciona; ya no existe `nothing_to_bill`. Prueba en Tasks 4 y 5.
2. **Pago registrado desde Pagos (no desde la CC) contra la promesa enlazada** pone la CC en `paid`; borrar ese pago la devuelve a `pending`. Prueba en Task 4.
3. **PDF con 60 líneas y un detalle de 2.000 caracteres** sale en varias páginas sin lanzar error y con «Página 1 de». Prueba en Task 7.
4. **Google conectado sin permiso de Drive, o desconectado:** emitir CC y recibos sigue funcionando; las rutas de Drive responden 409 `drive_not_connected` y el panel muestra «Reconecta Google para usar Drive». Prueba en Task 8.
5. **Medio de pago viejo o desactivado:** los pagos `breb` ya registrados se muestran como «Bre-B»; un medio desactivado no se acepta en un pago nuevo (400 `invalid_method`) pero sigue mostrándose en los viejos. Prueba en Task 1.

---

### Task 1: Ajustes de empresa, medios de pago configurables y plantillas nuevas

**Files:**
- Modify: `shared/types.ts`, `shared/templates.ts`, `worker/settings.ts`, `worker/db/migrations.ts` (`0007_billing_drive`, parte de pagos), `worker/payments/repo.ts`, `worker/api/payments.ts`, `worker/api/subscriptions.ts`, `src/components/SettingsBusiness.tsx`, `src/components/PaymentsCard.tsx`, `src/components/SubscriptionsCard.tsx`, `src/components/TemplatesCard.tsx`, `src/lib/labels.ts`
- Create: `src/components/PaymentMethodsCard.tsx`, `src/lib/payment-methods.ts`
- Test: `test/settings.test.ts`, `test/payments.test.ts`, `test/subscriptions.test.ts`, `test/templates.test.ts`

**Interfaces:**
- Produces:
  - `PaymentMethod = string` (antes unión cerrada).
  - `PaymentMethodOption { id: string; name: string; detail: string; showOnDocs: boolean; active: boolean }`.
  - `Settings.company` gana `nit: string` (default `""`) y `taxNote: string` (default `"No responsable de IVA"`).
  - `Settings.payment` gana `methods: PaymentMethodOption[]` (default: los cinco de Global Constraints). `brebKey`, `bank` y `usdText` siguen (los usan las plantillas `{llave}`/`{banco}`).
  - `TemplateKey` gana `collection` y `receipt`:
    - `collection`: «Hola {nombre}, te comparto la cuenta de cobro {numero} por {monto}. También la puedes ver en tu página: {link}»; vars `nombre, numero, monto, fecha, link`.
    - `receipt`: «Hola {nombre}, te comparto el recibo de pago {numero} por {monto}. ¡Gracias por tu pago! También lo puedes ver en tu página: {link}»; vars `nombre, numero, monto, link`.
  - `methodLabel(methods: PaymentMethodOption[], id: string): string` en `src/lib/payment-methods.ts` (nombre del medio; si no existe, el id).
  - `activeMethodIds(settings: Settings): string[]` en `worker/payments/repo.ts`; reemplaza `PAYMENT_METHODS`.
- Migración `0007_billing_drive` (este task agrega sus primeras sentencias; Tasks 4, 5 y 8 agregan las suyas a la **misma** migración, todavía sin desplegar): reconstruir `payments` sin el `CHECK` de `method` y con `collection_id TEXT`: `CREATE TABLE payments_new (...)`, `INSERT INTO payments_new SELECT id, project_id, plan_id, amount, paid_on, method, note, created_at, NULL FROM payments`, `DROP TABLE payments`, `ALTER TABLE payments_new RENAME TO payments`, recrear `idx_payments_project` y crear `idx_payments_collection`.

- [ ] **Step 1: Write the failing tests**

```ts
// test/settings.test.ts
it("defaults include NIT, tax note and the five payment methods", async () => {
  const s = await getSettings((await makeEnv()).DB);
  expect(s.company).toMatchObject({ nit: "", taxNote: "No responsable de IVA" });
  expect(s.payment.methods.map((m) => [m.id, m.showOnDocs, m.active])).toEqual([
    ["breb", true, true], ["nequi", true, true], ["bancolombia", false, true], ["efectivo", false, true], ["tarjeta", true, true],
  ]);
  expect(s.payment.methods.find((m) => m.id === "tarjeta")!.detail).toBe("Datáfono, Bold o Nequi Negocios");
});
it("rejects methods with duplicate ids, empty names or bad ids", /* PUT settings → 400 invalid_settings for each */);
// test/payments.test.ts
it("accepts any active configured method and rejects inactive or unknown ones", async () => {
  // desactivar 'bancolombia' en Ajustes → POST pago con 'bancolombia' → 400 invalid_method; 'tarjeta' → 201; 'zelle' → 400
});
it("keeps old payments readable after the payments table rebuild", /* pago 'breb' creado antes de 0007 (insert directo) sigue en loadPayments */);
// test/subscriptions.test.ts
it("pays a subscription with 'tarjeta'", /* 200 */);
// test/templates.test.ts
it("has collection and receipt templates with their variables", /* TEMPLATE_VARS.collection includes 'numero','monto','link' */);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/settings.test.ts test/payments.test.ts test/subscriptions.test.ts test/templates.test.ts`
Expected: FAIL (`nit` undefined, `methods` undefined, `tarjeta` → 400).

- [ ] **Step 3: Implement**

- `mergeSettings`: `payment.methods` del patch reemplaza la lista completa si viene.
- `validSettings`:
  - `methods`: 1–12 ítems;
  - `id` cumple `/^[a-z0-9-]{1,24}$/` y es único;
  - `name` no vacío tras `trim`;
  - `detail` es string;
  - booleanos válidos.
  - El chequeo de «todo string» de `company`/`payment` pasa a ignorar `methods`.
- Validar `method ∈ activeMethodIds(settings)` en pagos de proyecto y de suscripción.
- UI:
  - `PaymentMethodsCard` en Ajustes: lista con nombre, detalle, interruptores «Mostrar en cuentas de cobro» y «Activo», subir/bajar y «Agregar medio» (id generado del nombre en minúsculas sin tildes; si choca, sufijo `-2`).
  - `SettingsBusiness` gana NIT y leyenda fiscal.
  - Los selects de pago (`PaymentsCard`, `SubscriptionsCard`) listan los medios activos y muestran pagos viejos con `methodLabel`. Se borran los `METHOD_LABEL` locales.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: NIT, tax note and editable payment methods in settings"
```

---

### Task 2: Selector del catálogo en píldoras

**Files:**
- Create: `src/components/CatalogPicker.tsx`, `src/lib/catalog-pick.ts`
- Modify: `src/pages/QuoteEditor.tsx` (reemplaza el diálogo de las líneas 222–245 aprox.)
- Test: `test/catalog-pick.test.ts`

**Interfaces:**
- Produces:
  - `CatalogPicker({ open, onOpenChange, currency, defaultService, onAdd }: { open: boolean; onOpenChange(v: boolean): void; currency: Currency; defaultService: Service; onAdd(items: CatalogItem[]): void })`.
  - `catalogLine(item: CatalogItem): { title: string; detail: string; quantity: "1"; price: ""; suggested: string; catalogItemId: string }` en `src/lib/catalog-pick.ts`. `suggested` es el precio en texto (`priceText`), o `""` si el precio es 0.
  - Las líneas del editor (`Line`) ganan `suggested?: string`, usado como `placeholder` de la casilla de valor.
- Comportamiento:
  - pestañas Web · Marca · Software · General (`Tabs`), abriendo en `defaultService`;
  - solo ítems activos de `currency`;
  - píldoras con `flex-wrap`, nombre completo sin precio y sin truncar;
  - tocar alterna ✓; se conserva lo marcado al cambiar de pestaña;
  - botón «Agregar N» deshabilitado con 0;
  - al agregar, cierra y limpia.
  - Una línea con valor vacío no deja guardar: la casilla se marca con `aria-invalid` y el toast dice «Escribe el valor de cada ítem (0 si es gratis)».

- [ ] **Step 1: Write the failing test**

```ts
it("catalogLine leaves the price empty and suggests the catalog price", () => {
  const l = catalogLine({ id: "x", name: "Landing page", description: "Una página", price: 650000, currency: "COP" } as CatalogItem);
  expect(l).toMatchObject({ title: "Landing page", detail: "Una página", quantity: "1", price: "", suggested: "650.000", catalogItemId: "x" });
  expect(catalogLine({ id: "y", name: "Asesoría", description: "", price: 0, currency: "COP" } as CatalogItem).suggested).toBe("");
});
```

- [ ] **Step 2: Run** `npx vitest run test/catalog-pick.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** `catalogLine`, `CatalogPicker` y su uso en `QuoteEditor`.
- [ ] **Step 4: Run** `npx vitest run && npm run typecheck && npm run lint` → PASS. Revisar el selector con Playwright a 390 px de ancho con los 14 ítems del catálogo: sin desborde horizontal y «Agregar 2» tras marcar dos.
- [ ] **Step 5: Commit** `git commit -am "feat: catalog picker with selectable pills and manual prices"`

---

### Task 3: Modelo de documento compartido y HTML del portal unificado

**Files:**
- Create: `shared/docs/model.ts`, `shared/docs/quote.ts`, `shared/docs/receipt.ts`, `shared/words.ts`, `worker/portal/doc-html.ts`
- Modify: `worker/portal/quote-doc.ts`, `worker/portal/invoice-doc.ts` (pasan a armar el modelo y llamar `renderDocHtml`), `worker/portal/api.ts`
- Test: `test/words.test.ts`, `test/doc-model.test.ts`, `test/portal.test.ts`

**Interfaces:**
- Produces (`shared/docs/model.ts`):
  ```ts
  export type DocKind = "quote" | "collection" | "receipt";
  export interface DocLine { title: string; detail: string; quantity: number; unitPrice: number; total: number }
  export type DocClient = Invoice["client"]; // { name; company; document; city; phone; email }
  export interface DocModel {
    kind: DocKind; title: string; number: string; issuedOn: string; currency: Currency; voided: boolean;
    company: { name: string; nit: string; phone: string; email: string; website: string; taxNote: string };
    party: { name: string; lines: string[] };          // «Para:» (cliente) — company, documento, ciudad, teléfono, correo
    from: string | null;                                // «De: SD Tech Systems · NIT …» (solo cuenta de cobro)
    intro: { text: string; amount: number; words: string } | null; // bloque «el valor a pagar es»
    lines: DocLine[];
    totals: { label: string; amount: number; tone: "grand" | "minus" | "balance" | "plain" }[];
    facts: { label: string; value: string }[];          // Válida hasta, Anticipo, Fecha acordada de pago, Proyecto, Saldo del proyecto…
    payment: { title: string; items: { name: string; detail: string }[] } | null;
    links: { label: string; url: string }[];            // Pagar en línea, Tu entrega
    note: string | null; conditions: string[]; thanks: string | null;
    footer: { qrUrl: string; qrCaption: string; verifyCode: string | null; verifyUrl: string | null };
  }
  ```
- `amountInWords(amount: number, currency: Currency): string`: COP en pesos («cuatrocientos cincuenta mil pesos»); USD en centavos («ciento veinte dólares con cincuenta centavos»).
- `quoteDocModel(q: Quote, client: DocClient, settings: Settings, portalUrl: string): DocModel`.
- `receiptDocModel(inv: Invoice, settings: Settings, portalUrl: string): DocModel`. El título es «RECIBO DE PAGO» para todos, también los `FAC-`.
- `renderDocHtml(model: DocModel, opts: { backUrl: string; pdf: boolean }): Response`:
  - el orden de bloques es fijo: logo+empresa → título+número → Para/De+facts → intro → tabla → totales → pago → links → nota → condiciones → gracias → pie (QR, verificación, leyenda fiscal);
  - mantiene el estilo de hoja blanca de `invoice-doc.ts`;
  - en ≤ 640 px la tabla pasa a filas apiladas, sin scroll horizontal;
  - incrusta el modelo en `<script type="application/json" id="doc-model">` con `<` escapado como `<`;
  - con `pdf: true` muestra el botón «Descargar PDF» (Task 7 lo conecta). Hasta entonces muestra «Guardar PDF» con `window.print()`.

- [ ] **Step 1: Write the failing tests**

```ts
// test/words.test.ts
expect(amountInWords(450000, "COP")).toBe("cuatrocientos cincuenta mil pesos");
expect(amountInWords(1_000_000, "COP")).toBe("un millón de pesos");
expect(amountInWords(2_521_000, "COP")).toBe("dos millones quinientos veintiún mil pesos");
expect(amountInWords(0, "COP")).toBe("cero pesos");
expect(amountInWords(12050, "USD")).toBe("ciento veinte dólares con cincuenta centavos");
// test/doc-model.test.ts
it("quote model keeps the Bre-B payment line only", /* payment.items == [{name:'Llave Bre-B', detail:'3058147293 · Davibank'}] */);
it("receipt model titles FAC- and REC- documents as RECIBO DE PAGO", ...);
// test/portal.test.ts
it("escapes '</script>' in a client name inside the embedded doc model", /* HTML no contiene '</script><' del nombre */);
it("portal quote and FAC pages still render at their old URLs with the new layout", /* 200, contiene 'RECIBO DE PAGO' en /factura/FAC-0001 */);
```

- [ ] **Step 2: Run** `npx vitest run test/words.test.ts test/doc-model.test.ts test/portal.test.ts` → FAIL.
- [ ] **Step 3: Implement** el modelo, los dos constructores y `renderDocHtml`. `quote-doc.ts` e `invoice-doc.ts` quedan como funciones delgadas que arman el modelo. Las pruebas existentes del portal siguen pasando, salvo las que cambian «FACTURA» por «RECIBO DE PAGO».
- [ ] **Step 4: Run** `npx vitest run && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `git commit -am "feat: shared document model and unified portal document page"`

---

### Task 4: Cuentas de cobro (backend y portal)

**Files:**
- Create: `worker/collections/repo.ts`, `worker/api/collections.ts`, `shared/docs/collection.ts`
- Modify: `worker/db/migrations.ts` (`0007`), `worker/settings.ts` (`nextNumber`/`formatNumber` aceptan `collection`/`CC`), `worker/api/projects.ts` (rutas), `worker/api/payments.ts` (acepta `collectionId`), `worker/index.ts` (`collections` en `ADMIN` y `CALENDAR_SOURCES`), `worker/portal/api.ts`, `worker/portal/page.ts`, `shared/types.ts`, `src/lib/labels.ts`
- Test: `test/collections.test.ts`

**Interfaces:**
- Migración `0007` (se agrega):
  - `INSERT OR IGNORE INTO counters (name, value) VALUES ('collection', 0), ('receipt', 0)`;
  - `collections(id PK, number UNIQUE NOT NULL, project_id NOT NULL, client_id NOT NULL, issued_at NOT NULL, currency NOT NULL, total INTEGER NOT NULL CHECK(total > 0), due_date, own_plan_id, snapshot NOT NULL, drive_file_id, voided_at, created_at NOT NULL)`;
  - `collection_plans(collection_id NOT NULL, plan_id NOT NULL, PRIMARY KEY(collection_id, plan_id))`;
  - índices por `project_id` y `client_id`.
- Tipos:
  - `CollectionLineSource = "balance" | "advance" | "plan" | "quote" | "change" | "catalog" | "free"`.
  - `CollectionLineInput { source: CollectionLineSource; planId?: string; title: string; detail: string; quantity: number; unitPrice: number }`.
  - `Collection { id; number; projectId; clientId; projectTitle; issuedAt; currency; total; dueDate: string | null; planIds: string[]; paid: number; status: "pending" | "partial" | "paid" | "voided"; lines: DocLine[]; includeDelivery: boolean; deliveryUrl: string | null; paymentUrl: string | null; note: string | null; client: DocClient; methods: { name: string; detail: string }[]; driveFileId: string | null }`.
- Rutas (owner):
  - `GET /api/admin/projects/:id/collections` → `{ collections: Collection[] }`, de la más nueva a la más vieja.
  - `POST /api/admin/projects/:id/collections` con body `{ lines: CollectionLineInput[]; dueDate?: string | null; includeDelivery?: boolean; paymentUrl?: string | null; note?: string | null; addToTotal?: boolean; setTotal?: boolean }` → 201 `{ collection }`.
    - Errores: `lines_required`, `invalid_line` (título vacío, cantidad < 1, valor < 0), `invalid_plan` (plan ajeno o ya pagado), `invalid_date`, `invalid_url` (paymentUrl no `https://`), `delivery_url_required` (includeDelivery sin link), `invalid_amount` (total 0).
  - `POST /api/admin/collections/:id/void` → `{ collection }`. Si `own_plan_id` no tiene pagos, también borra esa promesa.
  - `GET /api/admin/collections/:id` → `{ collection }`.
- Reglas al emitir:
  - **Líneas `plan`:** el servidor fija `quantity=1` y `unitPrice = plan.amount − pagado del plan` (ignora lo que mande el cliente) y enlaza el plan en `collection_plans`.
  - **Promesa propia:** si hay `dueDate`, el servidor suma las líneas que no son `plan`. Si esa suma es mayor que 0, crea una promesa con `label = número`, `amount = suma` y `due_date = dueDate`, y la guarda en `own_plan_id` y en `collection_plans`.
  - **Total del proyecto:**
    - `setTotal` (solo si `projects.total IS NULL`) pone `total = total de la cuenta` y `currency` del proyecto;
    - `addToTotal` (solo si el total no es null) suma las líneas `catalog`+`free`.
    - Cada cambio queda en `activity_log` como `collection_total`, con `{ number, before, after }`.
  - **Copia inmutable (snapshot):** líneas, cliente, `methods` = medios activos con `showOnDocs`, `deliveryUrl` (solo si `includeDelivery`), `paymentUrl`, `note` y `projectTitle`. Para un proyecto en USD, `methods = [{ name: "Pago", detail: settings.payment.usdText }]`.
- **Pagado** = suma de `payments` donde `collection_id = c.id` o `plan_id IN (planes enlazados)`, cada pago una sola vez.
  - `status`: `voided` si `voided_at`; si no, `paid` si pagado ≥ total; si no, `partial` si pagado > 0; si no, `pending`.
- `POST /projects/:id/payments` acepta `collectionId` (debe ser de ese proyecto y no anulada). Si además falta `planId`, el servidor lo pone en el primer plan enlazado sin pagar.
- `collectionDocModel(c: Collection, settings: Settings, portalUrl: string): DocModel`:
  - `from = "SD Tech Systems · NIT <nit>"`; omite « · NIT» si el NIT está vacío;
  - `intro` = «Por los servicios prestados, el valor a pagar es:» con total y letras;
  - fact «Fecha acordada de pago» (formato largo) si hay fecha; fact «Proyecto»;
  - `payment.title = "Medios de pago"`;
  - links «Pagar en línea» y «Tu entrega»;
  - `thanks` = «Gracias por confiar en SD Tech Systems.»
- Portal:
  - `/c/<token>/cobro/<number>` renderiza la cuenta (404 si es de otro cliente);
  - la sección «Cuentas de cobro» lista las no anuladas con número, valor, estado («Pendiente», «Abonada · falta $X», «Pagada») y fecha;
  - dentro de cada proyecto, las cuentas pendientes o abonadas se ven también, con su link;
  - la sección «Tu entrega está lista» del proyecto sigue dependiendo solo de `delivery_released`.

- [ ] **Step 1: Write the failing tests** (`test/collections.test.ts`)

```ts
it("bills a project with no quote and no total from its payment promise (Jen Essence)", async () => {
  // proyecto manual sin total; promesa 'Pago' 450000 al 2026-12-05
  // POST collections { lines:[{source:'plan', planId, title:'Pago', detail:'', quantity:1, unitPrice:1}], setTotal:true }
  // → 201, number 'CC-0001', total 450000, planIds [planId], status 'pending', own_plan_id null; proyecto.total = 450000
});
it("creates its own promise when it has a due date and non-plan lines", /* dueDate '2026-12-05', línea free 200000 → nueva promesa label 'CC-0001' */);
it("adds catalog and free lines to the project total only with addToTotal", /* total 770000 + línea catalog 40000 → 810000; sin addToTotal → 770000 */);
it("is paid when a payment is recorded from Pagos against a linked promise, and pending again when it is deleted", ...);
it("counts a payment registered from the collection once, even if it also names a linked plan", ...);
it("shows 'partial' with an abono", /* pago 200000 de 450000 → partial, paid 200000 */);
it("never takes the client's price for a plan line", /* unitPrice 1 → total 450000 */);
it("rejects includeDelivery without a delivery link", /* 400 delivery_url_required */);
it("voiding deletes its own unpaid promise and keeps linked ones", ...);
it("collaborator gets 403", ...);
it("portal shows the collection with the delivery link when included, while the project delivery stays hidden", ...);
it("portal returns 404 for another client's collection", ...);
```

- [ ] **Step 2: Run** `npx vitest run test/collections.test.ts` → FAIL.
- [ ] **Step 3: Implement** la migración, el repo (`listCollections`, `loadCollection`, `collectionPaid`), las rutas, el modelo y el portal. Agregar a `labels.ts`: `collection_issued` «Emitió una cuenta de cobro», `collection_voided` «Anuló una cuenta de cobro», `collection_total` «Cambió el total con una cuenta de cobro».
- [ ] **Step 4: Run** `npx vitest run && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `git commit -am "feat: collection accounts with promises, linked payments and portal page"`

---

### Task 5: Recibos de pago (backend)

**Files:**
- Modify: `worker/api/invoices.ts`, `worker/invoices/repo.ts`, `worker/db/migrations.ts` (`0007`: `ALTER TABLE invoices ADD COLUMN collection_id TEXT`, `ALTER TABLE invoices ADD COLUMN drive_file_id TEXT`), `worker/settings.ts` (`receipt`/`REC`), `worker/portal/api.ts` (`/recibo/<n>`; `/factura/<n>` sigue), `worker/portal/page.ts` (sección «Recibos de pago»), `worker/portal/verify.ts` («Verificación de recibo», «No encontramos este recibo»), `shared/docs/receipt.ts`, `shared/types.ts`, `src/lib/labels.ts`
- Test: `test/invoices.test.ts`

**Interfaces:**
- `POST /api/admin/projects/:id/invoices` con body opcional `{ lines?: CollectionLineInput[]; paymentIds?: string[]; collectionId?: string }`:
  - **Sin `lines`:**
    - si hay `collectionId`, usa las líneas de esa cuenta;
    - si no, usa las de hoy (ítems de la cotización + cambios aprobados, o el total del proyecto);
    - si no hay nada, error 400 `lines_required` (reemplaza a `nothing_to_bill`, que deja de existir).
  - **`paymentIds` por defecto:**
    - con `collectionId`, los pagos que cuentan para esa cuenta (Task 4);
    - si no, los pagos del proyecto que no estén en otro recibo no anulado.
    - Un id ajeno al proyecto → 400 `invalid_payment`.
  - Número `REC-0001`.
  - Snapshot gana `paymentIds`, `collectionNumber: string | null` y `projectBalance` (saldo del proyecto al emitir).
  - Columnas: `total` = suma de las líneas; `paid` = suma de los pagos elegidos; `balance = total − paid`.
- `Invoice` gana `projectBalance: number | null` (null en los `FAC-` viejos) y `collectionId: string | null`.
- `receiptDocModel`:
  - totales: «Total» y cada pago («Pago <medio> · <fecha>», con `methodLabel`); «Saldo» solo si es mayor que 0;
  - fact «Saldo del proyecto» si `projectBalance` no es null;
  - fact «Cuenta de cobro: CC-…» si viene de una;
  - en `FAC-` viejos, igual que antes.

- [ ] **Step 1: Write the failing tests** (`test/invoices.test.ts`)

```ts
it("issues REC-0001 from a paid collection with its lines and only its payments", /* CC 225000 pagada; proyecto 450000 → total 225000, paid 225000, projectBalance 225000 */);
it("issues a receipt for a project with no quote and no total when lines are given (contado)", /* lines free 120000 + pago 120000 → 201 */);
it("returns lines_required, not nothing_to_bill, when there is nothing to bill", ...);
it("defaults to payments not already in another receipt", ...);
it("keeps FAC-0001 viewable and verifiable after the rename", /* insertar invoice FAC directa → /verificar muestra 'Verificación de recibo' y 'Válida' */);
```
Ajustar las pruebas existentes: `FAC-0001` → `REC-0001`; los totales del recibo pasan a ser de sus pagos elegidos (todos los del proyecto por defecto, así que siguen iguales).

- [ ] **Step 2: Run** `npx vitest run test/invoices.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Etiquetas: `invoice_issued` «Emitió un recibo de pago», `invoice_voided` «Anuló un recibo de pago».
- [ ] **Step 4: Run** `npx vitest run && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `git commit -am "feat: payment receipts REC- with chosen lines and payments"`

---

### Task 6: Panel: editor de cobro/recibo y tarjetas del proyecto

**Files:**
- Create: `src/components/DocEditor.tsx`, `src/components/CollectionsCard.tsx`, `src/lib/doc-lines.ts`
- Rename/Modify: `src/components/InvoicesCard.tsx` → `src/components/ReceiptsCard.tsx`
- Modify: `src/pages/ProjectDetail.tsx` (orden: Entrega → Cuentas de cobro → Recibos de pago → Pagos), `src/components/PaymentsCard.tsx` (botón «Cuenta de cobro» en cada promesa pendiente)
- Test: `test/doc-lines.test.ts`

**Interfaces:**
- Consumes: rutas de Tasks 4–5, `CatalogPicker` y `catalogLine` (Task 2), `methodLabel` (Task 1).
- Produces (`src/lib/doc-lines.ts`, funciones puras):
  - `pendingToBill(summary: PaymentSummary, collections: Collection[]): number` = `max(0, summary.balance − Σ(total − paid) de las cuentas pending/partial)`.
  - `shortcutLines(input: { summary: PaymentSummary; collections: Collection[]; quote: Quote | null; changes: ChangeRequest[]; advancePercent: number }): { key: string; label: string; line: EditorLine }[]`:
    - «Saldo pendiente» solo si `pendingToBill > 0` y el proyecto tiene total;
    - «Anticipo N %» = `round(total × N / 100)` si hay total;
    - una por promesa sin pagar (valor = monto − pagado), con `source: "plan"`;
    - «Ítems de la cotización» y «Cambios aprobados» si existen.
  - `EditorLine { key: string; source: CollectionLineSource; planId?: string; title: string; detail: string; quantity: string; price: string; suggested?: string; locked: boolean }` (`locked` en las de `plan`).
  - `newLinesTotal(lines: EditorLine[]): number`: suma de las líneas `catalog`+`free`.
- `DocEditor({ mode, project, summary, collections, quote, changes, initialPlanIds, fromCollection, onIssued })`, con `mode: "collection" | "receipt"`:
  - **Forma:** `Sheet` abajo en celular y `Dialog` en computador. Arriba, los atajos como píldoras; luego las líneas (editar, subir/bajar, quitar); al final «Del catálogo» y «Línea libre».
  - **Campos (solo en collection):** fecha acordada, interruptor «Incluir link de entrega» (deshabilitado si el proyecto no tiene link, con la nota «Primero guarda un link o sube la entrega»), link de pago y nota.
  - **Casillas de total:** «Usar este valor como total del proyecto» (si `total == null`) o «Sumar $X al total del proyecto» (si `newLinesTotal > 0`), ambas marcadas por defecto.
  - **Solo en receipt:** lista de pagos con casillas, marcadas según el valor por defecto de Task 5.
  - El botón «Emitir» muestra el total.
- `CollectionsCard`:
  - filas con número, fecha, valor, estado (`Pill`: Pendiente slate, Abonada amber, Pagada green, Anulada red) y fecha acordada;
  - acciones: Ver (portal), Enviar y Descargar PDF (Task 7), Registrar pago (abre el diálogo de pago de `PaymentsCard` con `collectionId`, valor pendiente y plan), Emitir recibo (si está pagada) y Anular.
- `ReceiptsCard`: lo que hoy es `InvoicesCard`, con el título «Recibos de pago»; «Emitir recibo» abre `DocEditor` en modo receipt.

- [ ] **Step 1: Write the failing tests** (`test/doc-lines.test.ts`)

```ts
it("pendingToBill subtracts what open collections already bill", /* balance 450000, CC pending 225000 → 225000 */);
it("shortcuts include one locked line per unpaid promise with its remaining amount", ...);
it("no balance or advance shortcut when the project has no total", ...);
it("newLinesTotal counts only catalog and free lines", ...);
```

- [ ] **Step 2: Run** `npx vitest run test/doc-lines.test.ts` → FAIL.
- [ ] **Step 3: Implement** las funciones, el editor y las tarjetas.
- [ ] **Step 4: Run** `npx vitest run && npm run typecheck && npm run lint` → PASS. Con Playwright a 390 px y con `wrangler dev` (o el mock de API que ya usan las capturas del proyecto), verificar el caso Jen Essence: proyecto sin total → promesa → «Cuenta de cobro» → emitir → la tarjeta muestra CC-0001 Pendiente.
- [ ] **Step 5: Commit** `git commit -am "feat: collection and receipt editor and project cards"`

---

### Task 7: PDF idéntico en panel y portal, y envío por WhatsApp

**Files:**
- Create: `src/pdf/DocumentPdf.tsx`, `src/pdf/render.ts`, `src/pdf/portal-entry.ts`, `src/lib/share-pdf.ts`, `vite.pdf.config.ts`, `public/fonts/DejaVuSans.ttf`, `public/fonts/DejaVuSans-Bold.ttf`, `public/fonts/DejaVuSansMono.ttf` (copiados de `/usr/share/fonts/truetype/dejavu/`, con la licencia que ya está en `public/fonts`), `public/brand/logo-color.png` (rasterizado a 3× desde `logo-color.svg` con Playwright)
- Modify: `package.json` (dependencia `@react-pdf/renderer@4.9.2`; `"build": "vite build && vite build -c vite.pdf.config.ts"`), `worker/index.ts` (el host del portal sirve `/pdf/` desde ASSETS), `worker/portal/doc-html.ts` («Descargar PDF» carga `/pdf/portal.js` con `import()` al hacer clic), `src/components/CollectionsCard.tsx`, `src/components/ReceiptsCard.tsx`, `src/pages/QuoteDetail.tsx`
- Test: `test/pdf.test.ts`, `test/share-pdf.test.ts`

**Interfaces:**
- Consumes: `DocModel` y constructores (Tasks 3–5).
- Produces:
  - `DocumentPdf({ model, assetsBase }: { model: DocModel; assetsBase: string })` en `src/pdf/DocumentPdf.tsx`; `registerFonts(assetsBase: string): void` registra `SD Sans` (normal y bold) y `SD Mono` desde `${assetsBase}/fonts/*.ttf`, y el logo sale de `${assetsBase}/brand/logo-color.png`. En el navegador `assetsBase` es el origen (`""`); en las pruebas, la ruta absoluta de `public/`.
  - `renderPdf(model: DocModel, assetsBase = ""): Promise<Blob>` en `src/pdf/render.ts`.
  - `pdfFileName(model: DocModel): string` → `"CC-0003.pdf"`.
  - `sharePdf(opts: { blob: Blob; fileName: string; text: string; phone: string | null; tab?: Window | null }): Promise<"shared" | "downloaded">`:
    - si `navigator.canShare?.({ files: [file] })`, usa `navigator.share({ files: [file], text })`;
    - si no, descarga el archivo y llama a `openWhatsApp(phone, text, tab)`;
    - si el usuario cancela el menú (`AbortError`), devuelve `"shared"` sin error.
  - `src/pdf/portal-entry.ts` (bundle del portal): lee `#doc-model`, llama `renderPdf` y descarga `pdfFileName`.
- `DocumentPdf`:
  - A4 con márgenes de 14 mm; el mismo orden de bloques de `renderDocHtml`;
  - encabezado `fixed` (logo + número) y pie `fixed` con `render={({ pageNumber, totalPages }) => \`Página ${pageNumber} de ${totalPages}\`}`;
  - la fila de encabezados de la tabla es `fixed` dentro de la tabla; cada fila lleva `wrap={false}`;
  - el QR se dibuja con `Svg`/`Rect` a partir de los módulos de `qrcode-generator`;
  - si el documento está anulado, lleva la marca de agua «ANULADA».
- **Panel:** en cada documento (cotización, CC y recibo), «Enviar» (verde, WhatsApp) arma el modelo, genera el PDF y llama `sharePdf` con el texto de la plantilla (`quote`, `collection` o `receipt`); luego `logReminder`. «Descargar PDF» solo descarga.

- [ ] **Step 1: Write the failing tests**

```ts
// test/pdf.test.ts  (archivo .ts: vitest solo incluye test/**/*.test.ts, así que se usa createElement, no JSX)
const PUBLIC_DIR = path.resolve(__dirname, "../public");
it("renders a 60-line collection with a 2,000-character detail into several pages", async () => {
  const buf = await renderToBuffer(createElement(DocumentPdf, { model: bigModel(60, 2000), assetsBase: PUBLIC_DIR }));
  const text = buf.toString("latin1");
  expect((text.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
});
it("renders a one-line receipt into a single page", ...);
// test/share-pdf.test.ts
it("uses the share sheet when files can be shared", /* stub navigator.canShare → true; share llamado con files[0].name 'CC-0003.pdf' */);
it("downloads and opens WhatsApp when files cannot be shared", ...);
it("treats a cancelled share sheet as done", ...);
```

- [ ] **Step 2: Run** `npx vitest run test/pdf.test.ts test/share-pdf.test.ts` → FAIL.
- [ ] **Step 3: Implement.** `vite.pdf.config.ts` compila `src/pdf/portal-entry.ts` como módulo ES con salida fija `dist/pdf/portal.js` (`emptyOutDir: false`, sin PWA). La PWA del panel no precachea `pdf/`: agregar `globIgnores: ["pdf/**"]`.
- [ ] **Step 4: Run** `npx vitest run && npm run typecheck && npm run build` → PASS, y existe `dist/pdf/portal.js`. Generar con Playwright el PDF de una CC de 60 líneas desde el panel y desde el portal, y comparar los dos archivos: mismo número de páginas y mismo texto en cada página (`pdftotext` o `pdf-parse`).
- [ ] **Step 5: Commit** `git commit -am "feat: identical branded PDFs in panel and portal, shared to WhatsApp as files"`

---

### Task 8: Drive (backend)

**Files:**
- Create: `worker/google/drive.ts`, `worker/api/drive.ts`
- Modify: `worker/google/oauth.ts` (scopes, `scopes` guardados, `googleStatus` con `drive: boolean`), `worker/db/migrations.ts` (`0007`: `ALTER TABLE clients ADD COLUMN drive_folder_id TEXT`, `ALTER TABLE projects ADD COLUMN drive_folder_id TEXT`, `ALTER TABLE quotes ADD COLUMN drive_file_id TEXT`, tabla `project_files(id PK, project_id NOT NULL, drive_file_id NOT NULL, name NOT NULL, size INTEGER, created_at NOT NULL)`), `worker/api/projects.ts`, `worker/api/quotes.ts`, `worker/api/clients.ts` (renombrar carpetas), `worker/api/collections.ts` y `worker/api/invoices.ts` (al anular, renombrar el archivo con « (anulada)»), `worker/portal/api.ts` (aprobación desde el portal), `worker/index.ts` (`drive` en `ADMIN`), `test/google-mock.ts` (respuestas de Drive)
- Test: `test/drive.test.ts`, `test/google-oauth.test.ts`

**Interfaces:**
- `GOOGLE_SCOPES = ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/drive.file"]`, unidos con un espacio en `authUrl`. `exchangeCode` guarda `scopes: string` (el campo `scope` de la respuesta).
- `googleStatus(db)` devuelve además `drive: boolean`: true si los scopes guardados incluyen `drive.file`. Una conexión vieja sin `scopes` cuenta como false.
- `worker/google/drive.ts`:
  - `ensureFolder(env, name: string, parentId: string | null): Promise<string>`: crea la carpeta con `mimeType application/vnd.google-apps.folder` y devuelve su id.
  - `ensureClientFolder(env, clientId): Promise<string>` y `ensureProjectFolder(env, projectId): Promise<string>`:
    - la raíz y «Clientes» quedan en `settings` con la clave `drive` (`{ rootId, clientsId }`);
    - si un id guardado responde 404, o la carpeta está en la papelera (`trashed: true`), la vuelven a crear.
  - `startUpload(env, opts: { parentId: string; name: string; mimeType: string; size: number; fileId?: string; origin: string }): Promise<string>`:
    - sin `fileId`: `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id`;
    - con `fileId`: `PATCH .../files/<fileId>?uploadType=resumable`;
    - manda los encabezados `X-Upload-Content-Type`, `X-Upload-Content-Length` y `Origin`, y devuelve el encabezado `Location`.
  - `shareAnyone(env, fileId)`: `POST .../files/<id>/permissions` con `{ role: "reader", type: "anyone" }` y `sendNotificationEmail` sin usar.
  - `renameFile(env, id, name)`.
- Rutas (owner; si falta el permiso de Drive → 409 `drive_not_connected`):
  - `POST /api/admin/drive/uploads` con body `{ target: { type: "delivery"; projectId } | { type: "quote" | "collection" | "receipt"; id }; name; mimeType; size }` → `{ uploadUrl }`.
    - Destino: la carpeta del proyecto, o la del cliente si es una cotización sin proyecto.
    - Si el documento ya tiene `drive_file_id`, la subida reemplaza ese archivo.
    - Errores: `invalid_target`, `invalid_file`.
  - `POST /api/admin/drive/complete` con body `{ target, fileId, name, size }`:
    - `delivery`: inserta en `project_files` y llama `shareAnyone`. Con 1 archivo, el link es `https://drive.google.com/file/d/<id>/view`; con 2 o más, llama `shareAnyone` sobre la carpeta y el link es `https://drive.google.com/drive/folders/<folderId>`. Guarda el link en `projects.delivery_url` y deja `activity_log` `drive_upload`. Responde `{ project }`.
    - documentos: guarda `drive_file_id`. Responde `{ ok: true }`.
  - `GET /api/admin/projects/:id/files` → `{ files }`.
- **Carpetas al crear proyectos:** al crear un proyecto (POST manual, aprobación en el panel o en el portal), `ctx.waitUntil(ensureProjectFolder(...).catch(() => undefined))`. Para eso los handlers reciben `ctx`, o el router llama al hook según la respuesta; queda a criterio del constructor.
- **Renombrar:** un PATCH del nombre del cliente o del título del proyecto renombra su carpeta si existe (mejor esfuerzo, sin fallar la petición).

- [ ] **Step 1: Write the failing tests**

```ts
// test/google-oauth.test.ts
it("asks for calendar.events and drive.file and remembers granted scopes", /* authUrl scope contiene ambos; status.drive true */);
it("an old connection without scopes reports drive: false", ...);
// test/drive.test.ts (mockGoogle con handlers de Drive)
it("creates SD Tech Systems/Clientes/<cliente>/<proyecto> once and reuses the ids", ...);
it("recreates a folder that was trashed", ...);
it("opens a resumable upload in the project folder and returns the Location URL", ...);
it("one delivery file → file link shared with anyone; two → folder link shared with anyone", /* ninguna llamada con type 'user' ni emailAddress */);
it("replaces a document PDF in place when it already has a Drive file", /* PATCH upload con fileId */);
it("returns 409 drive_not_connected without the Drive scope, and issuing a collection still works", ...);
it("collaborator gets 403 on Drive routes", ...);
```

- [ ] **Step 2: Run** `npx vitest run test/drive.test.ts test/google-oauth.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `git commit -am "feat: Drive folders per client and project, resumable uploads and link sharing"`

---

### Task 9: Drive en el panel

**Files:**
- Create: `src/lib/drive-upload.ts`
- Modify: `src/components/GoogleCalendarCard.tsx` (título «Google: Calendar y Drive»; estado de Drive; «Reconectar Google» si `drive` es false), `src/components/DeliveryCard.tsx`, `src/components/CollectionsCard.tsx`, `src/components/ReceiptsCard.tsx`, `src/pages/QuoteDetail.tsx`
- Test: `test/drive-upload.test.ts`

**Interfaces:**
- Consumes: rutas de Task 8, `renderPdf` y `pdfFileName` (Task 7).
- Produces:
  - `uploadToDrive(target: DriveTarget, file: Blob & { name: string }, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<{ fileId: string }>`:
    - pide `uploadUrl` a `/api/admin/drive/uploads` y manda partes de 8 MiB (`8 * 1024 * 1024`) con `PUT` y `Content-Range: bytes a-b/total`;
    - si Google responde 308, sigue desde el `Range` que devuelve;
    - si falla la red, consulta el estado con `PUT` vacío y `Content-Range: bytes */total`, y reintenta hasta 5 veces con espera 1, 2, 4, 8 y 16 s;
    - con 200/201 lee el `id` y llama a `/api/admin/drive/complete`.
  - `saveDocToDrive(target, model: DocModel): Promise<void>`: llama a `renderPdf` y luego a `uploadToDrive`.
- **DeliveryCard:**
  - botón «Subir archivos» con `<input type="file" multiple>`; cada archivo muestra nombre, tamaño, barra de progreso y estado («en cola», «subiendo N %», «listo», «falló · Reintentar»); se suben de uno en uno;
  - debajo queda el formulario de link manual, como hoy;
  - el link actual se muestra con «Copiar» y «Abrir»;
  - sin Drive, se ve «Reconecta Google para usar Drive» con un link a Ajustes, y el link manual sigue disponible.
- **Guardado automático:**
  - tras emitir una CC o un recibo, `saveDocToDrive` corre en segundo plano;
  - tras «Enviar» o «Renovar» una cotización, igual;
  - si falla, un toast con «Reintentar»;
  - cada fila de documento tiene la acción «Guardar en Drive».

- [ ] **Step 1: Write the failing tests** (`test/drive-upload.test.ts`, `fetch` simulado)

```ts
it("uploads 20 MiB in three 8 MiB-aligned chunks and completes", /* Content-Range bytes 0-8388607/20971520, ... ; complete llamado con fileId */);
it("resumes from the Range Google reports after a network error", ...);
it("gives up after 5 retries and rejects", ...);
```

- [ ] **Step 2: Run** `npx vitest run test/drive-upload.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run && npm run typecheck && npm run lint && npm run build` → PASS. Revisar DeliveryCard con Playwright a 390 px con dos archivos en cola: sin desborde.
- [ ] **Step 5: Commit** `git commit -am "feat: upload deliveries and save document PDFs to Drive from the panel"`

---

### Task 10: Cierre

**Files:**
- Modify: `docs/superpowers/specs/2026-11-25-sdtech-systems-app-design.md` (§ 2: la no-meta «Guardar archivos en la nube (solo links de Drive)» pasa a «Archivos en el Drive de Juan, no en Cloudflare»; § 6.10 apunta al diseño nuevo), `README.md` (pasos de § 5.7 del diseño nuevo)
- Test: toda la suite

- [ ] **Step 1:** `npx vitest run && npm run typecheck && npm run lint && npm run build` → todo PASS.
- [ ] **Step 2:** La exportación (`GET /api/admin/export`) incluye `collections`, `collection_plans` y `project_files`. La clave `drive` de `settings` se exporta (solo guarda ids de carpetas, no secretos); la clave `google` sigue fuera. Agregar a `test/export.test.ts`: `expect(Object.keys(tables)).toEqual(expect.arrayContaining(["collections", "collection_plans", "project_files"]))`.
- [ ] **Step 3: Commit** `git commit -am "docs: billing and Drive stage in README and base design"`
