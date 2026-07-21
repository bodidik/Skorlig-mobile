import { useAuth } from "../contexts/AuthContext";

/**
 * Gerçek kullanıcı kimliği = Firebase UID.
 * Kullanıcı giriş yaptıysa her zaman UID döner; param/fallback yalnızca
 * auth henüz çözülmediyse (nadir cold-start anı) devreye girer.
 *
 * Eski `String(qUser || "demo1")` deseninin yerini alır.
 */
export function useUserId(paramUserId?: string | string[]): string {
  const { user } = useAuth();
  if (user?.uid) return user.uid;
  const p = Array.isArray(paramUserId) ? paramUserId[0] : paramUserId;
  return p ? String(p).trim() : "demo1";
}
