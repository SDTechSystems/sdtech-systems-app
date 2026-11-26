# SD Tech Systems App — Diseño

Fecha: 2026-11-25 · Estado: **borrador para aprobación de Juan**

## 1. Para qué existe

Juan (SD Tech Systems) vende tres servicios: **páginas web a pedido**, **diseño de
marca** y **software a medida**. Hoy lleva cotizaciones, cobros, reuniones y avance de
proyectos de memoria y por WhatsApp. Con 3 clientes activos ya le cuesta seguir el
hilo, y va a empezar a hacer publicidad: el flujo puede crecer mucho. El riesgo que
quiere evitar es **olvidar un proyecto, un cobro o una reunión, parecer negligente y
perder clientes**.

La app es su centro de control: cotiza, convierte la cotización en proyecto, sigue
fases y fechas, registra anticipos y pagos, lleva suscripciones (hosting,
mantenimiento), agenda reuniones en Google Calendar con avisos, y le da a cada cliente
una página privada donde ve su avance, aprueba cotizaciones y cambios de costo, pide
ajustes y recibe su entrega cuando paga.

**Éxito en 3 meses:** ningún proyecto, cobro ni reunión se le pasa a Juan; cada cliente
puede ver cómo va sin preguntar; cada cambio de precio tiene una aprobación del cliente
que sirve de evidencia al cobrar.

## 2. Metas, no-metas y anti-metas

**Metas**
- Cotizaciones con logo, ítems discriminados, vigencia de 30 días y llave Bre-B.
- Proyectos por servicio con fases y fechas; fases de marca abiertas (sin límite de rondas).
- Anticipos, abonos y saldo por proyecto; compromisos de pago con fecha y recordatorio.
- Suscripciones recurrentes (hosting, mantenimiento, dominio, soporte) con próxima fecha de cobro.
- Portal privado por cliente con aprobaciones (cotización, cambios de costo) y comentarios.
- Factura final con logo, ítems discriminados y QR al portal del cliente.
- Google Calendar: reuniones con Meet y avisos; fechas de entrega y de pago en el calendario.
- Botón de WhatsApp con mensaje prellenado (cobro, reunión, avance, entrega).
- Funciona igual en celular y computador, con datos sincronizados.
- Juan es el único usuario hoy; puede agregar a un socio después.

**No-metas (por ahora)**
- Factura electrónica DIAN.
- Archivos en el Drive de Juan, no en Cloudflare.
- Enviar WhatsApp automáticamente (es un botón que Juan oprime).
- Usuario y contraseña para clientes.
- Que el cliente agende reuniones por su cuenta.
- Pasarela de pago en línea.
- Modo sin internet.
- Portal en inglés (posible fase 2 para clientes en dólares).
- Compartir datos con SD Tech Imports.

**Anti-metas (fallaría aunque funcione)**
- Que un cliente pueda ver datos de otro cliente.
- Que un cambio de costo se aplique al total sin aprobación registrada.
- Que el link de entrega (Drive) se muestre antes de que Juan registre el pago.
- Que registrar algo sea más lento que anotarlo en WhatsApp: si es tedioso, Juan deja de usarla.
- Perder datos.

## 3. Restricciones

- Hosting en Cloudflare (cuenta de Juan), plan gratis.
- Dominio existente `sdtechsystems.dev` (Cloudflare).
- Sin archivos pesados en la nube.
- Montos en enteros: COP en pesos y USD en centavos. Cada cotización o proyecto tiene una sola moneda (por defecto COP); no se mezclan ni se convierten.
- Pagos aceptados: Nequi, Bancolombia, efectivo y transferencia por llave Bre-B.
- Zona horaria: America/Bogota para todas las fechas, avisos y eventos. Teléfonos con indicativo (+57 por defecto) para armar los links de WhatsApp.
- Una cotización aprobada crea un solo proyecto.
- En la cotización solo aparece la llave Bre-B **3058147293 · Davibank** como dato de pago.

## 4. Enfoques considerados

