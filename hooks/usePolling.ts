import { useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useIsFocused } from "@react-navigation/native";

/**
 * Yalnızca ekran GÖRÜNÜRKEN ve uygulama ÖN PLANDAYKEN yoklama yapar.
 *
 * NEDEN: Ekranlar `setInterval`'ı doğrudan kuruyordu. İki sızıntı vardı:
 *
 *   1) SEKME ARKA PLANI — expo-router sekmeleri ilk ziyaretten sonra mount'ta
 *      kalır. Arena sekmesi bir kez açıldıysa, kullanıcı Maçlar sekmesinde
 *      otururken bile 15 saniyede bir istek atmaya devam ediyordu.
 *   2) UYGULAMA ARKA PLANI — kullanıcı uygulamadan çıktığında timer'lar
 *      durmuyordu; işletim sistemi eninde sonunda kısar ama bu arada boşuna
 *      istek ve pil tüketimi olur.
 *
 * 500k kullanıcı ölçeğinde bu, sunucuya giden isteklerin büyük bölümünün
 * kimsenin bakmadığı ekranlar için harcanması demek.
 *
 * İki sorumluluk BİLEREK ayrılmıştır:
 *   • "görünür olunca tazele" → yalnızca odak/ön plan geçişinde tetiklenir
 *   • "tur temposu"           → yalnızca zamanlayıcıyı yönetir
 * Birleşik olsaydı `intervalMs` değiştiğinde (ör. maç canlıya geçince aralık
 * 60sn→20sn) gereksiz bir ek istek daha atılırdı.
 *
 * @param fn         her turda çağrılacak iş
 * @param intervalMs tur aralığı; null/0 → zamanlayıcı kurulmaz ama ekran
 *                   görünür olduğunda yine bir kez tazelenir
 */
export function usePolling(
  fn: () => void | Promise<void>,
  intervalMs: number | null
) {
  const isFocused = useIsFocused();
  const savedFn = useRef(fn);
  const [active, setActive] = useState(
    () => AppState.currentState === "active"
  );

  // İşi ref'te tut: fn her render'da yeniden oluşsa bile timer sıfırlanmasın.
  useEffect(() => {
    savedFn.current = fn;
  }, [fn]);

  // ── Ön plan/arka plan takibi ────────────────────────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      setActive(next === "active");
    });
    return () => sub.remove();
  }, []);

  // ── Görünür olunca bir kez tazele ───────────────────────────────────────
  // Kullanıcı sekmeye/uygulamaya döndüğünde bayat veri görmesin; aksi halde
  // ilk aralık dolana kadar eski skor ekranda kalırdı.
  useEffect(() => {
    if (isFocused && active) savedFn.current();
  }, [isFocused, active]);

  // ── Tur zamanlayıcısı ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isFocused || !active || !intervalMs || intervalMs <= 0) return;
    const id = setInterval(() => savedFn.current(), intervalMs);
    return () => clearInterval(id);
  }, [isFocused, active, intervalMs]);
}
