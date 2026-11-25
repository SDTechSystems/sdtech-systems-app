# Etapa 4 · Google Calendar: reuniones con Meet y fechas en el calendario — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Juan conecta su Google Calendar una vez y desde la app:
- agenda reuniones con link de Meet y avisos a 1 día, 1 hora y 15 minutos;
- las fechas de entrega, de fases y de cobros aparecen solas en su calendario con los mismos avisos y se actualizan o borran cuando cambian;
- ve las reuniones de hoy y mañana en Pendientes;
- el cliente ve sus próximas reuniones en el portal.

**Architecture:**
- **Conexión con Google:** OAuth 2.0 «web server» con `access_type=offline`. El refresh token se guarda cifrado con AES-GCM (clave `TOKEN_ENC_KEY`) en la tabla `settings`.
- **Llamadas a Google:** un módulo `worker/google/` hace todas las llamadas con `fetch`; en las pruebas se reemplaza.
- **Sincronización:** `syncCalendar(env)` es idempotente. Compara las fechas que deberían estar en el calendario con `calendar_links` y crea, actualiza o borra eventos. Corre después de cada cambio relevante del panel (`ctx.waitUntil`) y cada hora (Cron Trigger).

**Tech Stack:** el de las etapas anteriores; Google Calendar API v3 por REST (sin SDK).

**Spec:** `docs/superpowers/specs/2026-11-25-sdtech-systems-app-design.md` — § 6.9, § 6.1 (reuniones), § 6.11 (recordatorio de reunión), § 6.12 (reuniones en el portal), § 11 etapa 4.

## Global Constraints

- Lo de las etapas 1 a 3 sigue vigente.
- **Secretos del Worker:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `TOKEN_ENC_KEY` (32 bytes en base64). Ningún token de Google aparece en logs, respuestas ni `activity_log`.
- **Permiso pedido a Google:** solo `https://www.googleapis.com/auth/calendar.events`. Redirección: `https://panel.sdtechsystems.dev/api/google/callback`.
- **Calendario:** `primary`. Zona horaria `America/Bogota`, UTC−5 sin horario de verano. Los instantes locales `YYYY-MM-DDTHH:mm` se guardan como `YYYY-MM-DDTHH:mm:00-05:00`.
- **Avisos de todos los eventos:** `reminders: { useDefault: false, overrides: [1440, 60, 15] minutos, method: 'popup' }`.
- **Eventos de fecha sin hora** (entregas, fases, cobros): a las `settings.calendar.eventHour` (por defecto 9) y con 30 minutos de duración.
- **Sin conexión con Google:** las reuniones se guardan igual, sin link de Meet, y la app avisa «Conecta Google Calendar en Ajustes». Si falla un evento, no se pierde nada del panel; la sincronización se reintenta en la siguiente pasada.
- **Si Google responde `invalid_grant`:** se marca `google.status = 'reconnect'` y Pendientes muestra «Reconecta Google Calendar».
- **Solo el owner** conecta o desconecta Google. Cualquier rol agenda reuniones.

## Review Focus

1. **Un cobro que se paga o se borra** debe borrar su evento del calendario, no dejarlo huérfano; el siguiente sync lo hace. Prueba en Task 3.
2. **Reunión a las 7:30 p. m. de Bogotá:** se envía a Google como `…T19:30:00-05:00` y aparece en Pendientes como «hoy», no «mañana» (no usar fechas UTC). Prueba en Tasks 2 y 4.
3. **Google caído o token revocado:** crear una reunión responde 201 con `meetUrl: null` y `googleError`, sin 500. Un sync con `invalid_grant` marca `reconnect` y no lanza error. Prueba en Tasks 2 y 3.
4. **`state` de OAuth falso o vencido** en el callback → 400 y no guarda nada. Prueba en Task 1.
5. **El colaborador** puede agendar reuniones pero no conectar ni desconectar Google (403). Prueba en Tasks 1 y 2.