| Enfoque | Qué ofrece | Por qué no / por qué sí |
|---|---|---|
| A. Copiar SD Tech Imports y adaptarla | Más código reutilizado | Guarda datos en un solo dispositivo (IndexedDB) y la nube solo tiene copias; Juan necesita celular y computador sincronizados. Además arrastra todo el punto de venta e inventario. |
| **B. App nueva con piezas de SD Tech Imports y la nube como única fuente de datos** | Sincronización real, portal en vivo, recordatorios desde el servidor | **Elegido por Juan.** Reutiliza stack, estilo, componentes y el patrón de páginas públicas con QR. Pierde el modo sin internet, que aquí no es crítico. |
| C. Herramientas hechas (Invoice Ninja, Notion…) | Rápido de montar | No tiene aprobación de cambios de costo, fases abiertas ni la marca propia; y la herramienta propia es muestra del trabajo de Juan. |

Calendario: Juan eligió **conexión completa con la API de Google Calendar** (frente a un
botón que solo abre el evento prellenado).

## 5. Direcciones y acceso

| Dirección | Para quién | Protección |
|---|---|---|
| `panel.sdtechsystems.dev` | Juan (y socio) | **Cloudflare Access**: entrar con el correo autorizado (código al correo o Google). Se agregan socios por correo. |
| `clientes.sdtechsystems.dev/c/<token>` | Cada cliente | Link privado: token aleatorio de 32 bytes (base64url, ~43 caracteres), uno por cliente, revocable y regenerable. |

Las dos direcciones las sirve el mismo Worker. El API del panel (`/api/admin/*`) solo
responde en el host del panel y verifica el JWT de Cloudflare Access (no confía solo en
el host). El portal:
- envía `noindex` y `Referrer-Policy: no-referrer`;
- solo expone los datos de ese cliente;
- limita intentos por IP para frenar a quien pruebe tokens al azar;
- responde igual a un token inexistente que a uno revocado.

**Roles (mi propuesta):** *dueño* (Juan) tiene todo. *Colaborador* (socio) ve clientes
y proyectos, avanza fases, agrega notas y agenda reuniones; **no** ve ni cambia precios,
pagos, catálogo ni ajustes. Cada acción queda en el historial con quién la hizo.

## 6. Qué hace la app

### 6.1 Inicio: «Pendientes»
Lo primero que ve Juan, ordenado por urgencia:
- reuniones de hoy y mañana (con botón para entrar al Meet);
- entregas y fases que vencen en los próximos 7 días o ya vencidas;
- cobros vencidos y próximos (compromisos de pago y suscripciones);
- cotizaciones por vencer (≤ 5 días) y cotizaciones vencidas sin respuesta;
- novedades del portal: aprobaciones, rechazos, comentarios y pedidos de ajuste;
- **proyectos quietos**: activos sin movimiento en 7 días (configurable). Es la alarma contra «perder el hilo».

Cada tarjeta tiene acciones de un toque: abrir, marcar hecho, registrar pago, botón de WhatsApp.

### 6.2 Clientes
- **Datos:** nombre (obligatorio), WhatsApp, correo, documento (cédula o NIT, opcional), ciudad, empresa y notas.
- **Ficha del cliente:** proyectos, cotizaciones, pagos, suscripciones, reuniones, historial y su link del portal (copiar, compartir por WhatsApp, regenerar).
- **Búsqueda rápida.**

### 6.3 Catálogo
Ítems editables en cualquier momento:
- **Campos:** servicio (web, marca, software o general), nombre, descripción, precio base, moneda y tipo (único, mensual o anual).
- **Precio en cotizaciones ya creadas:** editar el catálogo no cambia cotizaciones existentes; cada ítem se copia al cotizar.

Precios iniciales propuestos (§ 9), que Juan ajusta.

