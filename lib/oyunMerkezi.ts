/**
 * OYUN MERKEZİ — renkler, mod sırası ve kupon ilerlemesi için TEK KAYNAK.
 *
 * ⚠️ NEDEN SAF MODÜL: bileşen renkleri kendi içinde tutunca kontrast testi
 * onları kaynak metninden düzenli ifadeyle söküyordu ve biçim değişince
 * körleşiyordu. Burada React/RN yok; bileşenler de testler de aynı değerleri
 * içe aktarıyor.
 *
 * ⚠️ 2026-09-17 — CİHAZDA ÇÖKEN TASARIM, KÖK NEDEN ÖLÇÜLDÜ.
 * v35 telefonda: kart zeminleri düz limon/mavi/sarı/kırmızı bloklar, üstlerindeki
 * açık renkli yazılar okunmuyor (kullanıcı: "yazılar okunmuyor, çerçeveler
 * basmakalıp, süperpozisyonlar"). Web önizlemesinde aynı kartlar soluk tonluydu.
 * Sebep react-native-svg'nin YEREL yolunda:
 *
 *     node_modules/react-native-svg/src/lib/extract/extractGradient.ts
 *     stops.push([offset, (color & 0x00ffffff) | (alpha << 24)])
 *     alpha = stopOpacity (varsayılan 1)
 *
 * `#a3e6352a` gibi sekiz haneli rengin SAYDAMLIĞI ATILIYOR, yerine stopOpacity
 * (1) konuyor → tam opak. Web ise `stop-color`u tarayıcıya aynen veriyor ve
 * saydamlık çalışıyor. Yani önizleme cihazı TEMSİL ETMİYORDU ve kontrast
 * ölçümü var olmayan bir zeminde yapılmıştı. Aynı yöntem eski mod şeridinde
 * (Ağustos'tan beri) de vardı.
 *
 * Bu yüzden artık: METİN TAŞIYAN HİÇBİR ZEMİN SAYDAM RENK YA DA GRADYAN DEĞİL.
 * Renk kimliği yalnız DÜZ, önceden karıştırılmış tonlardan geliyor
 * (`karistir`) — her platformda aynı çizilen tek şey düz renk.
 */

/** Mod anahtarları — `lib/ozellikler.ts` `modAcikMi` bu adları tanıyor. */
export type ModAnahtari = "tek" | "kupon" | "mini" | "gs1987" | "duello" | "havuz";

/**
 * ⚠️ SIRA BİLİNÇLİ: beceri odaklı modlar önde, kesinti/havuz mekaniği taşıyan
 * modlar (düello, havuz) arkada — IARC "simüle edilmiş şans oyunu" ve
 * "dolandırılıyor muyum" algısı. Ayrıntı `components/OyunMerkezi.tsx` başlığında.
 */
export const MOD_SIRASI: readonly ModAnahtari[] = ["kupon", "tek", "mini", "gs1987", "duello", "havuz"];

/** Mod vurgu renkleri — yalnız ikon kutusu, küçük etiket ve dolu düğmede. */
export const MOD_RENGI: Record<ModAnahtari, string> = {
  kupon: "#a3e635",
  tek: "#38bdf8",
  mini: "#fbbf24",
  gs1987: "#f87171",
  duello: "#fb923c",
  havuz: "#a78bfa",
};

/** Kart yüzeyi — düz. Sayfa zemininden boşlukla ayrılıyor, kenarlık yok. */
export const KART_ZEMINI = "#0f172a";
/** Kart içindeki ikincil yüzey (maç düğmeleri, ilerleme boşluğu). */
export const IC_YUZEY = "#1e293b";
/** Metin tonları — hepsi KART_ZEMINI ve IC_YUZEY üstünde ölçülü. */
export const METIN_ANA = "#f8fafc";
export const METIN_IKINCIL = "#cbd5e1";
export const METIN_SOLUK = "#94a3b8";
/** Dolu vurgu düğmesinin yazısı (açık vurgu renklerinde koyu yazı). */
export const DUGME_YAZISI = "#020617";

/** İkon kutusu: mod rengi karta bu oranda karışmış DÜZ ton. */
export const IKON_KUTUSU_ORANI = 0.2;

/** Kupon ilerleme çubuğunun boş parçası. Bilgi "3/8" yazısında da var. */
export const ILERLEME_BOS = "#334155";

/**
 * `ust` rengini `alt` rengine `oran` kadar karıştırıp DÜZ `#rrggbb` döndürür
 * (0 = alt, 1 = ust). Saydamlık üretmez — bkz. başlık.
 */
export function karistir(ust: string, alt: string, oran: number): string {
  const u = ust.replace("#", "");
  const a = alt.replace("#", "");
  const o = Math.max(0, Math.min(1, oran));
  let s = "#";
  for (let i = 0; i < 3; i++) {
    const cu = parseInt(u.substr(i * 2, 2), 16);
    const ca = parseInt(a.substr(i * 2, 2), 16);
    s += Math.round(cu * o + ca * (1 - o)).toString(16).padStart(2, "0");
  }
  return s;
}

/** Modun ikon kutusu rengi. */
export function ikonKutusu(key: ModAnahtari): string {
  return karistir(MOD_RENGI[key], KART_ZEMINI, IKON_KUTUSU_ORANI);
}

/**
 * Listede (tam modda) kupon ve tek maç dışında kalan modlar — o ikisi üstte
 * canlı içerikli kendi kartlarında; aynı mod iki kez görünmesin. Sıra korunur.
 */
export function digerModlar<T extends { key: string }>(gorunen: readonly T[]): T[] {
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

/**
 * SVG gradyan durağı için rengi yerelde de doğru çizilecek biçime ayırır:
 * `#rrggbbaa` → `{ renk: "#rrggbb", opaklik: aa/255 }`. react-native-svg yerel
 * yolu sekiz haneli rengin saydamlığını atıyor (bkz. başlık); saydamlık
 * `stopOpacity` ile verilmeli. Altı haneli ve tanınmayan değer aynen, opaklık 1.
 */
export function durakRengi(renk: string): { renk: string; opaklik: number } {
  const m = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})$/.exec(String(renk || ""));
  if (!m) return { renk, opaklik: 1 };
  return { renk: `#${m[1]}`, opaklik: parseInt(m[2], 16) / 255 };
}
