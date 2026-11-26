# Cuentas de cobro, recibos de pago, catálogo en píldoras y Drive — Diseño

Fecha: 2026-11-26 · Estado: **borrador para aprobación de Juan** · Amplía
[`2026-11-25-sdtech-systems-app-design.md`](2026-11-25-sdtech-systems-app-design.md)
(el «diseño base»).

## 1. Para qué

Juan usa la app con su flujo de siempre: crea el cliente, abre el proyecto, anota lo
que pidió, si pagó o no, y saca el documento. Al usarla de verdad encontró cuatro
huecos:

1. **Cobrar lo que aún no le pagan.** Hizo y entregó un trabajo fiado a Jen Essence
   (Jennifer), que paga a principios del mes siguiente. Al intentar facturar, la app
   respondió `nothing_to_bill`: el proyecto no tenía cotización ni total, solo una
   promesa de pago. Además, una factura no es lo mismo que una cuenta de cobro. Juan
   necesita una **cuenta de cobro** en PDF, elegante, para cobrar antes del pago: el
   total, una parte o un anticipo, incluso antes de empezar el trabajo.
2. **El documento de después del pago.** La «factura» de la app no es una factura
   electrónica DIAN; en la práctica es un comprobante. Pasa a llamarse **recibo de
   pago**: cuenta de cobro antes de pagar, recibo después.
3. **Drive a mano.** Hoy sube los archivos a Drive, organiza carpetas y pega el link.
   Quiere subir el archivo desde la app y que quede solo en la carpeta del cliente y
   del proyecto, junto con los PDF de los documentos.
4. **El selector del catálogo se ve desordenado** (lista larga con precios
   desalineados). Lo quiere en píldoras y sin precios fijos: él pone el valor.

**Éxito:** Juan saca la cuenta de cobro de Jen Essence en menos de un minuto, se la
manda por WhatsApp como PDF y la app le recuerda cobrar en la fecha acordada. Nunca
vuelve a abrir Drive para organizar carpetas.

## 2. Metas, no-metas y anti-metas

**Metas**
- Selector del catálogo en píldoras, con selección múltiple y valor que pone Juan.
- Cuentas de cobro `CC-0001` desde el proyecto, flexibles (total, parte, anticipo,
  promesa, líneas del catálogo o libres), con PDF, portal y envío por WhatsApp.
- Recibo de pago (antes «factura») que siempre se pueda emitir, también de contado.
- Medios de pago y NIT configurables en Ajustes.
- PDF bien paginados para cotización, cuenta de cobro y recibo.
- Drive: carpeta por cliente y proyecto creada sola, subida de archivos de cualquier
  tamaño, PDF guardados solos y link de entrega listo para compartir.

**No-metas**
- Factura electrónica DIAN.
- Pasarela de pago o cobro con tarjeta desde la app (Juan cobra con datáfono, Bold o
  Nequi Negocios por fuera; a lo sumo pega un link de Bold).
- Que el cliente suba archivos.
- Usar o reorganizar las carpetas de Drive que Juan ya tiene.
- Cambiar los datos de pago de la cotización (sigue mostrando solo la llave Bre-B,
  como dice el diseño base).
- Cambiar el flujo cliente → proyecto → pagos → documento.

**Anti-metas (fallaría aunque funcione)**
- Que la cuenta de cobro suene a reclamo o amenaza: el tono es cordial.
- Que un PDF se desborde, corte una fila a la mitad o se desacomode con muchas líneas
  o detalles largos.
- Que el link de entrega aparezca en el portal antes de liberarlo, o que Google le
  avise al cliente por correo antes de tiempo.
- Que la app lea o toque el resto del Drive de Juan.
- Que una carpeta de un cliente quede visible para otro, o que la carpeta raíz o la
  de «Clientes» quede compartida.
- Que una cuenta de cobro cambie el total del proyecto sin que Juan lo vea.
- Que sacar una cuenta de cobro sea más lento que escribir un mensaje en WhatsApp.

