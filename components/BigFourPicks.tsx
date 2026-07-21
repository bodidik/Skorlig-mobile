import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet, ScrollView, RefreshControl,
} from "react-native";
import Constants from "expo-constants";
import { getAuth } from "@react-native-firebase/auth";

const API = Constants.expoConfig?.extra?.apiBase ?? "https://skorlig87.onrender.com";

type Outcome = "H" | "D" | "A";

interface Pick {
  fixtureId: string;
  home: string;
  away: string;
  kickoffISO: string;
  league: string;
  status: string;
  score: { home: number; away: number } | null;
  open: boolean;
  hoursUntil: number;
  minutesUntil: number;
  pred: { outcome: Outcome } | null;
  result: { outcome: Outcome; score: { home: number; away: number } } | null;
}

function countdown(minutesUntil: number): string {
  if (minutesUntil <= 0) return "Başladı";
  if (minutesUntil < 60) return `${minutesUntil} dk`;
  const h = Math.floor(minutesUntil / 60);
  const m = minutesUntil % 60;
  return m > 0 ? `${h} sa ${m} dk` : `${h} saat`;
}

function teamShort(name: string): string {
  const map: Record<string, string> = {
    "Galatasaray": "GS", "Fenerbahçe": "FB",
    "Beşiktaş": "BJK", "Trabzonspor": "TS",
  };
  return map[name] ?? name.slice(0, 3).toUpperCase();
}

function teamColor(name: string): string {
  if (name.includes("Galatasaray")) return "#E8102A";
  if (name.includes("Fenerbahçe"))  return "#F9D900";
  if (name.includes("Beşiktaş"))    return "#111";
  if (name.includes("Trabzon"))     return "#7B1FA2";
  return "#555";
}