---

## Estructura de archivos

```
worker/google/crypto.ts     encryptToken(), decryptToken()
worker/google/oauth.ts      authUrl(), exchangeCode(), getAccessToken(), googleStatus()
worker/google/calendar.ts   insertEvent(), patchEvent(), deleteEvent(), REMINDERS
worker/google/sync.ts       desiredEvents(), syncCalendar()
worker/api/google.ts        /api/google/connect, /api/google/callback, /api/admin/google (estado, desconectar, sincronizar)
worker/api/meetings.ts      /api/admin/meetings
worker/db/migrations.ts     + 0004_calendar (meetings, calendar_links, oauth_states)
worker/index.ts             rutas /api/google/*, waitUntil(sync) tras mutaciones, scheduled()
shared/types.ts             + Meeting, GoogleStatus; Pending.meetings: Meeting[]
src/components/GoogleCalendarCard.tsx, MeetingsCard.tsx, MeetingDialog.tsx
```

---

### Task 1: Conexión con Google (OAuth) y token cifrado

**Files:**
- Create: `worker/google/crypto.ts`, `worker/google/oauth.ts`, `worker/api/google.ts`
- Modify: `worker/env.ts`, `worker/db/migrations.ts` (`0004_calendar`), `worker/index.ts`, `worker/settings.ts` (`calendar.eventHour`)
- Test: `test/google-oauth.test.ts`

**Interfaces:**
- Migración `0004_calendar`:
  - `oauth_states(state PK, created_at)`
  - `meetings(id PK, client_id NOT NULL, project_id, title NOT NULL, start_at NOT NULL, duration_min INTEGER NOT NULL DEFAULT 30, notes, invite_client INTEGER NOT NULL DEFAULT 0, google_event_id, meet_url, status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','cancelled')), created_at, updated_at)`
  - `calendar_links(key PK /* 'phase:<id>' | 'delivery:<projectId>' | 'payment:<planId>' */, google_event_id NOT NULL, signature NOT NULL, updated_at)`
- `encryptToken(plain: string, keyB64: string): Promise<string>`: AES-GCM con IV aleatorio de 12 bytes; devuelve `base64(iv).base64(ciphertext)`. `decryptToken(s, keyB64): Promise<string>`.
- `GET /api/google/connect` (owner; requiere sesión de Access):
  - crea un `state` aleatorio (32 bytes base64url) en `oauth_states`;
  - redirige 302 a `https://accounts.google.com/o/oauth2/v2/auth` con `client_id`, `redirect_uri`, `response_type=code`, `scope`, `access_type=offline`, `prompt=consent`, `include_granted_scopes=true` y `state`.
- `GET /api/google/callback?code&state` (owner):
  - valida que `state` exista y tenga menos de 10 minutos; lo borra. Si no → 400 página «No se pudo conectar, intenta de nuevo»;
  - hace POST a `https://oauth2.googleapis.com/token` con `grant_type=authorization_code`;
  - guarda en `settings` la clave `google` con `{ refreshToken: <cifrado>, connectedAt, status: 'ok' }`;
  - redirige 302 a `/ajustes?google=ok`.
- `getAccessToken(env): Promise<string | null>`:
  - usa `grant_type=refresh_token` y lo guarda en memoria del isolate hasta 60 s antes de vencer;
  - `null` si no hay conexión;
  - si Google responde `invalid_grant`, marca `status: 'reconnect'` y devuelve `null`.
- `GET /api/admin/google` → `{ status: 'disconnected' | 'ok' | 'reconnect'; connectedAt: string | null }`. Cualquier rol lo puede leer.
- `DELETE /api/admin/google` (owner): borra la clave `google` y todos los `calendar_links` (sin tocar los eventos ya creados).
- `POST /api/admin/google/sync` (owner): corre `syncCalendar` (Task 3) y devuelve su resumen.

