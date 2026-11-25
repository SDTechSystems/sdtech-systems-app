import { useQuery } from "@tanstack/react-query";
import type { Settings } from "../../shared/types";
import { apiGet } from "./api";

export const useSettingsQuery = (enabled = true) =>
  useQuery({ queryKey: ["settings"], queryFn: () => apiGet<{ settings: Settings }>("/api/admin/settings"), enabled, staleTime: 60_000 });
