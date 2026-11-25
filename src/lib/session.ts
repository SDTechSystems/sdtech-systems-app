import { useQuery } from "@tanstack/react-query";
import type { Me } from "../../shared/types";
import { apiGet } from "./api";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => apiGet<Me>("/api/admin/me"), staleTime: 5 * 60_000 });
}
