/**
 * İLK ÜYE HEDİYESİ BİLDİRİMİ.
 *
 * Sunucu (`/api/users/set-nickname`) takma ad İLK kez kaydedildiğinde ilk
 * 200 katılımcıyı 500 LC'ye (300 açılış + 200) tamamlıyor ve yanıtta
 * `ilkUye: { sira, kademe, yatan }` dönüyor (bkz. api/lib/kurucu-lc.cjs).
 *
 * ⚠️ "KURUCU" DENMEZ (kullanıcı kararı 2026-09-30): "Kurucu dersek hak sahibi
 * olurlar." Metin "ilk üyeler" der; sıra numarası da gösterilmez, yalnız
 * grup ("ilk 200").
 *
 * Bildirim ancak GERÇEKTEN LC yattıysa çıkar: bakiyesi zaten üstündeyse
 * (`yatan: 0`) kutlanacak bir şey yok.
 */

import { Alert } from "react-native";
import { t } from "./i18n";

export type IlkUye = { sira: number; kademe: number; yatan: number };

/** Yanıttan bildirimi çıkarır (saf — test edilebilir). Gösterilecek yoksa null. */
export function ilkUyeMesaji(yanit: any): { baslik: string; metin: string } | null {
  const u = yanit?.ilkUye as IlkUye | undefined;
  if (!u || !(Number(u.yatan) > 0) || !(Number(u.sira) > 0)) return null;
  const grup = 200; // tek kademe: ilk 200 katılımcı (2026-09-30 ikinci tur)
  return {
    baslik: t("ilkUyeBaslik"),
    metin: t("ilkUyeMetin", { n: grup, lc: Math.round(Number(u.kademe)) }),
  };
}

export function ilkUyeBildir(yanit: any): boolean {
  const m = ilkUyeMesaji(yanit);
  if (!m) return false;
  Alert.alert(m.baslik, m.metin, [{ text: t("ilkUyeTamam") }]);
  return true;
}
