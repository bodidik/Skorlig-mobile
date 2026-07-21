import React, { useEffect, useState, useRef } from "react";
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  Animated, StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { getApiBase } from "../lib/apiBase";
import { getAuthHeaders } from "../lib/apiFetch";

type Fixture = {
  fixtureId: string;
  home: string;
  away: string;
  kickoffISO: string | null;
  status: string;
  league: string | null;
  country: string | null;
};

type Props = {
  country?: string | null;
  userId?: string;
};

const OUTCOMES = [
  { key: "home", api: "H", color: "#3b82f6" },
  { key: "draw", api: "D", color: "#64748b" },
  { key: "away", api: "A", color: "#f97316" },
] as const;

export default function DailyMatchCard({ country, userId }: Props) {
  const router = useRouter();
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const lcAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const base = await getApiBase();
        const qs = country ? `?country=${encodeURIComponent(country)}` : "";
        const r = await fetch(`${base}/api/live/daily-featured${qs}`);
        const json = await r.json();
        if (!cancelled && json.ok && json.fixture) setFixture(json.fixture);
      } catch {}
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [country]);

  async function handlePick(outcome: string) {
    if (submitted || busy || !fixture) return;
    setSelected(outcome);
    setBusy(true);
    try {
      const base = await getApiBase();
      const authH = await getAuthHeaders();
      await fetch(`${base}/api/pred/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authH },
        body: JSON.stringify({
          fixtureId: fixture.fixtureId,
          outcome: OUTCOMES.find(o => o.key === outcome)?.api ?? outcome,
          type: "result",
        }),
      });
      setSubmitted(true);
      // LC animasyonu
      Animated.sequence([
        Animated.timing(lcAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.delay(1200),
        Animated.timing(lcAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    } catch {}
    setBusy(false);
  }

  if (loading) return (
    <View style={s.card}>
      <ActivityIndicator color="#a3e635" />
    </View>
  );

  if (!fixture) return null;

  const kickoff = fixture.kickoffISO
    ? new Date(fixture.kickoffISO).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
    : null;

  const lcOpacity = lcAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const lcY = lcAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -24] });

  return (
    <View style={s.card}>
      {/* Üst bilgi */}
      <View style={s.meta}>
        <Text style={s.league}>{fixture.league ?? "Maç"}</Text>
        {kickoff && <Text style={s.kickoff}>⏱ {kickoff}</Text>}
      </View>

      {/* Takım isimleri */}
      <View style={s.teams}>
        <Text style={s.teamName} numberOfLines={2}>{fixture.home}</Text>
        <Text style={s.vs}>vs</Text>
        <Text style={s.teamName} numberOfLines={2}>{fixture.away}</Text>
      </View>

      {/* Sonuç butonları */}
      {!submitted ? (
        <View style={s.buttons}>
          {OUTCOMES.map(o => {
            const label = o.key === "home" ? fixture.home
              : o.key === "away" ? fixture.away
              : "X";

            const isSelected = selected === o.key;
            return (
              <TouchableOpacity
                key={o.key}
                onPress={() => handlePick(o.key)}
                disabled={busy}
                style={[
                  s.btn,
                  { borderColor: o.color },
                  isSelected && { backgroundColor: o.color },
                ]}
              >
                {busy && isSelected
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={[s.btnText, isSelected && { color: "#fff" }]} numberOfLines={1}>
                      {label}
                    </Text>
                }
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <View style={s.doneRow}>
          <Text style={s.doneText}>✅ Tahmin kaydedildi</Text>
          <Animated.Text style={[s.lcBadge, { opacity: lcOpacity, transform: [{ translateY: lcY }] }]}>
            +LC
          </Animated.Text>
        </View>
      )}

      {/* Detaylı tahmin linki */}
      <TouchableOpacity
        onPress={() => router.push({ pathname: "/(tabs)/live", params: { focusId: fixture.fixtureId } })}
        style={s.detailLink}
      >
        <Text style={s.detailText}>Detaylı tahmin →</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: "#0f172a",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1e293b",
    padding: 16,
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
  },
  meta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  league: { color: "#a3e635", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  kickoff: { color: "#64748b", fontSize: 11 },
  teams: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    gap: 8,
  },
  teamName: {
    flex: 1,
    color: "#f1f5f9",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  vs: { color: "#475569", fontSize: 12, fontWeight: "600", paddingHorizontal: 4 },
  buttons: { flexDirection: "row", gap: 8, marginBottom: 10 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#94a3b8", fontWeight: "800", fontSize: 12 },
  doneRow: { alignItems: "center", paddingVertical: 10, position: "relative" },
  doneText: { color: "#a3e635", fontWeight: "700", fontSize: 14 },
  lcBadge: {
    position: "absolute",
    top: -8,
    color: "#fbbf24",
    fontWeight: "900",
    fontSize: 16,
  },
  detailLink: { alignItems: "flex-end", marginTop: 4 },
  detailText: { color: "#475569", fontSize: 11 },
});
