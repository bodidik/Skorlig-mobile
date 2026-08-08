import React from "react";
import { t, useLang, type StringKey } from "../lib/i18n";
import { View, Text, StyleSheet } from "react-native";

type Tier = { threshold: number; bonus: number; label: string } | null;

type Props = {
  seriesCumOdds: number;
  seriesCount: number;
  activeSeries: boolean;
  bestSeries: number;
  currentTier: Tier;
};

/* StringKey tipi: t() dinamik anahtarla çağrılınca TS 1222 seçenekli union
 * istiyor — harita değerlerini anahtar tipiyle işaretlemek hem hatayı
 * susturur hem yanlış anahtarı derlemede yakalar. */
export const TIER_KEYS: Record<string, StringKey> = {
  "Isınıyor": "streakWarmup",
  "Ateşte": "streakOnFire",
  "Durdurulamıyor": "streakUnstoppable",
};
const TIERS: { threshold: number; labelKey: StringKey; emoji: string }[] = [
  { threshold: 5, labelKey: "streakWarmup", emoji: "🔥" },
  { threshold: 10, labelKey: "streakOnFire", emoji: "🔥🔥" },
  { threshold: 20, labelKey: "streakUnstoppable", emoji: "💥" },
];

export default function StreakBar({ seriesCumOdds, seriesCount, activeSeries, bestSeries, currentTier }: Props) {
  useLang(); // dil değişince yeniden çizilsin
  if (!activeSeries && seriesCount === 0 && bestSeries === 0) return null;

  const nextTier = TIERS.find(ti => ti.threshold > seriesCumOdds) || TIERS[TIERS.length - 1];
  const progress = nextTier ? Math.min(1, seriesCumOdds / nextTier.threshold) : 1;

  const tierI18nKey = currentTier?.label ? TIER_KEYS[currentTier.label] ?? "streakSeries" : "streakSeries";
  const tierEmoji = currentTier?.label
    ? TIERS.find(ti => ti.labelKey === TIER_KEYS[currentTier.label])?.emoji ?? ""
    : "";

  return (
    <View style={s.container}>
      <View style={s.row}>
        <Text style={s.label}>
          {activeSeries && seriesCount > 0
            ? `${t(tierI18nKey)} ${tierEmoji}`
            : t("newStreak")
          }
        </Text>
        <Text style={s.stats}>
          {t("streakRow", { n: seriesCount, x: seriesCumOdds.toFixed(1) })}
        </Text>
      </View>

      <View style={s.barBg}>
        <View style={[s.barFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>

      <View style={s.row}>
        <Text style={s.hint}>{t("streakNext", { label: t(nextTier?.labelKey ?? "streakWarmup"), threshold: String(nextTier?.threshold ?? 5) })}</Text>
        {bestSeries > 0 && <Text style={s.best}>{t("streakBest", { x: bestSeries.toFixed(1) })}</Text>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { color: "#fbbf24", fontWeight: "800", fontSize: 13 },
  stats: { color: "#94a3b8", fontSize: 11, fontWeight: "600" },
  barBg: {
    height: 6, backgroundColor: "#334155", borderRadius: 3,
    marginVertical: 8, overflow: "hidden",
  },
  barFill: { height: 6, backgroundColor: "#a3e635", borderRadius: 3 },
  hint: { color: "#64748b", fontSize: 10 },
  best: { color: "#64748b", fontSize: 10 },
});