### 6.4 Cotizaciones
- **Número:** consecutivo `COT-0001`.
- **Contenido:** cliente, servicio, moneda y ítems (del catálogo o libres). Cada ítem lleva título, **detalle de lo que se va a hacer**, cantidad y precio. También notas y condiciones (texto por defecto desde Ajustes, editable por cotización).
- **Vigencia:** 30 días desde que se emite. Al vencer, el estado pasa a *vencida* y el portal ya no deja aprobarla. Juan puede «renovar», lo que crea una copia con precios actuales.
- **Estados:** borrador → enviada → aprobada / rechazada / vencida.
- **Aprobación:** la hace Juan desde el panel («el cliente aceptó por WhatsApp», con nota) o el cliente desde el portal, con comentario opcional. Se registra quién, cuándo y una copia exacta de lo aprobado.
- **Anticipo:** porcentaje por cotización (por defecto el de Ajustes, 50%). Al aprobarla se crea el proyecto con sus fases y un compromiso de pago «Anticipo» con fecha (hoy + 3 días por defecto, editable).
- **Documento** (vista imprimible, guardable como PDF, para compartir):
  - encabezado: logo, datos de SD Tech Systems, número y fecha, «Válida hasta»;
  - datos del cliente;
  - tabla de ítems discriminados, subtotal y total;
  - anticipo requerido;
  - pago: «Llave Bre-B 3058147293 · Davibank»;
  - condiciones;
  - nota de que los costos de terceros (dominio, hosting, plataformas) pueden variar;
  - QR al portal.

### 6.5 Proyectos y fases
- **Origen:** nacen de una cotización aprobada, o a mano para trabajos sin cotización.
- **Datos:** servicio, título, descripción, fecha de inicio, **fecha de entrega estimada**, estado (activo, en pausa, entregado, cancelado), total acordado y link de entrega (Drive), que se bloquea hasta el pago.
- **Fases por servicio (plantillas editables en Ajustes):**
  - **Web:** Diagnóstico → Cotización → Contenido → Maqueta → Construcción → Revisión → Publicación → Entrega.
  - **Software:** Diagnóstico → Requerimientos → Propuesta → Desarrollo (una fase por bloque o fase del proyecto) → Pruebas → Entrega → Soporte.
  - **Marca:** Brief → Borrador (propuestas) → Elección → **Ediciones y retoques** → Versión final → Entrega. La fase de ediciones es abierta: cada ronda de cambios del cliente se agrega como una sub-entrada («Ronda 1», «Ronda 2», …) **sin límite**. El sistema solo las cuenta, para que Juan vea cuántas van y decida si cobra extras.
- **Cada fase:** estado (pendiente, en curso, hecha), fecha objetivo (opcional) y nota visible para el cliente (opcional). Las fechas objetivo y la entrega van a Google Calendar.
- **Avance:** el porcentaje que ve el cliente es fases hechas sobre fases totales.

### 6.6 Cambios de alcance y costo (evidencia)
Dos tipos de solicitud dentro del proyecto:
1. **Pedido de ajuste del cliente:** desde el portal, un texto. Llega a Pendientes. Juan puede resolverlo sin costo («hecho») o convertirlo en un cambio de costo.
2. **Cambio de costo:** lo crea Juan con descripción y monto (+ por aumento, − por reducción si el cliente se retracta de algo). Queda *pendiente*, y el cliente lo **aprueba o rechaza en el portal**, con comentario.

Solo los cambios aprobados se suman al total del proyecto. Cada aprobación guarda:
- fecha y hora;
- texto y monto exactos (copia inmutable);
- comentario;
- nombre que el cliente escribe al aprobar («Escribe tu nombre para confirmar»).

Juan también puede marcar un cambio como aprobado por WhatsApp, y queda anotado así.

### 6.7 Pagos y saldo
- **Compromisos de pago:** etiqueta (Anticipo, Abono, Saldo, Cuota N), monto, fecha acordada y estado (pendiente, pagado, vencido). Cada uno crea un evento en el calendario de Juan y aparece en Pendientes.
- **Pagos recibidos:** monto, fecha, medio (Nequi, Bancolombia, efectivo o Bre-B), nota y compromiso que cubre (opcional).
- **Saldo** = total acordado (cotización + cambios aprobados) − pagos.
- **Entrega:** cuando el saldo llega a 0, la app sugiere «liberar entrega», que muestra el link de Drive en el portal. Juan también puede liberarla a mano.

