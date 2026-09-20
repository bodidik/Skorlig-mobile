/**
 * "ŞİMDİ" — açılışta öne çıkarılacak TEK acil durum.
 *
 * ⚠️ NEDEN VAR: ana ekranda her kart KENDİ durumunu gösteriyor (kupon geri
 * sayımı, "oynadın" işareti, skor durumu) ama aralarında ÖNCELİK yoktu.
 * Kuponun 40 dakika sonra kilitlendiği, kartın kaçıncı sırada olduğuna göre
 * görünür ya da görünmez oluyordu. Açılış herkese aynı sırayı gösteriyordu.
 *
 * ⚠️ KARTLAR YENİDEN SIRALANMIYOR — bilerek. Üç kart veriyi AYRI AYRI ve
 * FARKLI ZAMANLARDA çekiyor; aciliyete göre sıralamak, veri geldikçe
 * kartların kullanıcının parmağının altında yer değiştirmesi demekti.
 * Bunun yerine en üste tek satırlık bir şerit çıkıyor: düzen sabit kalıyor,
 * acil olan şey adıyla söyleniyor ve dokunulabiliyor.
 *
 * ⚠️ YENİ AĞ ÇAĞRISI YOK. Aciliyet, kartların ZATEN çektiği veriden
 * türüyor (`kalanSaniye`/`katildiMi` kupondan, `kickoffISO`/oynanma tek
 * maçtan). İkinci bir uç çağırmak hem iki gerçeklik açardı hem açılışa yük
 * bindirirdi — `/api/pred/my` bu iş için uygun görünüyor ama
 * `FixturesStore.loadAll` çağırıyor ve o yol bugün ölçülmüş bir yavaşlık
 * sınıfında (bkz. daily-picks/quad).
 *
 * ⚠️ BU MODÜL SAF: `react-native` içe aktarmıyor, Node altında sınanıyor.
 */

/* ⚠️ YALNIZCA TİP İÇE AKTARILIYOR, DEĞER DEĞİL. `import { MOD_SIRASI }`
 * yazılmıştı ve Node altında düştü: uzantısız içe aktarım ESM'de
 * çözülmüyor (`lib/oyunMerkezi.ts` kendi başlığında bu kısıtı yazıyor).
 * Tip içe aktarımı strip-types tarafından SİLİNİYOR, yani çalışma zamanında
 * bağımlılık yok. Eşitlik sırası artık parametreyle geliyor — kaynağı da
 * çağrı yerinde görünür oluyor. */
import type { ModAnahtari } from "./oyunMerkezi";

export type Acil = {
  /** Hangi oyun — şeride dokununca oraya götürmek için. */
  anahtar: ModAnahtari;
  /** Büyük olan önce. Eşitlikte MOD_SIRASI karar veriyor. */
  oncelik: number;
  /** Ekranda görünecek metin; çağıran i18n'den üretip veriyor. */
  metin: string;
};

/** Kupon için "yakında kapanıyor" eşiği: 6 saat. */
export const KUPON_ESIK_SN = 6 * 60 * 60;
/** Tek maç için "başlamak üzere" eşiği: 3 saat. */
export const MAC_ESIK_SN = 3 * 60 * 60;

/**
 * Kuponun aciliyeti.
 *
 * ⚠️ YALNIZCA KATILMAMIŞSA. Katılmış kullanıcıya "kapanıyor" demek bir iş
 * üretmiyor — yapacağı bir şey yok, yalnız gürültü. Aynı sebeple kapanmış
 * (`locked`/`settled`) kupon da acil değil: geri sayım bittiğinde şerit
 * kaybolmalı, "kaçırdın" diye bağırmamalı.
 *
 * @param kalanSn sunucudan gelen kalan saniye (cihaz saatine güvenilmiyor)
 */
export function kuponAciliyeti(
  k: { durum?: string | null; katildiMi?: boolean | null; kalanSaniye?: number | null } | null | undefined,
  metin: (kalanSn: number) => string,
  esikSn: number = KUPON_ESIK_SN
): Acil | null {
  if (!k || k.durum !== "open" || k.katildiMi) return null;
  const kalan = Number(k.kalanSaniye);
  if (!Number.isFinite(kalan) || kalan <= 0 || kalan > esikSn) return null;

  /* Öncelik süreyle TERS orantılı: 1 dk kala 100'e yaklaşır, eşikte 0'a.
   * Böylece iki acil durum varsa daha yakın olan öne geçiyor. */
  return { anahtar: "kupon", oncelik: 100 * (1 - kalan / esikSn), metin: metin(kalan) };
}

