import { getApiBase } from "./apiBase";

let serverOffsetMs = 0;

export async function syncServerTime(): Promise<void> {
  try {
    const base = await getApiBase();
    const r = await fetch(`${base}/health`);
    const j = await r.json();

    if (j?.ts) {
      const serverMs = new Date(j.ts).getTime();
      const localMs = Date.now();
      if (Number.isFinite(serverMs)) serverOffsetMs = serverMs - localMs;
    }
  } catch {
    // sessiz fallback
    serverOffsetMs = 0;
  }
} 

export function nowFromServer(): number {
  return Date.now() + serverOffsetMs;
}