### 6.8 Suscripciones
- **Campos:** cliente, proyecto (opcional), tipo (hosting, dominio, mantenimiento, soporte u otro), monto, moneda, ciclo (mensual o anual), próxima fecha de cobro, proveedor y notas, y estado (activa, pausada o cancelada).
- **Registrar el pago** avanza la próxima fecha un ciclo.
- **Recordatorios:** a Juan en el calendario, y botón de WhatsApp con el mensaje de cobro.
- **Seguridad:** **no se guardan contraseñas de clientes.** Las notas pueden decir dónde están, nunca la clave.

### 6.9 Reuniones (Google Calendar + Meet)
- **Agendar** desde el cliente o el proyecto: título, fecha y hora, duración (30 min por defecto) y notas. Se crea el evento en el calendario de Juan con link de Meet y avisos a **1 día, 1 hora y 15 minutos**.
- **Invitar al cliente:** opcional, con su correo como invitado. Google le envía la invitación.
- **Editar o cancelar** en la app actualiza el evento.
- **WhatsApp:** botón «Enviar recordatorio» con fecha, hora y link de Meet.
- **Portal:** el cliente ve sus próximas reuniones con el link.

**Otros eventos que la app crea en el calendario**, con los mismos tres avisos:
- fecha de entrega del proyecto;
- fechas objetivo de fases;
- compromisos de pago;
- cobros de suscripciones.

Fechas sin hora: evento a las 9:00 a. m. de ese día (configurable). Al marcarlos como
hechos o pagados, se actualizan en el calendario.

**Conexión:** Juan conecta su cuenta de Google una sola vez desde Ajustes (OAuth,
permiso `calendar.events`). El token de renovación se guarda cifrado en la base de
datos. Si Google desconecta la cuenta, Pendientes muestra un aviso para reconectar.

### 6.10 Factura final
> **Actualización (2026-11-26):** la factura final ahora es el **Recibo de pago** (`REC-`), y el cobro previo es la **cuenta de cobro** (`CC-`). Ver [`2026-11-26-cuentas-de-cobro-drive-design.md`](2026-11-26-cuentas-de-cobro-drive-design.md). Lo de abajo queda como historia.

- **Número:** consecutivo `FAC-0001`. Se emite desde el proyecto.
- **Contenido:** logo, datos de SD Tech Systems, número y fecha, datos del cliente, **ítems discriminados** (los de la cotización más cada cambio aprobado en su propia línea), total, pagos recibidos y saldo.
- **Dato de pago:** solo el **QR al portal del cliente**, sin datos bancarios. Ahí el cliente ve su pedido, sus suscripciones y lo que siga en curso.
- **Formato:** imprimible y guardable como PDF, igual que la cotización.
- **Código de verificación:** aleatorio, para que el QR sirva también para comprobar que la factura es auténtica (patrón `/verificar/<código>` de SD Tech Imports).

### 6.11 Botones de WhatsApp
Abren `wa.me/<número>?text=…` con el mensaje ya escrito. Juan solo oprime enviar.

| Plantilla | Datos que incluye |
|---|---|
| Cotización | Saludo, número y link al portal |
| Cobro | Concepto, monto, fecha acordada, llave Bre-B y link al portal |
| Cobro de suscripción | Servicio, monto y fecha |
| Recordatorio de reunión | Fecha, hora y link de Meet |
| Avance | Fase actual y link al portal |
| Entrega lista | Aviso y link al portal |

Las plantillas son editables en Ajustes. Cada envío queda anotado en el historial como
«recordatorio enviado» con la fecha. Así Juan ve cuándo fue el último y no insiste de más.

### 6.12 Portal del cliente
Una página por cliente: `clientes.sdtechsystems.dev/c/<token>`.
- **Diseño:** logo y estilo de SD Tech Systems, pensado para celular.
- **Cotizaciones:** vigentes con **Aprobar** y comentario; también se ven las aprobadas y vencidas.
- **Proyectos:**
  - línea de fases con avance y notas visibles;
  - fecha de entrega estimada y próximas reuniones;
  - **cambios de costo pendientes** con Aprobar / Rechazar y comentario;
  - botón **Pedir un ajuste**;
  - total, pagado y saldo, y compromisos de pago con su fecha;
  - en cobros pendientes, la llave Bre-B con botón de copiar;
  - **Descargar entrega** (link de Drive), solo si está liberada.
