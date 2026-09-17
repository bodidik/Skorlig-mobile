/**
 * SKOR TAHMİNİ — kartın saf mantığı (JSX ve react-native yok).
 *
 * Oyunun kuralı, puanı ve ödülü SUNUCUDA (api/lib/skor-tahmini.cjs); burada
 * yalnız gösterim kararları var. ⚠️ Puan formülü burada YOK ve olmamalı:
 * kurallar ekranındaki örnek tablo bile sunucudan geliyor — iki kopya
 * ayrışırsa oyuncuya gösterilen puan ödenen puandan farklı olur.
 */

export type SkorSonuc = {
  puan?: number | null;
  mesafe?: number;
  tamSkor?: boolean;
  odulLc?: number;
  iade?: boolean;
  iadeLc?: number;
  gercek?: { home: number; away: number } | null;
} | null;

export type SkorMaci = {
  fixtureId: string;
  ulke: string;
  home: string;
  away: string;
  league: string | null;
  kickoffISO: string;
  haftaKey: string;
  kilitli: boolean;
  benim: { home: number; away: number; sonuc: SkorSonuc } | null;
};

/** Sunucu kabul sınırıyla aynı (api MAKS_GOL). */
export const MAKS_GOL = 15;

export function golAyarla(n: number, delta: number): number {
  const x = Math.round(Number(n) || 0) + delta;
  return Math.max(0, Math.min(MAKS_GOL, x));
}

/**
 * Kartta öne çıkan maç: tahmine AÇIK olanların en erkeni; hiçbiri açık
 * değilse en son başlayan (sonucu en yakında gelecek/gelmiş olan).
 */
export function oneCikanMac(maclar: SkorMaci[] | null | undefined): SkorMaci | null {
  const liste = Array.isArray(maclar) ? maclar.slice() : [];
  if (!liste.length) return null;
  const ms = (m: SkorMaci) => Date.parse(m.kickoffISO) || 0;
  const acik = liste.filter((m) => !m.kilitli).sort((a, b) => ms(a) - ms(b));
  if (acik.length) return acik[0];
  return liste.sort((a, b) => ms(b) - ms(a))[0];
}

export type EylemDurumu = "gonder" | "guncelle" | "kayitli" | "kilitli" | "sonuclandi";

/** Kartın düğme durumu, seçili maç ve ekrandaki taslak skora göre. */
export function eylemDurumu(mac: SkorMaci | null, taslak: { home: number; away: number }): EylemDurumu {
  if (!mac) return "kilitli";
  if (mac.benim?.sonuc) return "sonuclandi";
  if (mac.kilitli) return "kilitli";
  if (!mac.benim) return "gonder";
  return mac.benim.home === taslak.home && mac.benim.away === taslak.away ? "kayitli" : "guncelle";
}

/**
 * Puanı işaretiyle yazar: +12 · 0 · −4. Eksi, tire değil U+2212 — kurallar
 * metnindeki "gol farkı başına −2" ile aynı işaret; karışık görünüyordu
 * (emülatörde ölçüldü: "−2" yanında "-6").
 */
export function puanIsaretli(n: number | null | undefined): string {
  const x = Math.round(Number(n) || 0);
  if (x > 0) return `+${x}`;
  if (x < 0) return `−${-x}`;
  return "0";
}

/** Maçın ekrandaki ilk taslak skoru: kendi tahminim, yoksa 0-0. */
export function ilkTaslak(mac: SkorMaci | null): { home: number; away: number } {
  return mac?.benim ? { home: mac.benim.home, away: mac.benim.away } : { home: 0, away: 0 };
}