- [ ] **Step 1: Escribir las pruebas que fallan** (con `fetch` simulado):
  - cifrar y descifrar da el mismo texto, y dos cifrados del mismo texto son distintos;
  - `connect` redirige a Google con `access_type=offline`, el `scope` exacto y un `state` guardado;
  - el `callback` con un `state` válido guarda el refresh token cifrado (en la base no aparece el texto plano) y redirige a `/ajustes?google=ok`;
  - el `callback` con un `state` desconocido o de hace 11 minutos → 400 sin guardar;
  - `getAccessToken` con un refresh guardado devuelve el access token simulado;
  - con respuesta `invalid_grant` devuelve `null` y el estado queda `reconnect`;
  - el colaborador en `connect` → 403;
  - `DELETE` deja el estado en `disconnected`.

- [ ] **Step 2: Verla fallar, implementar y correr `npm test`.** Esperado: PASS.

- [ ] **Step 3: Commit** `feat: connect Google Calendar with OAuth and an encrypted refresh token`

---

### Task 2: Reuniones con Meet

**Files:**
- Create: `worker/google/calendar.ts`, `worker/api/meetings.ts`
- Modify: `shared/types.ts`, `worker/index.ts`
- Test: `test/meetings.test.ts`

**Interfaces:**
- `Meeting { id; clientId; clientName; clientPhone: string | null; projectId: string | null; title; startAt: string /* ISO con -05:00 */; durationMin: number; notes: string | null; inviteClient: boolean; meetUrl: string | null; googleEventId: string | null; status: 'scheduled' | 'cancelled' }`
- `insertEvent(token, body, { conference?: boolean; sendUpdates?: 'all' | 'none' }): Promise<{ id: string; hangoutLink?: string }>`: `POST https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=…`.
- `patchEvent(token, id, body, sendUpdates)` y `deleteEvent(token, id, sendUpdates)`. Un `deleteEvent` que recibe 404 o 410 cuenta como éxito.
- Evento de reunión:
  - `summary`: `<title> · <cliente>`;
  - `description`: notas más «Agendada desde el panel de SD Tech Systems»;
  - `start` y `end` con `{ dateTime, timeZone: 'America/Bogota' }`;
  - `conferenceData.createRequest = { requestId: <meeting id>, conferenceSolutionKey: { type: 'hangoutsMeet' } }`;
  - `attendees: [{ email: cliente }]` solo si `inviteClient` y el cliente tiene correo;
  - `reminders` del Global Constraints.
- Rutas (cualquier rol):
  - `GET /api/admin/meetings?clientId=&projectId=&from=` → `{ meetings }`, por defecto las programadas desde hoy, ordenadas por `startAt`.
  - `POST /api/admin/meetings` `{ clientId, projectId?, title, start: 'YYYY-MM-DDTHH:mm', durationMin?, notes?, inviteClient? }` → 201 `{ meeting, googleError: string | null }`.
    - Errores: `invalid_client`, `title_required`, `invalid_start` (formato), `invalid_duration` (entre 15 y 480).
    - Si `inviteClient` y el cliente no tiene correo → 400 `client_without_email`.
  - `PATCH /api/admin/meetings/:id` `{ title?, start?, durationMin?, notes? }` → actualiza el evento en Google (`sendUpdates: 'all'` si invitó al cliente).
  - `DELETE /api/admin/meetings/:id` → `status = 'cancelled'` y borra el evento.
- Cada mutación deja una entrada en `activity_log` (`entity_type: 'client'`, y también `'project'` si hay proyecto).

