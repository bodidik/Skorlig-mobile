/**
 * TAKMA AD — öneri üretimi ve yerel ön kontrol.
 *
 * ⚠️ NEDEN VAR (ölçüldü 2026-09-20, canlı `/api/leaderboard?limit=5000`):
 * 1766 satırın 1760'ı bot, 6'sı insan — ve insanların **5'i** ekranda ham
 * Firebase kimliği olarak görünüyordu ("ApdTA2V9…"). Botlar okunabilir
 * ("InterMilano11"), gerçek oyuncular değil.
 *
 * Kök neden zincirin ORTASININ hiç dolmaması:
 * `api/lib/ad-cozucu.cjs adiSec` sırayla `nickname → displayName →
 * kısaltılmış kimlik` bakıyor, ama `displayName` alanı
 * `api/lib/users-store.cjs` içinde **0 kez** geçiyor — hiçbir kod yolu onu
 * yazmıyor. Yani zincir pratikte `nickname → kısaltma`. Takma ad da yalnızca
 * Profil sekmesinin içine gömülüydü; onboarding hiç sormuyordu.
 *
 * ⚠️ GOOGLE ADI SESSİZCE KAYDEDİLMİYOR, yalnızca ÖNERİLİYOR. Sunucu
 * doğrulanmış jetonda adı zaten görüyor (`req.firebaseUser.name`,
 * `routes/auth-firebase.cjs`) ve onu kaydetmek tek satırlık bir düzeltme
 * olurdu — YAPILMADI. İki sebep:
 *   1. Kişinin Google hesabındaki gerçek adını ona sormadan herkese açık
 *      sıralamaya basmak, çözdüğü sorundan büyük bir sorun açar.
 *   2. Giriş iki yollu: `contexts/AuthContext.tsx` oturum yoksa OTOMATİK
 *      anonim giriş açıyor. Anonim kullanıcının Google adı hiç yok, yani
 *      sunucu tarafı düzeltme bu sınıfın yarısını zaten kapatmazdı.
 * Öneri bu yüzden yalnızca İLK ADI alır — soyadı hiçbir yerde yayımlanmaz.
 *
 * ⚠️ KURALLARIN İKİNCİ KOPYASI DEĞİL. Rezerve kelime ve benzersizlik
 * denetimi SUNUCUDA (`api/routes/users.cjs` `/set-nickname`) ve buraya
 * kopyalanmadı: kurallardan biri değişince iki tarafın ayrışması bu depoda
 * tekrar eden kusur şekli. Burada yalnızca (a) sunucunun da uyguladığı
 * uzunluk sınırı, (b) öneriyi sunucunun KABUL EDECEĞİ karakter kümesine
 * indirgeme var. Geri kalan her ret sunucudan gelir ve ekranda gösterilir.
 */

/** Sunucudaki sınırla aynı: `routes/users.cjs` NICKNAME_LENGTH dalı. */
export const AD_MIN = 2;
export const AD_MAX = 20;

/**
 * Sunucunun kabul ettiği küme: harf, rakam, boşluk, nokta, alt çizgi, tire
 * (`/^[\p{L}\p{N} ._-]+$/u`). Buradaki desen onun TAMAMLAYICISI — yani
 * sunucunun reddedeceği karakterleri atar. Emoji, tırnak, eğik çizgi gider.
 */
const GECERSIZ_KARAKTER = /[^\p{L}\p{N} ._-]/gu;

/**
 * Bir metni sunucunun kabul edeceği biçime indirger.
 * Geçersiz karakterleri atar, iç boşlukları teke indirir, 20'ye kırpar.
 */
export function adTemizle(ham: string | null | undefined): string {
  return String(ham ?? "")
    .replace(GECERSIZ_KARAKTER, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, AD_MAX)
    // ⚠️ KIRPMADAN SONRA TEKRAR: 20. karakter boşluğa denk gelirse sunucu
    // `trim()` sonrası farklı bir dize görür ve uzunluk kontrolü ayrışırdı.
    .trim();
}

/**
 * Google adından takma ad ÖNERİSİ üretir.
 *
 * ⚠️ YALNIZCA İLK AD. "Ahmet Yılmaz" → "Ahmet". Soyadı bilerek atılıyor
 * (bkz. dosya başlığı). İlk ad kullanılamaz hâle geliyorsa (tek harf, hepsi
 * geçersiz karakter) öneri ÜRETİLMEZ — kullanıcı kendisi yazar. Tam ada
 * düşmek, başlıktaki gizlilik gerekçesini arka kapıdan delerdi.
 *
 * @returns öneri, ya da öneri üretilemiyorsa null
 */
export function adOner(googleAdi: string | null | undefined): string | null {
  const ilkSozcuk = String(googleAdi ?? "").trim().split(/\s+/)[0];
  const temiz = adTemizle(ilkSozcuk);
  return temiz.length >= AD_MIN ? temiz : null;
}

/**
 * Yerel ön kontrol: yalnızca UZUNLUK.
 *
 * ⚠️ "Geçerli mi" DEMİYOR, "gönderilebilir mi" diyor. Sunucu ayrıca rezerve
 * kelimeye, benzersizliğe ve karakter kümesine bakar; burada true dönmesi
 * kaydın kabul edileceği anlamına GELMEZ. Düğmeyi erken açmamak için var.
 */
export function gonderilebilirMi(x: string | null | undefined): boolean {
  const s = String(x ?? "").trim();
  return s.length >= AD_MIN && s.length <= AD_MAX;
}
