import { useEffect, useRef, useState } from "react";
import type { Project } from "../../shared/types";
import { uploadToDrive, type DriveTarget } from "./drive-upload";
import { errorMessage } from "./labels";

export type UploadState = "queued" | "uploading" | "done" | "failed";
export type UploadItem = { key: number; file: File; state: UploadState; progress: number; error?: string };

let nextKey = 1;

/**
 * La cola de «Subir archivos»: sube de a un archivo, en el orden en que se eligieron.
 * `onUploaded` recibe el proyecto que devuelve el Worker (con el link de entrega nuevo).
 */
export function useDriveUploads(target: DriveTarget, onUploaded: (project: Project | undefined) => void) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const running = useRef(false);
  const latest = useRef({ target, onUploaded });
  latest.current = { target, onUploaded };

  const patch = (key: number, change: Partial<UploadItem>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...change } : i)));

  useEffect(() => {
    if (running.current) return;
    const next = items.find((i) => i.state === "queued");
    if (!next) return;
    running.current = true;
    patch(next.key, { state: "uploading", progress: 0, error: undefined });
    uploadToDrive(latest.current.target, next.file, (progress) => patch(next.key, { progress })).then(
      (r) => {
        running.current = false;
        patch(next.key, { state: "done", progress: 1 });
        latest.current.onUploaded(r.project);
      },
      (e) => {
        running.current = false;
        patch(next.key, { state: "failed", error: errorMessage(e) });
      },
    );
  }, [items]);

  return {
    items,
    add: (files: Iterable<File>) => {
      // Se copian ya: el FileList del input se vacía cuando se limpia el campo.
      const added = Array.from(files, (file): UploadItem => ({ key: nextKey++, file, state: "queued", progress: 0 }));
      setItems((list) => [...list, ...added]);
    },
    retry: (key: number) => patch(key, { state: "queued", progress: 0 }),
  };
}