export default function BigFourPicks() {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const userId = getAuth().currentUser?.uid ?? null;

  const fetchPicks = useCallback(async () => {
    try {
      const url = `${API}/api/weekly-picks${userId ? `?userId=${userId}` : ""}`;
      const res = await fetch(url);
      const j = await res.json();
      if (j.ok) setPicks(j.picks ?? []);
      else setError(j.error ?? "Hata");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => { fetchPicks(); }, [fetchPicks]);

  const predict = async (fixtureId: string, outcome: Outcome) => {
    if (!userId) return;
    setSubmitting(fixtureId + outcome);
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch(`${API}/api/weekly-picks/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fixtureId, outcome }),
      });
      const j = await res.json();
      if (j.ok) {
        setPicks(prev =>
          prev.map(p => p.fixtureId === fixtureId ? { ...p, pred: { outcome } } : p)
        );
      }
    } catch {}
    setSubmitting(null);
  };

  if (loading) return <ActivityIndicator style={{ margin: 24 }} color="#E8102A" />;
  if (error)   return <Text style={s.err}>{error}</Text>;
  if (!picks.length) return (
    <View style={s.empty}>
      <Text style={s.emptyTitle}>Bu Hafta Maç Yok</Text>
      <Text style={s.emptySub}>Büyük dörtlü maçları 24 saat önce burada görünür</Text>
    </View>
  );

  return (
    <ScrollView
      style={s.wrap}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchPicks(); }} tintColor="#E8102A" />}
      showsVerticalScrollIndicator={false}
    >
      <Text style={s.header}>Büyük Dörtlü</Text>
      <Text style={s.sub}>Ücretsiz tahmin — sadece 1987 üyeleri</Text>

      {picks.map(pick => {
        const isFT   = pick.status === "FT";
        const isLive = pick.status === "LIVE" || (pick.status && /^\d/.test(pick.status));
        const correct = isFT && pick.pred && pick.result
          ? pick.pred.outcome === pick.result.outcome : null;

        return (
          <View key={pick.fixtureId} style={[s.card, isFT && s.cardDone]}>
            {/* Lig + Zaman */}
            <View style={s.cardTop}>
              <Text style={s.league}>{pick.league}</Text>
              {isLive
                ? <View style={s.liveBadge}><Text style={s.liveText}>● CANLI</Text></View>
                : isFT
                ? <Text style={s.ftText}>Bitti</Text>
                : <Text style={s.countdown}>{countdown(pick.minutesUntil)}</Text>
              }
            </View>

            {/* Takımlar + Skor */}
            <View style={s.matchRow}>
              <View style={s.teamSide}>
                <View style={[s.badge, { backgroundColor: teamColor(pick.home) }]}>
                  <Text style={s.badgeText}>{teamShort(pick.home)}</Text>
                </View>
                <Text style={s.teamName}>{pick.home}</Text>
              </View>

              <View style={s.scoreBox}>
                {(isLive || isFT) && pick.score
                  ? <Text style={s.score}>{pick.score.home} – {pick.score.away}</Text>
                  : <Text style={s.vs}>VS</Text>
                }
              </View>

              <View style={[s.teamSide, s.teamRight]}>
                <View style={[s.badge, { backgroundColor: teamColor(pick.away) }]}>
                  <Text style={s.badgeText}>{teamShort(pick.away)}</Text>
                </View>
                <Text style={[s.teamName, { textAlign: "right" }]}>{pick.away}</Text>
              </View>
            </View>

            {/* Butonlar / Sonuç */}
            {isFT ? (
              <View style={s.resultRow}>
                {pick.pred && (
                  <View style={[s.resultBadge, correct ? s.correct : s.wrong]}>
                    <Text style={s.resultText}>
                      {correct ? "✓ Doğru" : "✗ Yanlış"} · Tahminin: {pick.pred.outcome === "H" ? "Ev" : pick.pred.outcome === "D" ? "Beraberlik" : "Deplasman"}
                    </Text>
                  </View>
                )}
                {!pick.pred && (
                  <Text style={s.noPred}>Tahmin yapılmadı</Text>
                )}
              </View>
            ) : pick.open ? (
              <View style={s.btnRow}>
                {(["H", "D", "A"] as Outcome[]).map(o => {
                  const label  = o === "H" ? "1 Ev" : o === "D" ? "X Beraberlik" : "2 Dep";
                  const active = pick.pred?.outcome === o;
                  const busy   = submitting === pick.fixtureId + o;
                  return (
                    <TouchableOpacity
                      key={o}
                      style={[s.btn, active && s.btnActive]}
                      onPress={() => !active && predict(pick.fixtureId, o)}
                      disabled={!!submitting}
                      activeOpacity={0.75}
                    >
                      {busy
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={[s.btnText, active && s.btnTextActive]}>{label}</Text>
                      }
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <Text style={s.notOpen}>Tahmin {countdown(pick.minutesUntil)} sonra açılır</Text>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap:         { flex: 1 },
  header:       { fontSize: 20, fontWeight: "800", color: "#E8102A", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 2 },
  sub:          { fontSize: 12, color: "#888", paddingHorizontal: 16, marginBottom: 12 },
  err:          { color: "#E8102A", textAlign: "center", margin: 24 },
  empty:        { alignItems: "center", padding: 40 },
  emptyTitle:   { fontSize: 16, fontWeight: "700", color: "#333", marginBottom: 6 },
  emptySub:     { fontSize: 13, color: "#888", textAlign: "center" },

  card:         { backgroundColor: "#fff", borderRadius: 14, marginHorizontal: 12, marginBottom: 12, padding: 14, elevation: 2, shadowColor: "#000", shadowOpacity: 0.07, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  cardDone:     { opacity: 0.85 },
  cardTop:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  league:       { fontSize: 11, color: "#888", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  liveBadge:    { backgroundColor: "#E8102A", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  liveText:     { fontSize: 10, color: "#fff", fontWeight: "700" },
  ftText:       { fontSize: 11, color: "#888" },
  countdown:    { fontSize: 12, color: "#E8102A", fontWeight: "700" },

  matchRow:     { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  teamSide:     { flex: 1, alignItems: "flex-start", gap: 6 },
  teamRight:    { alignItems: "flex-end" },
  badge:        { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  badgeText:    { fontSize: 11, color: "#fff", fontWeight: "800" },
  teamName:     { fontSize: 13, fontWeight: "700", color: "#1a1a1a" },
  scoreBox:     { alignItems: "center", minWidth: 60 },
  score:        { fontSize: 22, fontWeight: "800", color: "#111" },
  vs:           { fontSize: 14, color: "#aaa", fontWeight: "600" },

  btnRow:       { flexDirection: "row", gap: 6 },
  btn:          { flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor: "#ddd", paddingVertical: 10, alignItems: "center" },
  btnActive:    { backgroundColor: "#E8102A", borderColor: "#E8102A" },
  btnText:      { fontSize: 12, fontWeight: "700", color: "#555" },
  btnTextActive:{ color: "#fff" },

  resultRow:    { alignItems: "center" },
  resultBadge:  { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  correct:      { backgroundColor: "#E8F5E9" },
  wrong:        { backgroundColor: "#FFEBEE" },
  resultText:   { fontSize: 13, fontWeight: "700" },
  noPred:       { fontSize: 12, color: "#aaa" },
  notOpen:      { fontSize: 12, color: "#aaa", textAlign: "center", paddingVertical: 8 },
});
