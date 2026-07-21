import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet, ScrollView } from "react-native";
import QuickPickCard, { PickFixture } from "./QuickPickCard";
import StreakBar from "./StreakBar";
import { getApiBase } from "../lib/apiBase";
import { getAuthHeaders } from "../lib/apiFetch";

type Props = {
  country?: string | null;
  userId?: string | null;
};

type StreakData = {
  seriesCumOdds: number;
  seriesCount: number;
  activeSeries: boolean;
  bestSeries: number;
  currentTier: { threshold: number; bonus: number; label: string } | null;
};

export default function QuickPlaySection({ country, userId }: Props) {
  const [singles, setSingles] = useState<PickFixture[]>([]);
  const [quad, setQuad] = useState<PickFixture[]>([]);
  const [quadBonus, setQuadBonus] = useState(0);
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [loading, setLoading] = useState(true);
  const [predictedCount, setPredictedCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const base = await getApiBase();
        const qs = country ? `?country=${encodeURIComponent(country)}` : "";

        const [singlesR, quadR, streakR] = await Promise.all([
          fetch(`${base}/api/daily-picks/singles${qs}`).then(r => r.json()).catch(() => null),
          fetch(`${base}/api/daily-picks/quad${qs}`).then(r => r.json()).catch(() => null),
          userId
            ? fetch(`${base}/api/daily-picks/streak?userId=${encodeURIComponent(userId)}`).then(r => r.json()).catch(() => null)
            : null,
        ]);

        if (cancelled) return;
        if (singlesR?.ok) setSingles(singlesR.picks || []);
        if (quadR?.ok) {
          setQuad(quadR.matches || []);
          setQuadBonus(quadR.allCorrectBonus || 0);
        }
        if (streakR?.ok) setStreak(streakR);
      } catch {}
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [country, userId]);

  function handlePredicted(fixtureId: string) {
    setPredictedCount(c => c + 1);
  }

  if (loading) {
    return (
      <View style={s.loadingBox}>
        <ActivityIndicator color="#a3e635" />
        <Text style={s.loadingText}>Günün maçları yükleniyor...</Text>
      </View>
    );
  }

  const hasSingles = singles.length > 0;
  const hasQuad = quad.length > 0;

  if (!hasSingles && !hasQuad) {
    return (
      <View style={s.emptyBox}>
        <Text style={s.emptyText}>Bugün maç yok — yarın tekrar gel!</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {streak && (
        <StreakBar
          seriesCumOdds={streak.seriesCumOdds}
          seriesCount={streak.seriesCount}
          activeSeries={streak.activeSeries}
          bestSeries={streak.bestSeries}
          currentTier={streak.currentTier}
        />
      )}

      {hasSingles && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>⚡ Hızlı Tahmin</Text>
          <Text style={s.sectionSub}>Tek tıkla tahmin et, oranına göre LC kazan</Text>
          {singles.map(f => (
            <QuickPickCard key={f.fixtureId} fixture={f} onPredicted={handlePredicted} />
          ))}
        </View>
      )}

      {hasQuad && (
        <View style={s.section}>
          <View style={s.quadHeader}>
            <Text style={s.sectionTitle}>🎯 4'lü Paket</Text>
            {quadBonus > 0 && (
              <View style={s.bonusBadge}>
                <Text style={s.bonusText}>4/4 → +{quadBonus} LC</Text>
              </View>
            )}
          </View>
          <Text style={s.sectionSub}>Hepsini bil, mega bonus kazan</Text>
          {quad.map(f => (
            <QuickPickCard key={f.fixtureId} fixture={f} onPredicted={handlePredicted} compact />
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { paddingHorizontal: 12, paddingTop: 8 },
  loadingBox: { padding: 40, alignItems: "center" },
  loadingText: { color: "#64748b", marginTop: 8, fontSize: 12 },
  emptyBox: { padding: 40, alignItems: "center" },
  emptyText: { color: "#64748b", fontSize: 13 },
  section: { marginBottom: 16 },
  sectionTitle: { color: "#f1f5f9", fontSize: 16, fontWeight: "900", marginBottom: 2 },
  sectionSub: { color: "#64748b", fontSize: 11, marginBottom: 10 },
  quadHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  bonusBadge: {
    backgroundColor: "#fbbf2420", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  bonusText: { color: "#fbbf24", fontWeight: "800", fontSize: 11 },
});
