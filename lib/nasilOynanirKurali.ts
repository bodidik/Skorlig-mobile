/**
 * "NASIL OYNANIR" ŞERİDİ NE ZAMAN GÖRÜNÜR — KARAR, DEPODAN AYRI.
 *
 * Kullanıcı kararı (2026-09-13): şerit ilk **20 açılışta** çıkar, sonra
 * kendiliğinden susar; arayan `/nasil-oynanir` sayfasından okur. Kullanıcı
 * isterse daha erken kapatabilir ve bir daha görmez.
 *
 * ⚠️ NEDEN 20 VE NEDEN SAYAÇ: giriş slaytları bugün ömürde BİR kez çıkıyor
 * (`lib/firstRun.ts`), yani hızlı geçen kişi bir daha ulaşamıyordu. Öte yandan
 * her açılışta çıkan bir şerit, üçüncü günden sonra rahatsızlığa dönüşür.
 * Sayaç ikisinin arasını tutuyor: yeni kullanıcı birkaç hafta boyunca
 * hatırlatma görür, alışan kullanıcı hiç görmez.
 *
 * ⚠️ YAPRAK MODÜL — hiçbir şey içe aktarmıyor. `AsyncStorage` burada olsaydı
 * Node altında yüklenemez ve kural ÖLÇÜLEMEZ olurdu (bu depoda kayıtlı
 * kısıt; bkz. lib/macSaati.ts başlığı). Depoya yazma/okuma çağıranın işi,
 * karar burada.
 */

/** Kaçıncı açılışa kadar şerit görünür. */
export const GOSTERIM_SINIRI = 20;

/**
 * Şerit bu açılışta görünmeli mi?
 *
 * @param sayac  kaçıncı açılış (1 = ilk). Depoda kayıt yoksa `null` geçilir.
 * @param kapali kullanıcı "tekrar gösterme" dedi mi
 *
 * ⚠️ `null` = HENÜZ SAYILMADI, "0 açılış" DEĞİL. İkisini aynı saymak ilk
 * açılışta şeridi yutardı — deponun kayıtlı "değerlendiremedim ile olumsuz
 * karışıyor" sınıfı.
 */
export function gosterilsinMi(sayac: number | null | undefined, kapali: boolean): boolean {
  if (kapali) return false;
  if (sayac == null) return true;
  if (!Number.isFinite(sayac)) return true;   // bozuk kayıt: sustur değil, göster
  return sayac <= GOSTERIM_SINIRI;
}

/**
 * Depodan okunan ham değeri sayaca çevirir.
 * ⚠️ Bozuk/eksik kayıt `null` döner — çağıran onu "ilk açılış" sayar.
 * Sessizce 0 döndürmek, bozuk kayıtlı kullanıcıyı sonsuza dek şeritsiz
 * bırakırdı (bu depoda ölçülmüş kusur biçimi: bozuk kayıtta hiç yazmamak).
 */
export function sayacCoz(ham: string | null | undefined): number | null {
  if (ham == null) return null;
  const n = Number(ham);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