## 3. Restricciones

- Cloudflare, plan gratis: poco tiempo de CPU por solicitud y tope de tamaño por
  solicitud. El Worker no arma PDF ni recibe archivos grandes.
- Montos en enteros (COP en pesos, USD en centavos); una moneda por proyecto.
- Google: permiso `drive.file` (la app solo ve lo que ella crea). Es un permiso no
  sensible: no exige revisión de Google.
- Todo en español, zona America/Bogota.
- Lo que ya existe sigue funcionando: facturas emitidas, sus números `FAC-` y los
  links de verificación.

## 4. Enfoques considerados (para el PDF y Drive)

| Enfoque | Qué ofrece | Por qué no / por qué sí |
|---|---|---|
| **A. PDF armado en la app (navegador) y subida directa del dispositivo a Drive** | PDF real que se comparte como archivo por WhatsApp y se sube solo a Drive; archivos grandes sin pasar por Cloudflare | **Elegido por Juan.** Cuesta mantener dos versiones de cada documento (página del portal y PDF). |
| B. Seguir con «Imprimir → Guardar PDF» | Una sola versión, nada nuevo | Las tablas largas se cortan mal, hay que guardar y adjuntar a mano y la app no puede subirlo a Drive. |
| C. PDF armado en el Worker | Una sola versión | No cabe en el tiempo de CPU del plan gratis; exigiría el plan pago. |

WhatsApp no permite adjuntar archivos desde un link `wa.me`; por eso el PDF tiene que
existir como archivo en el dispositivo.

## 5. Diseño

### 5.1 Selector del catálogo en píldoras
Reemplaza el diálogo «Agregar del catálogo» de `QuoteEditor` y se reutiliza en el
editor de cuentas de cobro y recibos.

```
Agregar del catálogo                                   ✕
[ Web ] [ Marca ] [ Software ] [ General ]
( Landing page ✓ ) ( Sitio informativo ) ( Página adicional ✓ )
( Catálogo con pedido por WhatsApp ) ( Tienda en línea )
                                          [ Agregar 2 ]
```
- Pestañas por servicio; abre en el servicio del documento. Solo muestra ítems
  activos en la moneda del documento.
- Píldoras con el nombre solo, sin precio. Las píldoras se acomodan en varias líneas
  y los nombres largos no se cortan.
- Tocar marca o desmarca; el botón dice cuántas van. Se pueden marcar ítems de varias
  pestañas antes de agregar.
- Cada ítem agregado llega con título y detalle del catálogo, cantidad 1 y **valor
  vacío**. El precio del catálogo aparece en gris dentro de la casilla como
  sugerencia (placeholder); al escribir desaparece. No se puede guardar una línea sin
  valor (se resalta la casilla); «Gratis» se escribe como 0.

### 5.2 Ajustes: empresa y medios de pago
- **Empresa:** se agregan **NIT** y la leyenda fiscal, por defecto
  «No responsable de IVA». Ambos los escribe Juan.
- **Medios de pago:** lista editable (agregar, editar, ordenar, desactivar). Cada uno:
  nombre, detalle y «mostrar en cuentas de cobro» (sí/no). Arranca con:
  - Bre-B · `3058147293 · Davibank` (de los ajustes actuales)
  - Nequi · número vacío para que Juan lo llene
  - Bancolombia · vacío, oculto en cuentas de cobro
  - Efectivo · oculto en cuentas de cobro
  - Tarjeta · «Datáfono, Bold o Nequi Negocios»
- La misma lista alimenta el selector de medio al **registrar un pago** (proyectos y
  suscripciones). Los pagos ya registrados conservan su medio: los valores actuales
  (`breb`, `nequi`, `bancolombia`, `efectivo`) son los ids de los medios iniciales.
  Un medio desactivado no aparece para pagos nuevos pero sí en los viejos.
- El texto de pago en USD de los ajustes actuales sigue igual. En cuentas de cobro en
  USD se muestra ese texto en vez de la lista.