- **Suscripciones:** activas, con monto y próxima fecha.
- **Facturas:** emitidas, con su versión imprimible.

**Fuera del portal:** notas internas, costos internos y el historial interno.

### 6.13 Ajustes
- **Empresa:** nombre, logo, teléfono, correo y web.
- **Pagos:** llave Bre-B y banco. Aparte, un texto de pago para cotizaciones en USD (la llave Bre-B es solo para pesos), que Juan llena cuando tenga el primer cliente en dólares.
- **Cotizaciones:** anticipo por defecto (50%), días de vigencia (30) y condiciones por defecto.
- **Plantillas:** de fases y de WhatsApp.
- **Avisos:** días para «proyecto quieto» (7) y hora por defecto de los eventos (9:00).
- **Integraciones y usuarios:** conexión con Google y usuarios autorizados (correo y rol).
- **Datos:** exportar todo a JSON.

### 6.14 Historial
Cada creación, cambio de estado, aprobación, pago y recordatorio enviado queda con
fecha, autor (correo de Access, «cliente vía portal» o «sistema») y detalle. Se ve en la
ficha del cliente y en el proyecto. Es la evidencia para el cobro final.

## 7. Condiciones por defecto de la cotización (propuesta, editables)

1. Esta cotización es válida por 30 días desde su fecha de emisión. Después de ese plazo, los valores se recalculan.
2. Para iniciar se requiere un anticipo del 50%. El saldo se paga antes de la entrega de los archivos finales o la publicación.
3. Los costos de terceros (dominio, hosting, plataformas, licencias, pasarelas de pago) no están incluidos, salvo que aparezcan como ítem. Pueden variar según el proveedor y la tasa de cambio.
4. Los cambios que modifiquen el alcance o el valor se presentan y se aprueban en tu página de seguimiento antes de realizarse.
5. Los archivos finales, accesos y entregables se comparten cuando el pago esté completo.
6. Los tiempos de entrega cuentan desde el pago del anticipo y la entrega de los contenidos necesarios por parte del cliente.

## 8. Arquitectura

- **Frontend:** React + TypeScript + Vite + Tailwind + shadcn/ui. Componentes, estilo e i18n en español reutilizados de SD Tech Imports, sin el punto de venta ni el inventario. Es una PWA instalable en el celular. Hay dos entradas: el panel (SPA) y el portal (páginas livianas renderizadas por el Worker, como `receipt-page.ts` y `tracking-page.ts` de SD Tech Imports).
- **Backend:** un Cloudflare Worker con el API del panel, el API y las páginas del portal, el OAuth de Google y una tarea programada (Cron Trigger) cada hora que:
  - marca cotizaciones vencidas;
  - marca compromisos vencidos;
  - reintenta la sincronización con Google Calendar que haya fallado.
- **Datos:** Cloudflare D1 (SQLite). Fuente única; celular y computador consultan lo mismo. Recuperación con Time Travel de D1 y exportación JSON desde Ajustes.
- **Secretos del Worker:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENC_KEY` y el *audience* de Access. Juan los pega en el panel de Cloudflare; nunca pasan por el chat.
- **Logo:** `portfolio/public/brand/` (`logo-horizontal.png` y `symbol.png`, blancos). Para documentos impresos sobre fondo blanco se genera una versión oscura (`#07111F`) con acento `#00BDE8`.
- **Colores:** `--sd-cyan #00BDE8`, `--sd-blue #2563EB`, `--sd-ink #07111F`, `--sd-muted #A7B9CD`.

### Modelo de datos (resumen)
- `clients`
- `catalog_items`
- `quotes`
- `quote_items`: copia del catálogo al cotizar
- `projects`
- `phases`: con `parent_id` para las rondas de marca
- `change_requests`: `kind` ajuste o costo, monto, estado, copia de lo aprobado, nombre de quien aprueba
- `payment_plans`: compromisos de pago
- `payments`
- `subscriptions`
- `invoices`: con copia de ítems y código de verificación
- `meetings`: con `google_event_id` y link de Meet
- `calendar_links`: entidad → `google_event_id`, para entregas, fases y cobros
- `portal_tokens`: hash del token, cliente y revocado
- `users`: correo y rol
- `activity_log`
- `settings`