/**
 * Tek maçın aciliyeti — başlamak üzere ve OYNANMAMIŞ.
 *
 * ⚠️ OYNANMIŞSA ACİL DEĞİL: tahmini göndermiş kişiye "başlamak üzere"
 * demek yapacak iş bırakmıyor. `oynandi` bilgisi kartın zaten sorduğu
 * `/api/pred/flags` yanıtından geliyor.
 *
 * ⚠️ `simdiMs` DIŞARIDAN VERİLİYOR ve çağıran `nowFromServer()` geçiyor,
 * `Date.now()` DEĞİL. Kupon tarafında sunucu hazır `kalanSaniye` veriyor;
 * tek maçta yalnız `kickoffISO` var, yani fark cihaz saatiyle hesaplanacak
 * olsaydı saati kaymış bir telefonda şerit yanlış zamanda çıkardı. Depo
 * kuralı zaten yazılı: "kalan süre sunucudan, cihaz saatine güvenilmiyor".
 * `lib/serverTime.ts` `/health` ucundaki `ts` ile sapmayı tutuyor (uç
 * ölçüldü: 200 ve `ts` dönüyor).
 */
export function macAciliyeti(
  m: { kickoffISO?: string | null; oynandi?: boolean | null } | null | undefined,
  anahtar: ModAnahtari,
  metin: (kalanSn: number) => string,
  simdiMs: number,
  esikSn: number = MAC_ESIK_SN
): Acil | null {
  if (!m || m.oynandi || !m.kickoffISO) return null;
  const ms = Date.parse(String(m.kickoffISO));
  if (!Number.isFinite(ms)) return null;

  const kalan = Math.floor((ms - simdiMs) / 1000);
  if (kalan <= 0 || kalan > esikSn) return null;

  return { anahtar, oncelik: 100 * (1 - kalan / esikSn), metin: metin(kalan) };
}

/**
 * Adaylardan TEK birini seçer.
 *
 * ⚠️ TEK SATIR, LİSTE DEĞİL. İki üç uyarıyı üst üste dizmek "her şey acil"
 * demek olurdu ve hiçbiri okunmazdı. Şeridin işi bir sonraki adımı
 * söylemek.
 *
 * ⚠️ EŞİTLİK `sira` İLE ÇÖZÜLÜYOR, GİRDİ SIRASIYLA DEĞİL: girdi sırası
 * kartların veri dönüş sırasına bağlı ve o sıra koşumdan koşuma değişir —
 * aynı durumda farklı şerit göstermek kararsızlık olurdu. Çağıran
 * `MOD_SIRASI`nı veriyor, yani ekrandaki sırayla AYNI kaynak.
 */
export function enAcil(
  adaylar: (Acil | null | undefined)[],
  sira: readonly ModAnahtari[]
): Acil | null {
  const gecerli = adaylar.filter((a): a is Acil => !!a && Number.isFinite(a.oncelik));
  if (!gecerli.length) return null;

  return gecerli.slice().sort((a, b) => {
    if (b.oncelik !== a.oncelik) return b.oncelik - a.oncelik;
    return sira.indexOf(a.anahtar) - sira.indexOf(b.anahtar);
  })[0];
}

/**
 * Kalan saniyeyi kabaca okunur yapar: "2 sa 10 dk", "45 dk", "3 dk".
 *
 * ⚠️ SANİYE GÖSTERİLMİYOR: şerit her saniye yeniden çizilmiyor, saniye
 * yazmak ekranda DONMUŞ bir sayaç gösterirdi — yanlış olmaktan beter,
 * çünkü doğru görünür.
 */
/* ⚠️ SİLİNDİ — `kabaSure`.
 *
 * Bir tur burada ikinci bir süre biçimleyicisi yazıldı (ve testi de).
 * Sonra görüldü ki depoda zaten `sureMetni` var — üstelik İKİ kopya
 * hâlinde (`KuponKarti.tsx` ve `app/kupon.tsx`, ikisinin yorumunda da
 * "AYNI kural" yazılı). Üçüncüyü eklemek yerine o taban `lib/sure.ts`e
 * çıkarıldı ve bu yardımcı testleriyle birlikte kaldırıldı: ölü yardımcı,
 * "tek kaynak" sanılan şeyi ikiye böler. */