### 5.3 Cuenta de cobro
**Dónde:** nueva tarjeta «Cuentas de cobro» en el proyecto, junto a Pagos (solo el
dueño; el colaborador no ve dinero). En la tarjeta de Pagos, cada promesa pendiente
tiene además «Cuenta de cobro», que abre el editor ya armado con esa promesa.

**Editor** (hoja en celular, diálogo en computador):
- **Atajos para armar las líneas**, cada uno agrega una línea editable:
  - «Saldo pendiente» (total del proyecto − pagos), si el proyecto tiene total;
  - «Anticipo N %» (el porcentaje del proyecto o el de Ajustes) del total;
  - cada **promesa de pago pendiente** («Anticipo», «Saldo», «Cuota 2»…);
  - «Ítems de la cotización» y «Cambios aprobados», si existen;
  - «Del catálogo» (5.1) y «Línea libre».
- Líneas: título, detalle, cantidad y valor; se pueden editar, reordenar y quitar.
- **Fecha acordada de pago** (opcional).
- **Incluir link de entrega** (interruptor, apagado por defecto; solo si el proyecto
  tiene link).
- **Link de pago** (opcional, por ejemplo de Bold).
- **Nota** (opcional, sale en el documento).
- Si el proyecto **no tiene total**, aparece «Usar este valor como total del
  proyecto», marcado por defecto. Una cuenta de cobro nunca cambia el total por su
  cuenta.

**Al emitir:**
- Número consecutivo `CC-0001` y copia inmutable de lo emitido (líneas, cliente,
  medios de pago visibles, links), como las facturas actuales.
- **Promesa de pago:** si se armó desde una promesa existente, queda enlazada a ella
  (no se duplica). Si no, y hay fecha acordada, se crea una promesa con etiqueta
  «CC-0003», el valor de la cuenta y esa fecha. Así entra a Pendientes y a Google
  Calendar con sus avisos, que es lo que Juan quiere: acordarse de cobrar.
- Se arma el PDF, se guarda en la carpeta de Drive del proyecto (5.6) y se ofrece
  enviarlo (5.5).
- Queda en el historial.

**Estados:** *pendiente* → *pagada* (o *anulada*). Si hay abonos que no completan el
valor, se muestra «abonada · falta $X».
- **Registrar pago** desde la cuenta abre el registro de pago con el valor pendiente y
  la promesa enlazada ya puestos. El pago queda enlazado a la cuenta.
- Cuando lo pagado cubre el valor, la cuenta pasa a *pagada* y la app ofrece
  **«Emitir recibo»** con las mismas líneas.
- **Anular:** como la factura actual; la cuenta sigue existiendo, marcada como anulada.
  Si creó una promesa propia sin pagos, esta también se cancela.

**Documento** (PDF y página del portal, mismo contenido):
```
[logo]                                       SD Tech Systems
                                 NIT … · teléfono · correo · web
CUENTA DE COBRO                                       CC-0003
Para: Jennifer · Jen Essence                Fecha: 26 nov 2026
      CC/NIT … · ciudad · teléfono
De:   SD Tech Systems · NIT …

Por los servicios prestados, el valor a pagar es:
$ 450.000  (cuatrocientos cincuenta mil pesos)

Detalle                               Cant.   Valor    Total
Kit de marca estándar                    1  450.000  450.000
  2 propuestas, logo y versiones…
                                           Total   $ 450.000

Fecha acordada de pago: 5 dic 2026
Medios de pago: Bre-B 3058147293 · Davibank | Nequi … | Tarjeta: datáfono, Bold o Nequi Negocios
[Pagar en línea: link de Bold]   [Tu entrega: link]
Nota: …
Gracias por confiar en SD Tech Systems.
No responsable de IVA                       [QR a tu página]
```
- Redacción cordial (opción A que eligió Juan); nunca «DEBE A».
- Valor en letras en español («pesos» o «dólares»).
- Sin firma.
- Encabezado y pie con «Página 1 de 2» en cada hoja; el encabezado de la tabla se
  repite; una fila nunca se parte entre páginas; los detalles largos ajustan línea.
