import type { Currency } from "./money";
import type { TemplateKey } from "./templates";

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

/** Medio de pago configurable en Ajustes. `id` es lo que se guarda en cada pago. */
export interface PaymentMethodOption {
  id: string;
  name: string;
  detail: string;
  showOnDocs: boolean;
  active: boolean;
}

export interface Settings {
  company: { name: string; phone: string; email: string; website: string; nit: string; taxNote: string };
  payment: { brebKey: string; bank: string; usdText: string; methods: PaymentMethodOption[] };
  quotes: { validityDays: number; advancePercent: number; conditions: string };
  phaseTemplates: Record<Service, string[]>;
  templates: Record<TemplateKey, string>;
  alerts: { staleDays: number; dueSoonDays: number; quoteExpiringDays: number };
  calendar: { eventHour: number };
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
  deliveryUrl: string | null;
  deliveryReleased: boolean;
  createdAt: string;
}

export type PaymentMethod = string;
export type PlanStatus = "pending" | "overdue" | "paid";

export interface PaymentPlan {
  id: string;
  projectId: string;
  label: string;
  amount: number;
  dueDate: string;
  status: PlanStatus;
  paidAt: string | null;
  paidAmount: number;
}

export interface Payment {
  id: string;
  projectId: string;
  planId: string | null;
  amount: number;
  paidOn: string;
  method: PaymentMethod;
  note: string | null;
}

export interface PaymentSummary {
  currency: Currency;
  /** Total de la cotización (o el acordado a mano). */
  baseTotal: number;
  /** Suma de los cambios de costo aprobados. */
  changesTotal: number;
  total: number;
  paid: number;
  balance: number;
  plans: PaymentPlan[];
  payments: Payment[];
}

export type PendingKind = "payment" | "delivery" | "phase" | "quote_expiring" | "quote_expired" | "portal" | "stale" | "subscription";
export type Urgency = "overdue" | "today" | "soon" | "info";

export interface PendingItem {
  kind: PendingKind;
  title: string;
  subtitle: string;
  date: string | null;
  urgency: Urgency;
  link: string;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  projectId?: string;
  quoteId?: string;
  planId?: string;
  subscriptionId?: string;
  amount?: number;
  currency?: Currency;
  lastReminderAt?: string | null;
}

export interface Pending {
  today: string;
  items: PendingItem[];
  meetings: Meeting[];
  google: { status: "disconnected" | "ok" | "reconnect" };
}

export interface Meeting {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  projectId: string | null;
  title: string;
  startAt: string;
  durationMin: number;
  notes: string | null;
  inviteClient: boolean;
  meetUrl: string | null;
  googleEventId: string | null;
  status: "scheduled" | "cancelled";
}

export type ChangeKind = "adjustment" | "cost";
export type ChangeStatus = "pending" | "approved" | "rejected" | "resolved" | "converted";

export interface ChangeRequest {
  id: string;
  projectId: string;
  kind: ChangeKind;
  description: string;
  amount: number | null;
  status: ChangeStatus;
  requestedBy: "client" | "owner";
  decidedBy: "client" | "owner" | null;
  approvedName: string | null;
  clientComment: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export type SubscriptionKind = "hosting" | "dominio" | "mantenimiento" | "soporte" | "otro";
export type SubscriptionStatus = "active" | "paused" | "cancelled";

export interface Subscription {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  projectId: string | null;
  kind: SubscriptionKind;
  name: string;
  amount: number;
  currency: Currency;
  cycle: "mensual" | "anual";
  nextDue: string;
  provider: string | null;
  notes: string | null;
  status: SubscriptionStatus;
  lastPaidOn: string | null;
}

export interface InvoiceLine {
  title: string;
  detail: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

/** Recibo de pago (antes «factura»): REC-… los nuevos; los FAC-… viejos conservan su número. */
export interface Invoice {
  id: string;
  number: string;
  projectId: string;
  clientId: string;
  issuedAt: string;
  currency: Currency;
  total: number;
  paid: number;
  balance: number;
  verifyCode: string;
  voided: boolean;
  projectTitle: string;
  lines: InvoiceLine[];
  payments: { paidOn: string; method: PaymentMethod; amount: number }[];
  /** Los pagos que cubre este recibo ([] en los FAC- viejos). */
  paymentIds: string[];
  /** Saldo del proyecto al emitir (null en los FAC- viejos y si el proyecto no tenía total). */
  projectBalance: number | null;
  collectionId: string | null;
  collectionNumber: string | null;
  client: { name: string; company: string | null; document: string | null; city: string | null; phone: string | null; email: string | null };
}

/** De dónde sale una línea de la cuenta de cobro. Solo `catalog` y `free` son trabajo nuevo. */
export type CollectionLineSource = "balance" | "advance" | "plan" | "quote" | "change" | "catalog" | "free";

export interface CollectionLineInput {
  source: CollectionLineSource;
  planId?: string;
  title: string;
  detail: string;
  quantity: number;
  unitPrice: number;
}

export type CollectionStatus = "pending" | "partial" | "paid" | "voided";

/** Cuenta de cobro (CC-0001): copia inmutable de lo emitido más lo pagado hoy. */
export interface Collection {
  id: string;
  number: string;
  projectId: string;
  clientId: string;
  projectTitle: string;
  issuedAt: string;
  currency: Currency;
  total: number;
  dueDate: string | null;
  planIds: string[];
  /** Los pagos que cuentan para `paid` (para preseleccionarlos al emitir el recibo). */
  paymentIds: string[];
  paid: number;
  status: CollectionStatus;
  lines: InvoiceLine[];
  includeDelivery: boolean;
  deliveryUrl: string | null;
  paymentUrl: string | null;
  note: string | null;
  client: Invoice["client"];
  methods: { name: string; detail: string }[];
  driveFileId: string | null;
  /** Las líneas de trabajo nuevo que esta cuenta sumó al total del proyecto (salen como líneas propias en un recibo). */
  addedLines: InvoiceLine[];
  /** Lo que la cuenta le sumó al total base del proyecto (0 si no lo cambió). */
  totalDelta: number;
}
