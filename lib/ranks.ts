export type Rank = {
  key: string;
  label: string;
  emoji: string;
  color: string;
  bg: string;
  border: string;
  minPts: number;
};

export const RANKS: Rank[] = [
  { key: "cayl",  label: "Çaylak",      emoji: "🌱", color: "#94a3b8", bg: "#0f172a", border: "#334155", minPts: 0 },
  { key: "amat",  label: "Amatör",      emoji: "⚽", color: "#22c55e", bg: "#071a0f", border: "#22c55e55", minPts: 50 },
  { key: "semi",  label: "Yarı-Pro",    emoji: "🎯", color: "#3b82f6", bg: "#0a1a2a", border: "#3b82f655", minPts: 200 },
  { key: "pro",   label: "Profesyonel", emoji: "🏅", color: "#f59e0b", bg: "#1a1500", border: "#f59e0b55", minPts: 500 },
  { key: "uzm",   label: "Uzman",       emoji: "👑", color: "#a855f7", bg: "#1a0a2a", border: "#a855f755", minPts: 1000 },
  { key: "efs",   label: "Efsane",      emoji: "💎", color: "#ef4444", bg: "#1a0606", border: "#ef444455", minPts: 2000 },
];

export function getRank(totalPoints: number): Rank {
  let r = RANKS[0];
  for (const rank of RANKS) {
    if (totalPoints >= rank.minPts) r = rank;
  }
  return r;
}

export function getNextRank(totalPoints: number): Rank | null {
  for (const rank of RANKS) {
    if (totalPoints < rank.minPts) return rank;
  }
  return null;
}

export function rankProgress(totalPoints: number): number {
  const cur = getRank(totalPoints);
  const next = getNextRank(totalPoints);
  if (!next) return 1;
  const range = next.minPts - cur.minPts;
  if (range <= 0) return 1;
  return Math.min(1, Math.max(0, (totalPoints - cur.minPts) / range));
}

export type Achievement = {
  key: string;
  label: string;
  emoji: string;
  desc: string;
  check: (ctx: AchCtx) => boolean;
};

export type AchCtx = {
  matches: number;
  totalPoints: number;
  totalEarned: number;
  bestSeries: number;
  seriesCount: number;
  activeSeries: boolean;
};

export const ACHIEVEMENTS: Achievement[] = [
  { key: "first",     label: "İlk Adım",       emoji: "👣", desc: "İlk maçını oynadın",           check: c => c.matches >= 1 },
  { key: "regular",   label: "Düzenli",         emoji: "📅", desc: "10 maç oynadın",               check: c => c.matches >= 10 },
  { key: "veteran",   label: "Veteran",         emoji: "🎖️", desc: "50 maç oynadın",              check: c => c.matches >= 50 },
  { key: "centurion", label: "Yüzbaşı",        emoji: "💯", desc: "100 maç oynadın",              check: c => c.matches >= 100 },
  { key: "streak5",   label: "Ateşli Seri",     emoji: "🔥", desc: "5+ maçlık seri yakaladın",     check: c => c.bestSeries >= 5 },
  { key: "streak10",  label: "Durdurulamaz",    emoji: "💥", desc: "10+ maçlık seri yakaladın",    check: c => c.bestSeries >= 10 },
  { key: "rich",      label: "Hazineci",        emoji: "💰", desc: "Toplam 100+ LC kazandın",      check: c => c.totalEarned >= 100 },
  { key: "mogul",     label: "LC Mogulü",       emoji: "🏦", desc: "Toplam 500+ LC kazandın",      check: c => c.totalEarned >= 500 },
  { key: "pts100",    label: "Yüzlük Kulüp",   emoji: "⭐", desc: "100+ toplam puan",             check: c => c.totalPoints >= 100 },
  { key: "pts500",    label: "Beş Yüzlük",     emoji: "🌟", desc: "500+ toplam puan",             check: c => c.totalPoints >= 500 },
  { key: "pts1k",     label: "Binlik Efsane",   emoji: "✨", desc: "1000+ toplam puan",            check: c => c.totalPoints >= 1000 },
];

export function getUnlocked(ctx: AchCtx): Achievement[] {
  return ACHIEVEMENTS.filter(a => a.check(ctx));
}
