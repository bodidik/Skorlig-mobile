/**
 * 4'LÜ PAKET KİLİDİ — paketin İLK maçının kilit anı.
 *
 * ⚠️ KULLANICI İSTEĞİ (2026-09-30): *"4'lü pakette bir maçın saati
 * geldiğinde diğer maçlar da tıklanamaz olsun ve paket 1 maç bile başlarsa
 * kullanıcıya sunulmaktan men edilsin."* Eskiden paket ekranda sabit
 * duruyordu; maçlar tek tek kilitlense de öteki üçü açık görünüyordu.
 *
 * Sunucu `paketKilitISO` gönderiyor; eski sunucu göndermezse ilk kickoff'tan
 * 10 dk (`lib/ekonomi.cjs TAHMIN_KILIT_DK` varsayılanı) geriye gidiliyor —
 * erken kapatmak geç kapatmaktan güvenli.
 */
export function paketKilitAni(
  paketKilitISO: string | null | undefined,
  maclar: { kickoffISO?: string | null }[]
): number | null {
  const ilan = Date.parse(paketKilitISO || "");
  if (Number.isFinite(ilan)) return ilan;
  const kolar = maclar.map((m) => Date.parse(m.kickoffISO || "")).filter(Number.isFinite);
  return kolar.length ? Math.min(...kolar) - 10 * 60_000 : null;
}

/** Paket sunulabilir mi: kilit anı bilinmiyorsa SUNULMAZ (başlamış olabilir). */
export function paketAcikMi(kilitAni: number | null, simdi: number): boolean {
  return kilitAni !== null && simdi < kilitAni;
}
