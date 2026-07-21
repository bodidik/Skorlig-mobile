import { auth } from "./firebase";
import { getApiBase } from "./apiBase";

type FetchOptions = RequestInit & { skipAuth?: boolean };

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { "x-auth-token": token, "x-user-id": user.uid };
}

export async function apiFetch(path: string, opts: FetchOptions = {}): Promise<Response> {
  const base    = await getApiBase();
  const url     = `${base}${path}`;
  const headers = new Headers(opts.headers as HeadersInit);

  if (!opts.skipAuth) {
    const authH = await getAuthHeaders();
    for (const [k, v] of Object.entries(authH)) headers.set(k, v);
  }

  return fetch(url, { ...opts, headers });
}
