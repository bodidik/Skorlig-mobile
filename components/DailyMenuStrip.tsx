import React, { useEffect, useState } from "react";
import {
  View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Animated,
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
};

type Props = { country?: string | null; userId?: string };

const OUTCOMES = [
  { key: "home", api: "H", color: "#3b82f6" },
  { key: "draw", api: "D", color: "#475569" },
  { key: "away", api: "A", color: "#f97316" },
] as const;

function MatchCard({ fx, onDone }: { fx: Fixture; onDone: () => void }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const fade = React.useRef(new Animated.Value(0)).current;

  const kickoff = fx.kickoffISO
    ? new Date(fx.kickoffISO).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
    : null;

  async function pick(outcomeKey: string) {
    if (done || busy) return;
    const apiVal = OUTCOMES.find(o => o.key === outcomeKey)?.api ?? "D";
    setSelected(outcomeKey);
    setBusy(true);
    try {
      const base = await getApiBase();
      const authH = await getAuthHeaders();
      await fetch(`${base}/api/pred/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authH },
        body: JSON.stringify({ fixtureId: fx.fixtureId, outcome: apiVal, type: "result" }),
      });
      setDone(true);
      Animated.sequence([
        Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.delay(800),
        Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(onDone);
    } catch { setSelected(null); }
    setBusy(false);
  }

  return (
    <View style={s.card}>
      {/* Lig + saat */}
      <View style={s.cardTop}>
        <Text style={s.league} numberOfLines={1}>{fx.league ?? "Maç"}</Text>
        {kickoff && <Text style={s.kickoff}>{kickoff}</Text>}
      </View>

      {/* Butonlar: [Ev adı] [X] [Dep adı] */}
      <View style={s.row}>
        {OUTCOMES.map(o => {
          const label = o.key === "home" ? fx.home : o.key === "away" ? fx.away : "X";
          const isOn = selected === o.key;
          return (
            <TouchableOpacity
              key={o.key}
              onPress={() => pick(o.key)}
              disabled={done || busy}
              style={[
                s.btn,
                o.key === "draw" ? s.btnDraw : s.btnSide,
                isOn && { backgroundColor: o.color, borderColor: o.color },
              ]}
            >
              {busy && isOn
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text
                    style={[s.btnLabel, isOn && { color: "#fff" }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {label}
                  </Text>
              }
            </TouchableOpacity>
          );
        })}
      </View>

      {/* +LC animasyonu */}
      {done && (
        <Animated.Text style={[s.lc, { opacity: fade }]}>+LC ✓</Animated.Text>
      )}

      {/* Detaylı tahmin */}
      <TouchableOpacity
        onPress={() => router.push({ pathname: "/(tabs)/live", params: { focusId: fx.fixtureId } })}
      >
        <Text style={s.detail}>detaylı tahmin →</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function DailyMenuStrip({ country }: Props) {
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const base = await getApiBase();
        const qs = country ? `?country=${encodeURIComponent(country)}` : "";
        const r = await fetch(`${base}/api/live/daily-menu${qs}`);
        const json = await r.json();
        if (!cancelled && json.ok) setFixtures(json.fixtures || []);
      } catch {}
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [country]);

  if (loading) return (
    <View style={s.loadWrap}><ActivityIndicator color="#a3e635" /></View>
  );

  if (!fixtures.length) return null;

  const visible = fixtures.filter(f => !done.has(f.fixtureId));
  if (!visible.length) return null;

  return (
    <View style={s.strip}>
      <Text style={s.header}>⚡ Günün Maçları</Text>
      {visible.map(fx => (
        <MatchCard
          key={fx.fixtureId}
          fx={fx}
          onDone={() => setDone(prev => new Set([...prev, fx.fixtureId]))}
        />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  strip: { marginHorizontal: 12, marginTop: 12, gap: 8 },
  header: { color: "#a3e635", fontSize: 12, fontWeight: "800", letterSpacing: 0.6, marginBottom: 2 },
  loadWrap: { padding: 20, alignItems: "center" },

  card: {
    backgroundColor: "#0f172a",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1e293b",
    padding: 12,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  league: { color: "#64748b", fontSize: 10, flex: 1 },
  kickoff: { color: "#64748b", fontSize: 10 },

  row: { flexDirection: "row", gap: 6 },
  btn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
  },
  btnSide: { flex: 2, borderColor: "#1e293b" },
  btnDraw: { flex: 1, borderColor: "#1e293b" },
  btnLabel: { color: "#94a3b8", fontWeight: "700", fontSize: 12 },

  lc: { color: "#fbbf24", fontWeight: "900", fontSize: 13, textAlign: "center", marginTop: 6 },
  detail: { color: "#334155", fontSize: 10, textAlign: "right", marginTop: 6 },
});
