const EVENTS = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export const REMINDERS = { useDefault: false, overrides: [1440, 60, 15].map((minutes) => ({ method: "popup", minutes })) };

export interface EventBody {
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  attendees?: { email: string }[];
  conferenceData?: unknown;
  reminders?: typeof REMINDERS;
}

export class GoogleError extends Error {
  constructor(readonly status: number) {
    super(`google ${status}`);
  }
}

async function call<T>(token: string, method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (method === "DELETE" && (res.status === 404 || res.status === 410)) return {} as T;
  if (!res.ok) throw new GoogleError(res.status);
  return res.status === 204 ? ({} as T) : ((await res.json()) as T);
}

export function insertEvent(token: string, body: EventBody, opts: { conference?: boolean; sendUpdates?: "all" | "none" } = {}) {
  const q = new URLSearchParams({ sendUpdates: opts.sendUpdates ?? "none" });
  if (opts.conference) q.set("conferenceDataVersion", "1");
  return call<{ id: string; hangoutLink?: string }>(token, "POST", `${EVENTS}?${q}`, { reminders: REMINDERS, ...body });
}

export const patchEvent = (token: string, id: string, body: Partial<EventBody>, sendUpdates: "all" | "none" = "none") =>
  call<{ id: string; hangoutLink?: string }>(token, "PATCH", `${EVENTS}/${encodeURIComponent(id)}?sendUpdates=${sendUpdates}`, body);

export const deleteEvent = (token: string, id: string, sendUpdates: "all" | "none" = "none") =>
  call<unknown>(token, "DELETE", `${EVENTS}/${encodeURIComponent(id)}?sendUpdates=${sendUpdates}`);
