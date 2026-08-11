import React, { useState, useRef } from "react";
import { t, useLang } from "../lib/i18n";
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  Animated, StyleSheet, Alert,
} from "react-native";
import hataMesaji from "../lib/hataMesaji";
import { apiFetch } from "../lib/apiFetch";

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

// Skor sayacı: +/− butonlu küçük sayaç
function ScoreCounter({
  value, onChange, disabled,
}: { value: number; onChange: (v: number) => void; disabled: boolean }) {
  return (
    <View style={sc.row}>
      <TouchableOpacity onPress={() => onChange(Math.max(0, value - 1))} disabled={disabled} style={sc.btn}>
        <Text style={sc.op}>−</Text>
      </TouchableOpacity>
      <Text style={sc.val}>{value}</Text>
      <TouchableOpacity onPress={() => onChange(Math.min(20, value + 1))} disabled={disabled} style={sc.btn}>
        <Text style={sc.op}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const sc = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  btn: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#1e293b", alignItems: "center", justifyContent: "center" },
  op: { color: "#94a3b8", fontSize: 16, fontWeight: "700", lineHeight: 20 },
  val: { color: "#f1f5f9", fontSize: 15, fontWeight: "800", minWidth: 22, textAlign: "center" },
});

// Üç seçenek düğmesi (Evet/Hayır/Fark Etmez)
function TriButton({
  value, onChange, disabled,
}: { value: boolean | null; onChange: (v: boolean | null) => void; disabled: boolean }) {
  const opts: { label: string; val: boolean | null; color: string }[] = [
    { label: t("qpYes"), val: true, color: "#22c55e" },
    { label: t("qpNo"), val: false, color: "#ef4444" },
    { label: t("qpNeutral"), val: null, color: "#475569" },
  ];
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {opts.map(o => (
        <TouchableOpacity
          key={String(o.val)}
          onPress={() => onChange(o.val)}
          disabled={disabled}
          style={[
            tb.btn,
            value === o.val && { backgroundColor: o.color, borderColor: o.color },
            value !== o.val && { borderColor: o.color },
          ]}
        >
          <Text style={[tb.label, value === o.val && { color: "#fff" }]}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const tb = StyleSheet.create({
  btn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1.5, borderColor: "#475569" },
  label: { color: "#94a3b8", fontSize: 11, fontWeight: "700" },
});

export default function QuickPickCard({ fixture, onPredicted, compact }: Props) {
  useLang();
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const lcAnim = useRef(new Animated.Value(0)).current;
  const [earnedLC, setEarnedLC] = useState(0);

  // Detay paneli
  const [detayAcik, setDetayAcik] = useState(false);
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [skorGirildi, setSkorGirildi] = useState(false);
  const [penaltyVal, setPenaltyVal] = useState<boolean | null>(null);
  const [redVal, setRedVal] = useState<boolean | null>(null);
  const [detayBusy, setDetayBusy] = useState(false);
  const [detayGonderildi, setDetayGonderildi] = useState(false);

  const kickoff = fixture.kickoffISO
    ? new Date(fixture.kickoffISO).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
    : null;

  // 1X2 hızlı submit
  async function handlePick(outcomeKey: "home" | "draw" | "away") {
    if (submitted || busy) return;
    setSelected(outcomeKey);
    setBusy(true);
    try {
      const res = await apiFetch(`/api/pred/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fixtureId: fixture.fixtureId,
          outcome: OUTCOMES.find(o => o.key === outcomeKey)!.api,
          type: "result",
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || j?.ok === false) {
        Alert.alert(t("qpPredFailed"), hataMesaji(j?.error));
        setSelected(null);
        return;
      }
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

  // Tahmini geri al
  async function handleGeriAl() {
    Alert.alert(
      t("cancelPredTitle"),
      t("cancelPredMsg"),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("qpDelete"),
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              const res = await apiFetch(`/api/pred/cancel`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fixtureId: fixture.fixtureId }),
              });
              const j = await res.json().catch(() => null);
              if (!res.ok || j?.ok === false) {
                Alert.alert(t("qpDeleteFailed"), hataMesaji(j?.error));
                return;
              }
              // Kartı başa sıfırla
              setSubmitted(false);
              setSelected(null);
              setDetayAcik(false);
              setSkorGirildi(false);
              setDetayGonderildi(false);
              setPenaltyVal(null);
              setRedVal(null);
            } catch {}
            setBusy(false);
          },
        },
      ]
    );
  }

  // Detay alanlarını gönder (skor + penaltı + kırmızı)
  async function handleDetayGonder() {
    if (!skorGirildi && penaltyVal === null && redVal === null) {
      Alert.alert(t("qpNoDetailTitle"), t("qpNoDetailMsg"));
      return;
    }
    setDetayBusy(true);
    try {
      const body: Record<string, unknown> = { fixtureId: fixture.fixtureId };
      if (skorGirildi) { body.home = homeScore; body.away = awayScore; }
      if (penaltyVal !== null) body.penaltyAny = penaltyVal;
      if (redVal !== null) body.redAny = redVal;

      const res = await apiFetch(`/api/pred/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || j?.ok === false) {
        Alert.alert(t("qpDetailFailed"), hataMesaji(j?.error));
        return;
      }
      setDetayGonderildi(true);
      setDetayAcik(false);
    } catch {}
    setDetayBusy(false);
  }

  const lcOpacity = lcAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const lcY = lcAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -20] });

  return (
    <View style={[s.card, compact && s.cardCompact]}>
      <View style={s.meta}>
        <Text style={s.league} numberOfLines={1}>{fixture.league ?? t("matchFallback")}</Text>
        {kickoff && <Text style={s.kickoff}>⏱ {kickoff}</Text>}
      </View>

      <View style={s.teams}>
        <Text style={s.teamName} numberOfLines={1}>{fixture.home}</Text>
        <Text style={s.vs}>vs</Text>
        <Text style={s.teamName} numberOfLines={1}>{fixture.away}</Text>
      </View>

      {!submitted ? (
        // ── Henüz tahmin yok: 1X2 butonları ──
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
        // ── Tahmin yapıldı: seçim göster + detay paneli ──
        <View>
          {/* Seçim özeti + geri al */}
          <View style={s.doneRow}>
            <View style={s.doneLeft}>
              <Text style={s.doneText}>
                ✅ {t("qpPicked", {
                  p: selected === "home" ? fixture.home
                    : selected === "away" ? fixture.away
                    : t("qpDrawLbl"),
                })}
              </Text>
              {detayGonderildi && (
                <Text style={s.detayDoneText}>{t("qpDetailDone")}</Text>
              )}
            </View>
            <Animated.Text style={[s.lcBadge, { opacity: lcOpacity, transform: [{ translateY: lcY }] }]}>
              +{earnedLC} LC
            </Animated.Text>
            {!busy && (
              <TouchableOpacity onPress={handleGeriAl} style={s.geriAlBtn}>
                <Text style={s.geriAlText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Detay aç/kapat butonu */}
          {!detayGonderildi && (
            <TouchableOpacity
              onPress={() => setDetayAcik(v => !v)}
              style={s.detayToggle}
            >
              <Text style={s.detayToggleText}>
                {detayAcik ? t("qpDetailClose") : t("qpDetailOpen")}
              </Text>
            </TouchableOpacity>
          )}

          {/* Detay paneli */}
          {detayAcik && !detayGonderildi && (
            <View style={s.detayPanel}>
              {/* Skor */}
              <View style={s.detayRow}>
                <Text style={s.detayLbl}>{t("qpScoreLbl")}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <ScoreCounter
                    value={homeScore}
                    onChange={v => { setHomeScore(v); setSkorGirildi(true); }}
                    disabled={detayBusy}
                  />
                  <Text style={s.detaySep}>:</Text>
                  <ScoreCounter
                    value={awayScore}
                    onChange={v => { setAwayScore(v); setSkorGirildi(true); }}
                    disabled={detayBusy}
                  />
                </View>
              </View>

              {/* Penaltı */}
              <View style={s.detayRow}>
                <Text style={s.detayLbl}>{t("qpPenaltyQ")}</Text>
                <TriButton value={penaltyVal} onChange={setPenaltyVal} disabled={detayBusy} />
              </View>

              {/* Kırmızı kart */}
              <View style={s.detayRow}>
                <Text style={s.detayLbl}>{t("qpRedQ")}</Text>
                <TriButton value={redVal} onChange={setRedVal} disabled={detayBusy} />
              </View>

              {/* Gönder */}
              <TouchableOpacity
                onPress={handleDetayGonder}
                disabled={detayBusy}
                style={s.detayGonderBtn}
              >
                {detayBusy
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.detayGonderText}>{t("qpSaveDetail")}</Text>
                }
              </TouchableOpacity>
            </View>
          )}
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
  // Done state
  doneRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6, position: "relative" },
  doneLeft: { flex: 1 },
  doneText: { color: "#a3e635", fontWeight: "700", fontSize: 12 },
  detayDoneText: { color: "#60a5fa", fontSize: 10, fontWeight: "600", marginTop: 2 },
  lcBadge: { position: "absolute", right: 28, top: -6, color: "#fbbf24", fontWeight: "900", fontSize: 15 },
  geriAlBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#1e293b", alignItems: "center", justifyContent: "center" },
  geriAlText: { color: "#ef4444", fontWeight: "800", fontSize: 13 },
  // Detay toggle
  detayToggle: { marginTop: 6, paddingVertical: 6, alignItems: "center", borderTopWidth: 1, borderTopColor: "#1e293b" },
  detayToggleText: { color: "#60a5fa", fontSize: 11, fontWeight: "700" },
  // Detay paneli
  detayPanel: { marginTop: 8, gap: 10 },
  detayRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  detayLbl: { color: "#94a3b8", fontSize: 11, fontWeight: "700" },
  detaySep: { color: "#475569", fontSize: 16, fontWeight: "700" },
  detayGonderBtn: { backgroundColor: "#2563eb", borderRadius: 8, paddingVertical: 9, alignItems: "center", marginTop: 4 },
  detayGonderText: { color: "#fff", fontSize: 12, fontWeight: "800" },
});
