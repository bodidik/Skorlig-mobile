/**
 * LC TUTARI GÖSTERİMİ — TEK KAYNAK.
 *
 * ⚠️ NEDEN VAR: bakiye dört ekranda HAM basılıyordu (`{wallet.user?.balance}`)
 * ve LC tutarları kesirli olabiliyor. Düello ödülü tam sayı DEĞİL:
 *
 *     routes/duels.cjs:746  houseCut  = round(pot * 0.05 * 10) / 10
 *     routes/duels.cjs:747  winAmount = round((pot - houseCut) * 10) / 10
 *
 * Ölçüldü (stake aralığı 1..12): 12 stake değerinin 11'inde ödül kesirli
 * (1 → 1.9, 2 → 3.8, 3 → 5.7 ...). Toplam korunuyor, sorun orada değil.
 *
 * Asıl sorun kesirli tutarların cüzdanda BİRİKMESİ: `lib/wallet-credit.cjs`
 * `$inc: { balance: tutar }` ile ham ekliyor ve IEEE754 hatası büyüyor.
 * Ölçüldü:
 *     20 kez 1.9 eklendi → 37.999999999999986   (38 değil)
 *     100 kez 5.7 eklendi → 569.9999999999998   (570 değil)
 *
 * Ham basıldığı için kullanıcı ekranda tam olarak bunu görüyordu:
 *     "37.999999999999986 LC"
 *
 * ⚠️ KÖK NEDEN BURADA DEĞİL. Doğrusu ödülleri tam sayı üretmek olurdu (turnuva
 * `odemeDagit` bunu "en büyük kalan" yöntemiyle yapıyor), ama MAX_STAKE 12
 * iken %5 kesinti tam sayıyla ifade edilemiyor: pot 2..24 için kesinti
 * 0.1..1.2 çıkıyor, tam sayıya çekmek ev gelirini fiilen sıfırlıyor. Bu bir
 * EKONOMİ kararı, ayrı ele alınmalı — burada yalnızca gösterim düzeltiliyor.
 */

/**
 * LC tutarını okunur biçimde döndürür.
 *
 * Kayan nokta gürültüsünü temizler, gereksiz sıfırları atar:
 *     37.999999999999986 → "38"
 *     1.9                → "1.9"
 *     38                 → "38"
 *     null / undefined   → "0"
 */
export function lcYaz(n: number | null | undefined): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  /* İki basamak, sonra sondaki sıfırlar atılıyor: 38.00 → 38, 1.90 → 1.9 */
  return String(Number(x.toFixed(2)));
}