Los tokens del portal se guardan como hash (SHA-256). El link completo se muestra solo
en el panel, al crearlo o regenerarlo.

## 9. Catálogo inicial propuesto (COP, editable)

Referencia: agencias en Colombia cobran entre $1.500.000 y $3.500.000 por una landing
page. Estos precios buscan ser asequibles y competitivos para un independiente. Juan
los ajusta antes de usarlos.

| Servicio | Ítem | Precio |
|---|---|---|
| General | Asesoría y diagnóstico | Gratis |
| Web | Landing page (1 página, hasta 6 secciones, WhatsApp, redes, mapa, adaptada a celular, SEO básico, publicación) | $650.000 |
| Web | Sitio informativo (hasta 5 páginas + formulario y galería) | $1.200.000 |
| Web | Catálogo con pedido por WhatsApp (hasta 30 productos) | $1.500.000 |
| Web | Tienda en línea (configuración, 30 productos, pasarela del cliente, capacitación 1 h) | desde $2.200.000 |
| Web | Página adicional | $120.000 |
| Web | Mantenimiento mensual (cambios menores, copias, actualizaciones) | $80.000/mes |
| Web | Gestión de hosting y dominio (más el costo del proveedor) | $25.000/mes |
| Marca | Kit de marca estándar (2 propuestas, logo y versiones, paleta, tipografías, mini guía, 3 stickers, 2 banners, perfil) | $450.000 |
| Marca | Ronda de ajustes adicional | $40.000 |
| Software | Herramienta en Google Sheets con automatizaciones | $500.000 |
| Software | Aplicación a medida · Fase 1 (MVP) | desde $2.500.000 |
| Software | Soporte y mantenimiento mensual | $120.000/mes |
| General | Capacitación adicional | $50.000/hora |

## 10. Configuración que hace Juan (una vez)

1. **Google Cloud:** proyecto, API de Calendar, pantalla de consentimiento publicada y cliente OAuth web con la redirección `https://panel.sdtechsystems.dev/api/google/callback`. Los pasos van en el chat.
2. **Cloudflare Zero Trust (Access):** activar el plan gratis. Puede pedir una tarjeta aunque no cobre. Claude prepara la aplicación de Access para `panel.sdtechsystems.dev`; Juan confirma su correo.
3. **Secretos:** pegar en el Worker los valores del paso 1 cuando Claude indique dónde.
4. **Datos del negocio:** confirmar los precios del catálogo y las condiciones.

## 11. Orden de construcción sugerido

1. Base: Worker, D1, Access, panel vacío, clientes y catálogo.
2. Cotizaciones (documento, portal con aprobación) y paso a proyecto con fases.
3. Pagos, saldo, compromisos, Pendientes y WhatsApp.
4. Google Calendar: reuniones con Meet y eventos de entregas y pagos.
5. Cambios de costo y pedidos de ajuste en el portal; liberar entrega.
6. Suscripciones, factura final con QR y verificación, historial, exportación.

Cada etapa queda usable en producción antes de pasar a la siguiente.

## 12. Decisiones que tomó Claude (revisar)

- Direcciones: `panel.` y `clientes.sdtechsystems.dev`.
- Login del panel con Cloudflare Access.
- Un link de portal por cliente, no uno por proyecto.
- Rol de colaborador sin acceso a dinero.
- Confirmación con nombre escrito al aprobar en el portal.
- Anticipo por defecto del 50% y fecha del anticipo a 3 días.
- «Proyecto quieto» a los 7 días.
- Eventos sin hora a las 9:00 a. m.
- Precios del catálogo (§ 9) y condiciones (§ 7).
- Proyectos en una sola moneda, sin conversión; texto de pago aparte para USD.
- Zona horaria America/Bogota e indicativo +57 por defecto.

## 13. Lo que queda a criterio de quien construye

Esquema exacto de tablas, rutas del API, diseño visual de pantallas dentro del estilo
de la marca, generación del PDF (impresión del navegador o librería), límites de
intentos del portal y estructura de pruebas.
