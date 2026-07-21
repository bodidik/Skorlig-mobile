export const Colors = {
  bg: "#f7f7fb",
  text: "#111",
  muted: "#6b7280",
  accent: "#2563eb",
  headerBlue: "#e6efff",
  live: "#16a34a",
  finished: "#ef4444",
  background: "#f7f7fb",
  primary: "#2563eb",
  soon: "#b45309",
  info: "#0369a1",
  danger: "#b91c1c",
  dark: "#111827",
  white: "#ffffff",
  black: "#000000",
  border: "#e5e7eb",
  slate900: "#0f172a",
  purple: "#7c3aed",
};

export type ColorKeys = keyof typeof Colors;
export default Colors;

export function on(bg: string): string {
  // normalize hex like #fff or #ffffff
  const hex = (bg || "").trim();
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#fff";
  const h = m[1].length === 3
    ? m[1].split("").map((x)=> x + x).join("")
    : m[1];
  const r = parseInt(h.slice(0,2), 16) / 255;
  const g = parseInt(h.slice(2,4), 16) / 255;
  const b = parseInt(h.slice(4,6), 16) / 255;
  const toLin = (c:number)=> (c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4));
  const L = 0.2126*toLin(r) + 0.7152*toLin(g) + 0.0722*toLin(b);
  // threshold ~0.55 → açık zeminlerde koyu metin, koyu zeminlerde beyaz metin
  return L > 0.55 ? "#111" : "#fff";
}

