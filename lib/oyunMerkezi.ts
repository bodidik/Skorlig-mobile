/**
 * OYUN MERKEZİ — renkler, mod sırası ve kupon ilerlemesi için TEK KAYNAK.
 *
 * ⚠️ NEDEN SAF MODÜL: eski şerit (`components/OyunModlari.tsx`) renkleri
 * bileşenin içinde tutuyordu ve kontrast testi onları KAYNAK METNİNDEN
 * düzenli ifadeyle söküyordu — kaynak biçimi değişince test "körleşiyordu".
 * Burada React/RN yok; bileşenler de testler de aynı değerleri içe aktarıyor.
 *
 * ⚠️ RENK ZEMİNE ALFAYLA BİNİYOR, ÜST SINIR ÖLÇÜLÜ. 2026-08-31 ölçümü (eski
 * renkler): gradyan üst alfası 0x30 iken açıklama 4.5'i geçiyor, 0x45'te
 * düşüyordu. 2026-09-16 yeni renklerle yeniden ölçüldü ve 0x30 YETMEDİ:
 * kupon limonu (#a3e635) parlak, açıklama o zeminde 4.48. Rozet yazısı da
 * 1987GS'te 3.99, havuzda 3.86 çıktı. Taranan değerlerden seçilen:
 *     zemin 0x2a · rozet 0x22 · rozet yazısı %25 açık ton
 *     en kötü: açıklama 4.80 · rozet 5.34 · eylem yazısı 5.06
 * Canlılık zeminden değil çizimden, kenarlıktan ve rozetten gelmeli.
 */

/** Mod anahtarları — `lib/ozellikler.ts` `modAcikMi` bu adları tanıyor. */
export type ModAnahtari = "tek" | "kupon" | "mini" | "gs1987" | "duello" | "havuz";

/**
 * ⚠️ SIRA BİLİNÇLİ: beceri odaklı modlar önde, kesinti/havuz mekaniği taşıyan
 * modlar (düello, havuz) arkada — IARC "simüle edilmiş şans oyunu" ve
 * "dolandırılıyor muyum" algısı. Ayrıntı `components/OyunMerkezi.tsx` başlığında.
 */
export const MOD_SIRASI: readonly ModAnahtari[] = ["kupon", "tek", "mini", "gs1987", "duello", "havuz"];

/**
 * Mod renkleri. Kupon ile tek maç yan yana iki geniş kart — ikisi de yeşil
 * olunca (eski şeritte tek maç #22c55e, kupon kartı #a3e635) tek blok gibi
 * okunuyordu; tek maç elektrik maviye alındı.
 */
export const MOD_RENGI: Record<ModAnahtari, string> = {
  kupon: "#a3e635",
  tek: "#38bdf8",
  mini: "#fbbf24",
  gs1987: "#f87171",
  duello: "#fb923c",
  havuz: "#a78bfa",
};

/** Kart gradyanının üst alfası (0–255). Üst sınır: bkz. başlık. */
export const ZEMIN_UST_ALFA = 0x2a;
/** Kart gradyanının alt alfası. */
export const ZEMIN_ALT_ALFA = 0x05;
/** Bedel/durum rozetinin zemin alfası — kart zeminin ÜSTÜNE biner. */
export const ROZET_ALFA = 0x22;
/**
 * Kenarlık alfası. Süs: kartı tanıtan şey yazısı ve eylemi, kenarlık değil —
 * sayfa zemininde 1.98–2.87 veriyor, 3.0 iddiası yok.
 */
export const KENARLIK_ALFA = 0x66;
/** Rozet yazısı mod renginden bu oranda beyaza açılıyor (bkz. başlık). */
export const ROZET_YAZI_ACMA = 0.25;
/** Kupon ilerleme çubuğunun boş parçası. Bilgi "3/8" yazısında da var. */
export const ILERLEME_BOS = "#475569";

/**
 * Açıklama rengi — `Colors.muted` DEĞİL. `#64748b` mod zeminlerinde 2.53–2.86
 * veriyordu (2026-08-31 ölçümü).
 */
export const ACIKLAMA_RENGI = "#94a3b8";

/** Alfa (0–255) → iki haneli onaltılık, `#rrggbb` sonuna eklenir. */
export function alfa(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
}

/** `#rrggbb` rengi `oran` kadar beyaza karıştırır (0 = aynı, 1 = beyaz). */
export function acikTon(renk: string, oran: number): string {
  const h = renk.replace("#", "");
  let o = "#";
  for (let i = 0; i < 3; i++) {
    const c = parseInt(h.substr(i * 2, 2), 16);
    o += Math.round(c + (255 - c) * oran).toString(16).padStart(2, "0");
  }
  return o;
}

/**
 * Izgarada çizilecek modlar. Maç listesi modunda (`tam`) kupon ve tek maç
 * ızgarada DEĞİL, üstte canlı içerikli geniş kartlar olarak çiziliyor; aynı
 * mod iki kez görünmesin. Girdinin sırası korunur.
 */
export function izgaraModlari<T extends { key: string }>(gorunen: readonly T[], tam: boolean): T[] {
  if (!tam) return [...gorunen];
  return gorunen.filter((m) => m.key !== "kupon" && m.key !== "tek");
}

export type KuponAsamasi = "katil" | "eksik" | "tamam";

export type KuponIlerlemesi = {
  macSayisi: number;
  girilen: number;
  eksik: number;
  asama: KuponAsamasi;
  /** Maç başına dolu mu — ilerleme çubuğu bu sırayla çiziliyor. */
  dolular: boolean[];
};

/**
 * Kuponun kullanıcı açısından durumu.
 *
 * ⚠️ `girilen` TAHMİN ANAHTARLARINDAN DEĞİL, KUPONUN MAÇLARINDAN sayılıyor.
 * `Object.keys(tahminlerim).length` kupondan düşmüş (ertelenen, değiştirilen)
 * bir maçın eski tahminini de sayabilir; o zaman "8/8" görünürken kupondaki
 * bir maç boş kalır — ve boş maç YANLIŞ sayılıyor (bkz. KuponKarti).
 */
export function kuponIlerlemesi(k: {
  maclar?: Array<{ fixtureId: string }> | null;
  katildiMi?: boolean;
  tahminlerim?: Record<string, string> | null;
} | null | undefined): KuponIlerlemesi {
  const maclar = Array.isArray(k?.maclar) ? k!.maclar! : [];
  const tahmin = k?.tahminlerim || {};
  const dolular = maclar.map((m) => typeof tahmin[m.fixtureId] === "string" && tahmin[m.fixtureId] !== "");
  const girilen = dolular.filter(Boolean).length;
  const eksik = Math.max(0, maclar.length - girilen);
  const asama: KuponAsamasi = !k?.katildiMi ? "katil" : eksik > 0 ? "eksik" : "tamam";
  return { macSayisi: maclar.length, girilen, eksik, asama, dolular };
}
