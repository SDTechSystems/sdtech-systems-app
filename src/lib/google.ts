import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";

/** `GET /api/admin/google`: la conexión y si incluye el permiso de Drive. */
export type GoogleStatus = { status: "disconnected" | "ok" | "reconnect"; connectedAt: string | null; drive: boolean };

export const useGoogleStatus = () => useQuery({ queryKey: ["google"], queryFn: () => apiGet<GoogleStatus>("/api/admin/google"), staleTime: 60_000 });

/** Drive se puede usar: Google conectado y con el permiso de Drive. */
export const driveReady = (s: GoogleStatus | undefined): boolean => s?.status === "ok" && s.drive;
