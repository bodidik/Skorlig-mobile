/**
 * Bir sıralama/turnuva satırının EKRANDA GÖSTERİLECEK adı.
 *
 * ⚠️ KULLANICI BİLDİRİMİ (2026-09-03): "Kullanıcı isimlerimiz sıralamalarda,
 * turnuvalarda çıkmıyor, yerine harfli-rakamlı uzun kodsal bir şeyler çıkıyor."
 *
 * Kök neden İKİ KATMANLIYDI ve ikisi de ölçüldü:
 *   1. API satırlarında AD ALANI HİÇ YOKTU (`/api/leaderboard`, `/api/rt/totals`,
 *      turnuva katılımcıları) — sunucu tarafında düzeltildi, `displayName` eklendi.
 *   2. Mobil taraf `{row.userId}` basıyordu. Ölçüldü: 65 tsx dosyasında ham
 *      `userId` basan 8 JSX metin düğümü vardı — `kings.tsx` satırının hemen
 *      üstündeki yorum "Kullanıcı adı" diyordu ve bastığı şey UID'ydi.
 *
 * ⚠️ TEK KAYNAK: bu depoda "aynı kural iki yerde" defalarca ayrıştı. Sekiz
 * ekranın hepsi buradan geçsin ki biri güncellenip öteki kalmasın.
 *
 * ⚠️ YEDEK DAVRANIŞ BİLEREK `userId`: bir uç henüz `displayName` döndürmüyorsa
 * ekran BUGÜNKÜ hâlini korur — yani bu yardımcı hiçbir yüzeyde gerileme
 * üretmez, yalnızca ad geldiğinde onu gösterir.
 */
export type AdliSatir = {
  displayName?: string | null;
  nickname?: string | null;
  userId?: string | null;
};

export function gorunenAd(satir: AdliSatir | null | undefined, yedek = ""): string {
  if (!satir) return yedek;
  const ad = satir.displayName || satir.nickname || "";
  if (ad) return String(ad);
  const uid = satir.userId ? String(satir.userId) : "";
  return uid || yedek;
}