- [ ] **Step 1: Escribir las pruebas que fallan** (con `fetch` simulado que registra las llamadas):
  - crear una reunión el `2026-12-10T19:30` manda `start.dateTime = '2026-12-10T19:30:00-05:00'`, `conferenceDataVersion=1`, los avisos `[1440, 60, 15]` y guarda `meetUrl` = `hangoutLink`;
  - con `inviteClient` y un cliente con correo, manda `attendees` y `sendUpdates=all`;
  - un cliente sin correo → 400 `client_without_email`;
  - sin Google conectado → 201 con `meetUrl: null` y `googleError: 'not_connected'`;
  - si Google responde 500 → 201 con `googleError: 'google_error'`;
  - cancelar llama a `DELETE` del evento y deja `status: 'cancelled'`;
  - el colaborador puede crear reuniones;
  - `start: '10/12/2026 7pm'` → 400 `invalid_start`.

- [ ] **Step 2: Verla fallar, implementar y correr `npm test`.** Esperado: PASS.

- [ ] **Step 3: Commit** `feat: schedule meetings with Google Meet links and reminders`

---

### Task 3: Fechas del panel en el calendario (sincronización)

**Files:**
- Create: `worker/google/sync.ts`
- Modify: `worker/index.ts` (después de un `POST`, `PATCH` o `DELETE` exitoso en `projects`, `phases`, `payment-plans`, `payments` o `quotes` → `ctx.waitUntil(syncCalendar(env))`; `scheduled()` → `syncCalendar(env)`), `wrangler.jsonc` (`"triggers": { "crons": ["23 * * * *"] }`)
- Test: `test/calendar-sync.test.ts`

**Interfaces:**
- `desiredEvents(db, settings): Promise<Map<string, EventSpec>>`, donde `EventSpec = { summary, description, date }`:
  - `delivery:<projectId>`: proyectos no cancelados ni entregados con `due_date`. `summary`: `Entrega: <título> · <cliente>`.
  - `phase:<phaseId>`: fases no hechas con `due_date`, de proyectos activos. `summary`: `<fase> · <título>`.
  - `payment:<planId>`: compromisos sin pagar de proyectos no cancelados. `summary`: `Cobro: <etiqueta> <monto pendiente> · <cliente>`.
- `signature = sha256(JSON.stringify(spec))`.
- `syncCalendar(env): Promise<{ created: number; updated: number; deleted: number; errors: number; skipped?: 'not_connected' }>`:
  - en `desired` y no en `calendar_links` → `insertEvent` y guarda el link;
  - en los dos con otra firma → `patchEvent` y actualiza la firma;
  - en `calendar_links` y no en `desired` → `deleteEvent` y borra el link;
  - un error por evento se cuenta y no detiene los demás;
  - sin token → `{ skipped: 'not_connected' }` sin llamadas.
- Los eventos van de `eventHour:00` a `eventHour:30`, con los avisos del Global Constraints.

- [ ] **Step 1: Escribir las pruebas que fallan** (con `fetch` simulado):
  - un proyecto aprobado crea un evento `payment:` del anticipo;
  - fijar la fecha de entrega crea `delivery:`;
  - un segundo sync sin cambios no llama a Google;
  - cambiar la fecha de entrega → 1 `PATCH`;
  - pagar el anticipo completo → 1 `DELETE` y el link desaparece;
  - cancelar el proyecto borra los eventos que le quedaban;
  - si Google falla en un evento, los demás igual se crean y `errors` vale 1;
  - sin conexión, no hay llamadas y el resultado es `skipped`.

- [ ] **Step 2: Verla fallar, implementar y correr `npm test`.** Después `npx wrangler deploy --dry-run`. Esperado: PASS, con el cron listado.

- [ ] **Step 3: Commit** `feat: keep delivery, phase and payment dates in Google Calendar`

---

### Task 4: Reuniones en Pendientes y en el portal

**Files:**
- Modify: `worker/api/pending.ts` (`meetings`: reuniones programadas de hoy y mañana, más `google: GoogleStatus`), `worker/portal/page.ts` y `worker/portal/api.ts` (sección «Próximas reuniones» con fecha, hora y botón «Entrar a la reunión» si hay `meetUrl`), `shared/types.ts`
- Test: `test/pending.test.ts` y `test/portal.test.ts` (casos nuevos)

