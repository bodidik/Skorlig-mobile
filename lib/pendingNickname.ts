import { bekleyenSecimOlustur } from "./pendingChoice";

/**
 * Onboarding'de seçilen takma adı, oturum hazır olmadığı anda kaybetmemek
 * için yerelde tutar; oturum açılınca gönderir. Ülke ve takım ile AYNI taban
 * (`pendingChoice.ts`) — üçüncü bir kopya yazmak, gönderim mantığındaki bir
 * düzeltmenin birinde unutulması demekti.
 *
 * ⚠️ ÜLKE/TAKIMDAN BİR FARKI VAR: takma ad REDDEDİLEBİLİR. Ülkede tek ret
 * sebebi "tanımıyorum"du; burada sunucu benzersizlik ve rezerve kelime de
 * denetliyor, yani aynı ad iki kişide çakışabilir. Reddedilen bir adı her
 * açılışta yeniden denemek kuyruğu sonsuza kadar dolu tutar ve kullanıcı
 * adsız kalmaya devam eder — o yüzden dört ret kodu da DÜŞÜRÜLÜR.
 *
 * Düşürülen kayıt kaybolmuş olmuyor: `components/NicknameBackfillPrompt.tsx`
 * adsız kullanıcıyı yakalayıp yeniden soruyor. Yani "sessizce vazgeç" değil,
 * "bu adı bırak, kullanıcıya tekrar sor".
 */
const secim = bekleyenSecimOlustur({
  key: "skorlig.pendingNickname",
  endpoint: "/api/users/set-nickname",
  field: "nickname",
  // api/routes/users.cjs /set-nickname'in döndürdüğü dört ret kodu.
  dropOnError: [
    "NICKNAME_TAKEN",
    "NICKNAME_RESERVED",
    "NICKNAME_INVALID",
    "NICKNAME_LENGTH",
  ],
});

export const savePendingNickname  = secim.save;
export const getPendingNickname   = secim.get;
export const clearPendingNickname = secim.clear;
export const flushPendingNickname = secim.flush;
