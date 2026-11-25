# SD Tech Systems App

Panel de SD Tech Systems para llevar clientes, catálogo de precios y, en las próximas etapas, cotizaciones, proyectos, cobros, reuniones y el portal de seguimiento para clientes.

| Dirección | Para qué |
| --- | --- |
| `https://panel.sdtechsystems.dev` | Panel de Juan (y colaboradores). Protegido con Cloudflare Access. |
| `https://clientes.sdtechsystems.dev` | Portal de clientes. Por ahora es una página temporal. |

Diseño: [`docs/superpowers/specs/2026-11-25-sdtech-systems-app-design.md`](docs/superpowers/specs/2026-11-25-sdtech-systems-app-design.md).

## Cómo está hecho

- **Panel:** React + Vite + Tailwind + shadcn/ui (`src/`). Instalable como app en el celular (PWA).
- **Servidor:** un Cloudflare Worker (`worker/`) que sirve el panel, su API (`/api/admin/*`) y el portal de clientes según el dominio.
- **Datos:** Cloudflare D1 (base SQLite). Es la única fuente, así que celular y computador ven lo mismo. El Worker crea y actualiza las tablas solo, al primer uso (`worker/db/migrations.ts`).
- **Login:** Cloudflare Access pide el correo. El Worker verifica el token de Access y el rol del usuario (dueño o colaborador).
- **Código compartido:** dinero, teléfonos y búsqueda (`shared/`).
- **Marca:** kit oficial SD Tech Systems v1.1: logos SVG en `public/brand/` y DejaVu Sans en `public/fonts/` (licencia incluida).

## Correr en el computador

Node 22 y npm.

```sh
npm ci
cp .dev.vars.example .dev.vars   # pon tu correo
npm run build
npx wrangler dev --local         # http://localhost:8787, entra sin login con DEV_AUTH_EMAIL
```

Pruebas y revisiones:

```sh
npm test
npm run typecheck
npm run lint
```

## Puesta en marcha (una sola vez)

### 1. Conectar el repositorio a Cloudflare

En el panel de Cloudflare: **Workers & Pages → Crear → Importar un repositorio**.

- **Repositorio:** `SDTechSystems/sdtech-systems-app`, rama `main`.
- **Comando de compilación:** `npm run build`.
- **Comando de despliegue:** `npx wrangler deploy`.

En el primer despliegue Cloudflare crea solo:
- la base D1 `sdtech-systems`;
- los dominios `panel.sdtechsystems.dev` y `clientes.sdtechsystems.dev`.

Si el despliegue se queja de la base de datos, créala a mano en **Almacenamiento y bases de datos → D1** con el nombre `sdtech-systems`, y agrega su `database_id` en `wrangler.jsonc`.

### 2. Proteger el panel con Cloudflare Access

**Zero Trust → Access → Aplicaciones → Agregar → Self-hosted:**

- **Nombre:** SD Tech Systems Panel.
- **Dominio:** `panel.sdtechsystems.dev`. Solo el panel; `clientes.` queda público.
- **Política:** «Permitir», con *Emails* igual a tu correo.
- **Al guardar, copia dos datos:**
  - el **Application Audience (AUD) Tag**, de la pestaña de la aplicación;
  - tu **team domain**, en **Zero Trust → Configuración → Personalización**. Tiene la forma `<equipo>.cloudflareaccess.com`.

Si Zero Trust te pide escoger un plan, el **Free** basta (hasta 50 usuarios). Puede pedir una tarjeta aunque no cobre.

### 3. Pegar los secretos en el Worker

**Workers & Pages → sdtech-systems-app → Configuración → Variables y secretos → Agregar**. Usa el tipo **Secreto** en los tres:

| Nombre | Valor |
| --- | --- |
| `OWNER_EMAIL` | Tu correo (el mismo de la política de Access) |
| `ACCESS_TEAM_DOMAIN` | `<equipo>.cloudflareaccess.com` |
| `ACCESS_AUD` | El AUD Tag del paso 2 |

Se usan secretos porque las variables de texto que no están en `wrangler.jsonc` se borran en cada despliegue.

### 4. Agregar a un socio (cuando haga falta)

1. Agrega su correo a la política de Access del paso 2.
2. En el panel, **Ajustes → Usuarios → Agregar**.

Las dos cosas son necesarias: Access lo deja entrar y el panel le da el rol de colaborador. Un colaborador no ve precios, pagos, catálogo ni ajustes.

## Licencia

Código bajo licencia MIT (ver `LICENSE`). Los logos de SD Tech Systems son de la marca y no se incluyen en esa licencia. Tipografía DejaVu: ver `public/fonts/LICENCIA_DejaVu.txt`.