- Anulada: marca de agua «ANULADA».
- El QR lleva al portal del cliente.

**Portal:** nueva sección «Cuentas de cobro» con estado, valor y fecha acordada; abre
la versión imprimible (`/c/<token>/cobro/CC-0003`). Las pendientes también se ven
dentro de su proyecto.

### 5.4 Recibo de pago (antes «factura»)
- En toda la app, portal y verificación «Factura» pasa a **«Recibo de pago»**. Los
  documentos ya emitidos conservan su número `FAC-…` y siguen verificándose. Los
  nuevos salen como `REC-0001`.
- «Emitir recibo» abre **el mismo editor** de la cuenta de cobro, ya armado con:
  - las líneas de la cuenta de cobro pagada, si viene de ahí;
  - si no, las de hoy (ítems de la cotización más cambios aprobados, o el total del
    proyecto);
  - si no hay nada, vacío para agregar del catálogo o a mano. Ya no existe
    `nothing_to_bill`.
- **Contado:** Juan registra el pago y emite el recibo con los servicios adquiridos.
  Ya hoy son dos toques seguidos; no se fusionan.
- El recibo sigue mostrando total, pagos recibidos y saldo, y el código de
  verificación con QR. Lleva NIT y leyenda fiscal. Mismo PDF paginado, guardado en
  Drive y enviado como la cuenta de cobro.

### 5.5 PDF y envío
- Los PDF (cotización, cuenta de cobro y recibo) se arman **en el navegador** con una
  librería de maquetación de PDF que sabe paginar (por ejemplo `@react-pdf/renderer`),
  cargada solo al generar un documento para no hacer más lenta la app.
- Fuentes y colores de la marca (DejaVu y paleta del diseño base); el PDF se ve igual
  que la página del portal.
- **Enviar** (botón verde de WhatsApp en cada documento):
  - **En el celular,** si el navegador puede compartir archivos, abre el menú de
    compartir con el PDF y el mensaje: Juan elige WhatsApp y el chat.
  - **Si no** (computador), descarga el PDF y abre WhatsApp con el mensaje; Juan
    arrastra el archivo.
  - El mensaje sale de una plantilla nueva editable en Ajustes («Cuenta de cobro»), por
    ejemplo: «Hola {nombre}, te comparto la cuenta de cobro {numero} por {monto}.
    También la puedes ver en tu página: {link}». Igual para el recibo.
  - El envío queda en el historial como recordatorio enviado.
- **Descargar PDF** también disponible por separado.
- El portal sigue con su página HTML y «Guardar PDF» del navegador; no carga la
  librería de PDF.

### 5.6 Google Drive
**Conexión:** el mismo «Conectar Google» de Ajustes pide ahora dos permisos: Calendar
(`calendar.events`, como hoy) y Drive (`drive.file`). Si la conexión actual no tiene
el de Drive, Ajustes y la tarjeta de Entrega muestran «Reconecta Google para usar
Drive». Calendar sigue funcionando sin reconectar.

**Carpetas:**
```
SD Tech Systems/
  Clientes/
    Jen Essence/            ← nombre del cliente
      Kit de marca/         ← título del proyecto
        CC-0003.pdf
        REC-0007.pdf
        kit-marca-final.zip
      COT-0012.pdf          ← cotizaciones aún sin proyecto
```
- La app crea `SD Tech Systems/Clientes` la primera vez, y guarda los ids de carpeta
  de cada cliente y proyecto.
- La carpeta del proyecto se crea **al crear el proyecto** (a mano o al aprobar una
  cotización). Si Google no está conectado o falla, se crea la primera vez que se
  necesite (subir archivo o guardar PDF). Los proyectos que ya existen la reciben
  igual: la primera vez.
