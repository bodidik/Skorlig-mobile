import React, { useState, useRef } from "react";
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  Animated, StyleSheet,
} from "react-native";
import { getApiBase } from "../lib/apiBase";
import { getAuthHeaders } from "../lib/apiFetch";

type Odds = { home: number; draw: number; away: number };
type Rewards = { home: number; draw: number; away: number };

export type PickFixture = {
  fixtureId: string;
  home: string;
  away: string;
  kickoffISO: string | null;
  status: string;
  league: string | null;
  odds: Odds;
  rewards: Rewards;
};

type Props = {
  fixture: PickFixture;
  onPredicted?: (fixtureId: string, outcome: string, lcReward: number) => void;
  compact?: boolean;
};

const OUTCOMES = [
  { key: "home" as const, api: "H", color: "#3b82f6" },
  { key: "draw" as const, api: "D", color: "#64748b" },
  { key: "away" as const, api: "A", color: "#f97316" },
];

export default function QuickPickCard({ fixture, onPredicted, compact }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const lcAnim = useRef(new Animated.Value(0)).current;
  const [earnedLC, setEarnedLC] = useState(0);

  const kickoff = fixture.kickoffISO
    ? new Date(fixture.kickoffISO).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
    : null;

  async function handlePick(outcomeKey: "home" | "draw" | "away") {
    if (submitted || busy) return;
    setSelected(outcomeKey);
    setBusy(true);
    try {
      const base = await getApiBase();
      const authH = await getAuthHeaders();
      await fetch(`${base}/api/pred/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authH },
        body: JSON.stringify({
          fixtureId: fixture.fixtureId,
          outcome: OUTCOMES.find(o => o.key === outcomeKey)!.api,
          type: "result",
        }),
      });
      const reward = fixture.rewards[outcomeKey];
      setEarnedLC(reward);
      setSubmitted(true);
      onPredicted?.(fixture.fixtureId, outcomeKey, reward);
      Animated.sequence([
        Animated.timing(lcAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.delay(1500),
        Animated.timing(lcAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    } catch {}
    setBusy(false);
  }

  const lcOpacity = lcAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const lcY = lcAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -20] });

  return (
    <View style={[s.card, compact && s.cardCompact]}>
      <View style={s.meta}>
        <Text style={s.league} numberOfLines={1}>{fixture.league ?? "Maç"}</Text>
        {kickoff && <Text style={s.kickoff}>⏱ {kickoff}</Text>}
      </View>

      <View style={s.teams}>
        <Text style={s.teamName} numberOfLines={1}>{fixture.home}</Text>
        <Text style={s.vs}>vs</Text>
        <Text style={s.teamName} numberOfLines={1}>{fixture.away}</Text>
      </View>

      {!submitted ? (
        <View style={s.buttons}>
          {OUTCOMES.map(o => {
            const label = o.key === "home" ? fixture.home
              : o.key === "away" ? fixture.away : "X";
            const odd = fixture.odds[o.key];
            const reward = fixture.rewards[o.key];
            const isSelected = selected === o.key;
            return (
              <TouchableOpacity
                key={o.key}
                onPress={() => handlePick(o.key)}
                disabled={busy}
                style={[s.btn, { borderColor: o.color }, isSelected && { backgroundColor: o.color }]}
              >
                {busy && isSelected
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <Text style={[s.btnLabel, isSelected && { color: "#fff" }]} numberOfLines={1}>
                        {label}
                      </Text>
                      <Text style={[s.oddText, isSelected && { color: "#ffffffcc" }]}>
                        {odd.toFixed(2)}
                      </Text>
                      <Text style={[s.rewardText, isSelected && { color: "#fbbf24" }]}>
                        +{reward} LC
                      </Text>
                    </>
                }
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <View style={s.doneRow}>
          <Text style={s.doneText}>✅ +{earnedLC} LC kazanabilirsin</Text>
          <Animated.Text style={[s.lcBadge, { opacity: lcOpacity, transform: [{ translateY: lcY }] }]}>
            +{earnedLC} LC
          </Animated.Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: "#0f172a",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1e293b",
    padding: 14,
    marginBottom: 10,
  },
  cardCompact: { padding: 10 },
  meta: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  league: { color: "#a3e635", fontSize: 10, fontWeight: "700", flex: 1 },
  kickoff: { color: "#64748b", fontSize: 10 },
  teams: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 6 },
  teamName: { flex: 1, color: "#f1f5f9", fontSize: 13, fontWeight: "800", textAlign: "center" },
  vs: { color: "#475569", fontSize: 11, fontWeight: "600" },
  buttons: { flexDirection: "row", gap: 6 },
  btn: {
    flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 2,
    alignItems: "center", justifyContent: "center",
  },
  btnLabel: { color: "#94a3b8", fontWeight: "800", fontSize: 11, marginBottom: 2 },
  oddText: { color: "#cbd5e1", fontWeight: "600", fontSize: 13 },
  rewardText: { color: "#a3e635", fontWeight: "700", fontSize: 9, marginTop: 1 },
  doneRow: { alignItems: "center", paddingVertical: 8, position: "relative" },
  doneText: { color: "#a3e635", fontWeight: "700", fontSize: 13 },
  lcBadge: { position: "absolute", top: -6, color: "#fbbf24", fontWeight: "900", fontSize: 15 },
});
