import type { Currency } from "./money";

export type { Currency };
export type Role = "owner" | "collaborator";
export type Service = "web" | "marca" | "software" | "general";
export type Billing = "unico" | "mensual" | "anual";

export interface Client {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  document: string | null;
  city: string | null;
  company: string | null;
  notes: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogItem {
  id: string;
  service: Service;
  name: string;
  description: string;
  price: number;
  currency: Currency;
  billing: Billing;
  priceFrom: boolean;
  active: boolean;
  sort: number;
}

export interface Me {
  email: string;
  role: Role;
}

export interface ActivityEntry {
  at: string;
  actor: string;
  action: string;
  detail: unknown;
}

export interface Settings {
  company: { name: string; phone: string; email: string; website: string };
  payment: { brebKey: string; bank: string; usdText: string };
  quotes: { validityDays: number; advancePercent: number; conditions: string };
  phaseTemplates: Record<Service, string[]>;
}

export type QuoteStatus = "draft" | "sent" | "approved" | "rejected" | "expired";

export interface QuoteItem {
  id: string;
  title: string;
  detail: string;
  quantity: number;
  unitPrice: number;
  catalogItemId: string | null;
}

export interface Quote {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  service: Service;
  currency: Currency;
  status: QuoteStatus;
  items: QuoteItem[];
  total: number;
  advancePercent: number;
  advanceAmount: number;
  notes: string;
  conditions: string;
  issuedAt: string | null;
  validUntil: string | null;
  approvedAt: string | null;
  approvedBy: "owner" | "client" | null;
  approvedName: string | null;
  clientComment: string | null;
  projectId: string | null;
  createdAt: string;
}

export type PhaseStatus = "pending" | "in_progress" | "done";

export interface Phase {
  id: string;
  projectId: string;
  parentId: string | null;
  position: number;
  name: string;
  status: PhaseStatus;
  dueDate: string | null;
  clientNote: string | null;
  doneAt: string | null;
}

export type ProjectStatus = "active" | "paused" | "delivered" | "cancelled";

export interface Project {
  id: string;
  clientId: string;
  clientName: string;
  quoteId: string | null;
  service: Service;
  title: string;
  description: string;
  status: ProjectStatus;
  startDate: string | null;
  dueDate: string | null;
  total: number | null;
  currency: Currency | null;
  advancePercent: number | null;
  progress: number;
  phases: Phase[];
  createdAt: string;
}