- Si Juan renombra el cliente o el proyecto en la app, la carpeta se renombra.
- Si Juan borra una carpeta en Drive, la app la vuelve a crear cuando la necesite.

**PDF automáticos:** al emitir una cuenta de cobro o un recibo, y al enviar o renovar
una cotización, el PDF se sube a la carpeta del proyecto (las cotizaciones sin
proyecto, a la del cliente). Al anular, el archivo se renombra con «(anulada)». Si la
subida falla, el documento igual queda emitido; aparece un aviso con «Reintentar» y
cada documento tiene «Guardar en Drive».

**Subir archivos de entrega** (tarjeta Entrega):
```
Entrega                                       [No liberada]
[ ⬆ Subir archivos ]   o pega un link: [https://…    ] [Guardar]
  kit-marca-final.zip    248 MB   ████████░░ 80 %
  video-promo.mp4        1,2 GB   en cola
Link de entrega: drive.google.com/…   [Copiar] [Abrir]
[ Liberar entrega ]
```
- Uno o varios archivos de cualquier tipo y tamaño (ZIP, videos). Van **directo del
  dispositivo a Drive** por partes, con barra de progreso y reanudación si se corta la
  conexión. El Worker solo abre la subida y nunca recibe el archivo.
- **Permisos de lo subido:** «cualquiera con el link puede ver». Si el cliente tiene
  correo, también se comparte con ese correo, **sin correo de aviso de Google**, para
  no adelantar la entrega.
- **Link de entrega:** con un solo archivo, el link es el del archivo. Con dos o más,
  el link es el de la carpeta del proyecto, que se comparte de la misma forma (el
  cliente vería también sus propios PDF, que son suyos). Se guarda como el link de
  entrega del proyecto, igual que si Juan lo pegara.
- Sigue existiendo pegar un link a mano (Canva, WeTransfer…); si Juan lo pega,
  reemplaza al automático.
- Liberar entrega no cambia: el portal solo muestra el link cuando Juan libera, y la
  cuenta de cobro solo lo lleva si Juan activa el interruptor.
- Solo el dueño sube y cambia el link de entrega, como hoy.

### 5.7 Lo que Juan configura una vez
1. **Google Cloud** (mismo proyecto de Calendar):
   - activar la **Google Drive API**;
   - en la pantalla de consentimiento, agregar el permiso
     `https://www.googleapis.com/auth/drive.file`.
2. **Ajustes → Google → Reconectar**, y aceptar Calendar y Drive.
3. **Ajustes → Empresa:** NIT y leyenda fiscal.
4. **Ajustes → Medios de pago:** número de Nequi y revisar la lista.

## 6. Decisiones que tomó Claude (revisar)

- Medios de pago: una sola lista para documentos y registro de pagos; Bancolombia y
  Efectivo ocultos en cuentas de cobro por defecto.
- La cuenta de cobro crea una promesa de pago solo si tiene fecha acordada y no viene
  de una promesa existente.
- «Usar este valor como total del proyecto» marcado por defecto cuando el proyecto no
  tiene total.
- Estado «abonada · falta $X» para pagos parciales.
- Cuentas de cobro y recibos comparten editor; el recibo de contado sigue siendo
  registrar pago + emitir recibo.
- Con varios archivos de entrega, el link es el de la carpeta del proyecto.
- Compartir con el correo del cliente sin aviso de Google.
- Las cotizaciones guardan su PDF en Drive al enviarlas o renovarlas.
- Recibos nuevos `REC-`, los viejos conservan `FAC-`.
- El portal no genera PDF; usa su página imprimible.

## 7. Lo que queda a criterio de quien construye

Esquema exacto de tablas y migraciones (tabla nueva para cuentas de cobro o una
tabla de documentos con tipo; contadores nuevos), rutas del API, librería concreta de
PDF y formato de fuentes que necesite, tamaño de las partes al subir, cómo se entrega
al navegador la sesión de subida de Drive, conversión de números a letras, diseño
visual exacto dentro de la marca y estructura de pruebas.
