import { useAuth } from "../contexts/AuthContext";

/**
 * Firebase UID döner — anonim veya Google fark etmez.
 * Anonim auth otomatik açıldığı için artık "demo1" fallback gerekmez.
 */
export function useUserId(paramUserId?: string | string[]): string {
  const { user } = useAuth();
  if (user?.uid) return user.uid;
  const p = Array.isArray(paramUserId) ? paramUserId[0] : paramUserId;
  return p ? String(p).trim() : "";
}
