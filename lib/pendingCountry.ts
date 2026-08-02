import { bekleyenSecimOlustur } from "./pendingChoice";

/**
 * Ülke seçimi onboarding'de yapılır ama oturum (Firebase user) o an henüz
 * hazır olmayabilir. Eski akışta `if (country && user)` koşulu yüzünden seçim
 * sessizce kayboluyordu — 839 kullanıcının 837'sinin ülkesiz kalmasının sebebi.
 *
 * Çözüm: seçim önce yerelde saklanır, oturum açılır açılmaz sunucuya gönderilir.
 * Gönderim başarılı olana kadar kayıt durur; her açılışta tekrar denenir.
 *
 * ⚠️ Gövde `lib/pendingChoice.ts`'e taşındı — takım seçimi aynı deseni
 * kullanıyor ve iki kopya tutmak, düzeltmenin birinde unutulması demekti.
 * Dışa açık işlev adları ve davranış DEĞİŞMEDİ.
 */
const secim = bekleyenSecimOlustur({
  key: "skorlig.pendingCountry",
  endpoint: "/api/users/set-country",
  field: "country",
  // Sunucu ülkeyi tanımadıysa tekrar denemenin anlamı yok.
  dropOnError: ["COUNTRY_NOT_SUPPORTED"],
});

export const savePendingCountry = secim.save;
export const getPendingCountry = secim.get;
export const clearPendingCountry = secim.clear;

/**
 * Bekleyen ülkeyi sunucuya gönderir. Oturum hazır olduğunda çağrılır.
 * @returns kaydedilen ülke, gönderilecek bir şey yoksa veya başarısızsa null
 */
export const flushPendingCountry = secim.flush;
