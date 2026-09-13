/**
 * YARIŞ HAREKETİ — sıra değişimlerinin hesabı. Saf, yaprak, sınanabilir.
 *
 * ⚠️ NEDEN MODÜL: bu kural `app/match-race/[fixtureId].tsx` içinde bir
 * `useEffect`in gövdesinde duruyordu. Orada ölçülemiyordu — ekranı Node
 * altında yükleyemeyiz — ve bu ekranın en kırılgan kuralı tam olarak burası:
 * yanlış hesaplanan bir "▲3" kullanıcıya OLMAYAN bir yükseliş gösterir.
 *
 * ⚠️ İLK YÜKLEMEDE HAREKET YOK — BU BİR KARAR, EKSİKLİK DEĞİL. Önceki
 * anlık görüntü yokken her satır "değişmiş" sayılırdı ve ekran açılışta
 * baştan aşağı ▲▼ ile dolardı: hiçbiri gerçek olmayan bir hareket.
 * Kullanıcı "girişte canlı değişim" istedi; cevabı sahte delta üretmek
 * DEĞİL, duran tabloyu sahneleyerek açmak (bkz. `girisSahnesi`).
 *
 * ⚠️ LİSTEDEN DÜŞEN SATIR "DÜŞTÜ" SAYILMAZ. Uç yalnızca ilk N'i gönderiyor;
 * 50. sıradan 51'e kayan biri yanıttan çıkıyor. Onu "▼1" diye göstermek
 * ölçmediğimiz bir şeyi iddia etmek olurdu — yalnızca İKİ ANDA DA görünen
 * satırlar karşılaştırılıyor.
 */

export type YarisSatiri = { userId: string; rank: number };

/** Kullanıcı kimliği → sıra. Karşılaştırma küçük harf üzerinden. */
export type SiraHaritasi = Map<string, number>;

export function siraHaritasi(satirlar: readonly YarisSatiri[]): SiraHaritasi {
  const m: SiraHaritasi = new Map();
  for (const s of satirlar) {
    const uid = String(s?.userId ?? "").trim().toLowerCase();
    if (!uid) continue;
    const sira = Number(s?.rank);
    if (!Number.isFinite(sira)) continue;
    m.set(uid, sira);
  }
  return m;
}

/**
 * İki anlık görüntü arasındaki sıra farkları.
 *
 * @returns kimlik → delta. POZİTİF = YÜKSELDİ (sıra numarası küçüldü).
 *          `onceki` yoksa BOŞ nesne — ilk yüklemede hareket yok.
 */
export function siraFarklari(
  onceki: SiraHaritasi | null | undefined,
  yeni: SiraHaritasi
): Record<string, number> {
  if (!onceki || onceki.size === 0) return {};
  const d: Record<string, number> = {};
  for (const [uid, sira] of yeni) {
    const o = onceki.get(uid);
    /* ⚠️ `o == null` = bu satırı ilk kez görüyoruz (listeye yeni girdi ya da
     * ilk N'in dışındaydı). "Yükseldi" demek ölçmediğimiz bir iddia olurdu. */
    if (o == null || o === sira) continue;
    d[uid] = o - sira;
  }
  return d;
}

/**
 * Podyum (ilk üç) değişti mi — kimlik ya da sıra olarak.
 *
 * ⚠️ SAYIYA DEĞİL KİMLİĞE BAKIYOR: ilk üçün puanı değişip sırası değişmediyse
 * podyum "değişmedi". Sayı her yoklamada oynuyor; her oynamada podyumu
 * parlatmak ekranı yanıp sönen bir şeye çevirir ve gerçek devir teslim
 * fark edilmez olur.
 */
export function podyumDegistiMi(
  onceki: readonly YarisSatiri[] | null | undefined,
  yeni: readonly YarisSatiri[]
): boolean {
  if (!onceki || onceki.length === 0) return false;   // ilk yükleme: parlatma yok
  const a = onceki.slice(0, 3).map((x) => String(x.userId || "").toLowerCase());
  const b = yeni.slice(0, 3).map((x) => String(x.userId || "").toLowerCase());
  if (a.length !== b.length) return true;
  return a.some((uid, i) => uid !== b[i]);
}

/**
 * Bir satırın giriş sahnesindeki gecikmesi (ms).
 *
 * ⚠️ ÜST SINIR VAR. Kademeli giriş 25 satırda toplam 2 saniyeyi bulursa
 * kullanıcı tabloyu okumak için bekler — gösteri, bilginin önüne geçer.
 * `ADIM_MS` küçük ve `EN_COK_MS` ile kapalı: sonrakiler birlikte açılır.
 */
export const ADIM_MS = 45;
export const EN_COK_MS = 450;

export function girisGecikmesi(index: number): number {
  const i = Number.isFinite(index) && index > 0 ? Math.floor(index) : 0;
  return Math.min(i * ADIM_MS, EN_COK_MS);
}

/**
 * Sayaç animasyonunun bir karesi: `0..1` ilerlemeden gösterilecek tam sayı.
 *
 * ⚠️ SON KARE TAM DEĞER OLMALI. `Math.round(hedef * oran)` ile yazılsaydı
 * 0.999'da hedefin bir eksiği görünüp öyle donabilirdi — "24 / 25" diye
 * kalan bir sayaç, veriyi yanlış söyler.
 */
export function sayacKaresi(hedef: number, oran: number): number {
  const h = Number(hedef) || 0;
  if (!(oran < 1)) return h;                 // NaN ve >=1 burada biter
  if (!(oran > 0)) return 0;
  return Math.round(h * oran);
}
