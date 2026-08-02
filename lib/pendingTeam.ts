import { bekleyenSecimOlustur } from "./pendingChoice";

/**
 * Tuttuğu takım seçimi — ülkeyle aynı kısıt: onboarding auth'tan ÖNCE
 * göründüğü için seçim doğrudan gönderilemez, oturum açılınca gönderilir.
 * bkz. lib/pendingChoice.ts
 *
 * ⚠️ ÜLKEDEN FARKI: takım ZORUNLU DEĞİL. Ülkesiz kullanıcı hiçbir ülke
 * grubuna giremediği için onboarding ülke seçmeden ilerletmiyor; takım ise
 * yalnızca "aynı takımı tutanlar" sıralamasını açıyor, atlanabilir.
 *
 * ⚠️ `dropOnError` BOŞ, VE BU BİLİNÇLİ: sunucu tanımadığı takım adını
 * REDDETMİYOR, ham hâliyle kaydediyor (bkz. api/routes/users.cjs
 * set-main-team). Yani düşürülecek kalıcı hata durumu yok; başarısızlık
 * yalnızca ağ kaynaklı olur ve tekrar denenmeli.
 */
const secim = bekleyenSecimOlustur({
  key: "skorlig.pendingTeam",
  endpoint: "/api/users/set-main-team",
  field: "team",
});

export const savePendingTeam = secim.save;
export const getPendingTeam = secim.get;
export const clearPendingTeam = secim.clear;
export const flushPendingTeam = secim.flush;