**Interfaces:**
- `Pending.meetings: Meeting[]` (de hoy y mañana en Bogotá, ordenadas) y `Pending.google: { status }`.
- En el portal, las reuniones programadas futuras del cliente, en hora de Bogotá: «Miércoles 10 de diciembre · 7:30 p. m.».

- [ ] **Step 1: Escribir las pruebas que fallan.**
  - con `today = 2026-12-10`, una reunión a las `19:30` de ese día aparece en `meetings`, una de pasado mañana no, y una cancelada no;
  - el portal del cliente muestra «7:30 p. m.» y el link de Meet;
  - el portal de otro cliente no la muestra.

- [ ] **Step 2: Verla fallar, implementar y correr `npm test`.** Esperado: PASS.

- [ ] **Step 3: Commit** `feat: show meetings in pending and on the client portal`

---

### Task 5: Panel: conectar Google, agendar y recordar reuniones

**Files:**
- Create: `src/components/GoogleCalendarCard.tsx`, `src/components/MeetingDialog.tsx`, `src/components/MeetingsCard.tsx`
- Modify: `src/pages/Settings.tsx`, `src/pages/ClientDetail.tsx`, `src/pages/ProjectDetail.tsx`, `src/pages/Home.tsx` (sección «Reuniones de hoy y mañana» con «Entrar al Meet» y «Recordar por WhatsApp», más el aviso de reconexión), `src/lib/whatsapp.ts` (`meetingVars`)
- Test: `test/whatsapp.test.ts` (caso nuevo)

**Interfaces:**
- `meetingVars(meeting, clientName)` → `{ nombre, fecha: 'miércoles 10 de diciembre', hora: '19:30', meet: meetUrl ?? '' }`.
- **GoogleCalendarCard** (Ajustes, owner):
  - estado conectado, desconectado o «Reconecta»;
  - botón «Conectar Google Calendar», que navega a `/api/google/connect`;
  - botones «Sincronizar ahora» y «Desconectar»;
  - un toast «Google Calendar conectado ✅» cuando la URL trae `?google=ok`.
- **MeetingDialog:** título, fecha, hora (inputs nativos), duración (30, 45, 60 o 90 minutos), notas e «Invitar al cliente por correo» (deshabilitado si el cliente no tiene correo).
- **MeetingsCard:** en la ficha del cliente y del proyecto; próximas reuniones con «Entrar al Meet», «Recordar por WhatsApp», «Editar» y «Cancelar».

- [ ] **Step 1: Escribir la prueba que falla** de `meetingVars` con la plantilla `meeting`. Esta pasa a ser `Hola {nombre}, te recuerdo nuestra reunión el {fecha} a las {hora}. Enlace: {meet}`, con `hora` en formato de 24 horas para que no quede «p. m..». El texto esperado es:
  `"Hola María, te recuerdo nuestra reunión el miércoles 10 de diciembre a las 19:30. Enlace: https://meet.google.com/abc-defg-hij"`.

- [ ] **Step 2: Verla fallar e implementar.** Esperado: PASS.

- [ ] **Step 3: Implementar las pantallas** con el estilo de marca (PageHeader, `sd-card`, píldoras y animaciones).

- [ ] **Step 4: Verificar a mano** con `wrangler dev` y Playwright:
  - Ajustes muestra «Conectar Google Calendar»; el botón lleva a `accounts.google.com` con los parámetros correctos (sin completar el login);
  - agendar una reunión sin Google la guarda con el aviso;
  - el Inicio y el portal la muestran.

  La conexión real con Google la prueba Juan en producción.

- [ ] **Step 5: Correr `npm test && npm run typecheck && npm run lint && npm run build`.** Esperado: PASS.

- [ ] **Step 6: Commit** `feat: panel screens to connect Google Calendar and schedule meetings`
