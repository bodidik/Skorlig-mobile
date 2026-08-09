export const Colors = {
  bg: "#030d18",
  text: "#e2e8f0",
  muted: "#64748b",
  accent: "#f59e0b",
  // Altın zeminde okunacak metin/ikon rengi. Altın açık bir renk olduğu için
  // beyaz yazı 2.15:1 veriyor (okunmaz) — koyu yazı 9.39:1. Dolgu accent
  // butonlarında DAİMA bunu kullan, "#fff" yazma.
  onAccent: "#020617",
  headerBlue: "#1a1a2e",
  live: "#16a34a",
  finished: "#ef4444",
  background: "#030d18",
  primary: "#f59e0b",
  soon: "#d97706",
  info: "#0ea5e9",
  danger: "#dc2626",
  dark: "#020617",
  white: "#ffffff",
  black: "#000000",
  border: "#1e293b",
  slate900: "#e2e8f0",
  card: "#0f172a",
  cardBorder: "#1e293b",
  textMuted: "#64748b",
  purple: "#7c3aed",
  // Stadyum paleti — tek amber tekdüzeliğini kırmak için ikincil canlı renkler.
  win: "#a3e635",        // kazanç / seri: neon lime
  liveGlow: "#38bdf8",   // canlı maç: elektrik mavi
  fire: "#fb923c",       // seri ateşi: sıcak turuncu
  hot: "#f43f5e",        // düello / rekabet: sıcak kırmızı-pembe
};

/** Gradient çiftleri — GradyanZemin ile kullanılır. */
export const Gradyan = {
  gold: ["#f59e0b", "#b45309"] as const,
  pitch: ["#14532d", "#052e16"] as const,   // çim yeşili derinlik
  night: ["#1e3a8a", "#030d18"] as const,   // stadyum gecesi
  fire: ["#fb923c", "#dc2626"] as const,
  card: ["#1e293b", "#0f172a"] as const,    // kart derinliği (nötr)
};

export type ColorKeys = keyof typeof Colors;
export default Colors;

/** Rengin bağıl parlaklığı (WCAG 2.1). */
function luminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return null;
  const h = m[1].length === 3
    ? m[1].split("").map((x) => x + x).join("")
    : m[1];
  const toLin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const r = toLin(parseInt(h.slice(0, 2), 16) / 255);
  const g = toLin(parseInt(h.slice(2, 4), 16) / 255);
  const b = toLin(parseInt(h.slice(4, 6), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** İki renk arasındaki WCAG kontrast oranı (1:1 – 21:1). */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return 1;
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Verilen zemin üzerinde okunacak metin rengi.
 *
 * Sabit bir parlaklık eşiği KULLANMAZ: iki adayın gerçek kontrastını ölçüp
 * kazananı döndürür. Eşik yöntemi orta parlaklıktaki renklerde yanılıyordu —
 * örn. altın #f59e0b (parlaklık 0.44) eşiğin altında kaldığı için beyaz
 * seçiliyordu, oysa beyaz 2.15:1 (okunmaz), koyu 9.39:1 veriyor.
 */
export function on(bg: string): string {
  const DARK = "#020617";
  const LIGHT = "#ffffff";
  if (luminance(bg) === null) return LIGHT;
  return contrast(bg, DARK) >= contrast(bg, LIGHT) ? DARK : LIGHT;
}

