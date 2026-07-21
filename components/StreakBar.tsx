import React from "react";
import { View, Text, StyleSheet } from "react-native";

type Tier = { threshold: number; bonus: number; label: string } | null;

type Props = {
  seriesCumOdds: number;
  seriesCount: number;
  activeSeries: boolean;
  bestSeries: number;
  currentTier: Tier;
};

const TIERS = [
  { threshold: 5, label: "Isınıyor", emoji: "🔥" },
  { threshold: 10, label: "Ateşte", emoji: "🔥🔥" },
  { threshold: 20, label: "Durdurulamıyor", emoji: "💥" },
];

export default function StreakBar({ seriesCumOdds, seriesCount, activeSeries, bestSeries, currentTier }: Props) {
  if (!activeSeries && seriesCount === 0 && bestSeries === 0) return null;

  const nextTier = TIERS.find(t => t.threshold > seriesCumOdds) || TIERS[TIERS.length - 1];
  const progress = nextTier ? Math.min(1, seriesCumOdds / nextTier.threshold) : 1;

  return (
    <View style={s.container}>
      <View style={s.row}>
        <Text style={s.label}>
          {activeSeries && seriesCount > 0
            ? `${currentTier?.label ?? "Seri"} ${currentTier ? TIERS.find(t => t.label === currentTier.label)?.emoji ?? "" : ""}`
            : "Yeni seri başlat!"
          }
        </Text>
        <Text style={s.stats}>
          {seriesCount} maç • {seriesCumOdds.toFixed(1)}x
        </Text>
      </View>

      <View style={s.barBg}>
        <View style={[s.barFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>

      <View style={s.row}>
        <Text style={s.hint}>Sonraki: {nextTier?.label} ({nextTier?.threshold}x)</Text>
        {bestSeries > 0 && <Text style={s.best}>En iyi: {bestSeries.toFixed(1)}x</Text>}
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
