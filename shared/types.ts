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
