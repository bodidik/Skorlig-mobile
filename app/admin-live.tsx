"use strict";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, FlatList, RefreshControl,
} from "react-native";
import Colors from "../constants/colors";
import { getApiBase } from "../lib/apiBase";
import { getAuthHeaders } from "../lib/apiFetch";

import { withAdminHeaders } from "../lib/adminToken";
import BackBar from "../components/BackBar";

// ─── Types ───────────────────────────────────────────────
type Fx = {
  fixtureId: string;
  home?: string | null;
  away?: string | null;
  kickoffISO?: string | null;
  status?: string | null;
  league?: string | null;
  score?: { home?: number | null; away?: number | null } | null;
  homeGoals?: number | null;
  awayGoals?: number | null;
};

// ─── Helpers ─────────────────────────────────────────────
async function apiFetch(path: string, init?: RequestInit) {
  const base = await getApiBase();
  const authH = await getAuthHeaders();
  const p = path.startsWith("/") ? path : `/${path}`;
  const headers: Record<string, string> = await withAdminHeaders({
    ...authH,
    ...((init?.headers as Record<string, string>) || {}),
  });
  return fetch(`${base}${p}`, { ...(init || {}), headers });
}

function toNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmtKick(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function scoreOf(fx: Fx) {
  const h = fx.score?.home ?? fx.homeGoals;
  const a = fx.score?.away ?? fx.awayGoals;
  if (typeof h === "number" && typeof a === "number") return `${h}–${a}`;
  return null;
}

const STATUS_ORDER: Record<string, number> = {
  LIVE: 0, "1H": 0, "2H": 0, HT: 1, NS: 2, FT: 3, AET: 3, PEN: 3,
};

// ─── Ana bileşen ─────────────────────────────────────────
export default function AdminLiveScreen() {
  const [fixtures, setFixtures] = useState<Fx[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [selected, setSelected] = useState<Fx | null>(null);

  // Kontrol paneli state
  const [minute, setMinute] = useState("0");
  const [status, setStatus] = useState("NS");
  const [homeGoals, setHomeGoals] = useState("0");
  const [awayGoals, setAwayGoals] = useState("0");
  const [htHome, setHtHome] = useState("");
  const [htAway, setHtAway] = useState("");
  const [firstGoal, setFirstGoal] = useState("");
  const [redHome, setRedHome] = useState(false);
  const [redAway, setRedAway] = useState(false);
  const [penaltyAny, setPenaltyAny] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // ── Maç listesini yükle ───────────────────────────────
  const loadFixtures = useCallback(async () => {
    try {
      const r = await apiFetch("/api/admin/fixtures").then(x => x.json());
      const list: Fx[] = r?.ok && Array.isArray(r.fixtures) ? r.fixtures : [];
      const nowMs = Date.now();
      // Sırala: canlı → HT → NS → FT, her grup içinde "şu ana en yakın" önce
      list.sort((a, b) => {
        const sa = STATUS_ORDER[String(a.status || "NS").toUpperCase()] ?? 2;
        const sb = STATUS_ORDER[String(b.status || "NS").toUpperCase()] ?? 2;
        if (sa !== sb) return sa - sb;
        const ta = new Date(a.kickoffISO || 0).getTime();
        const tb = new Date(b.kickoffISO || 0).getTime();
        return Math.abs(ta - nowMs) - Math.abs(tb - nowMs);
      });
      setFixtures(list);
    } catch (e: any) {
      Alert.alert("Hata", String(e?.message || e));
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadFixtures().finally(() => setLoading(false));
  }, [loadFixtures]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFixtures();
    setRefreshing(false);
  }, [loadFixtures]);

  // ── Maç seç → mevcut durumu sunucudan çek ────────────
  const selectFx = useCallback(async (fx: Fx) => {
    setSelected(fx);
    // Mevcut live state'i yükle
    try {
      const r = await apiFetch(`/api/rt/admin-live-gs?fixtureId=${encodeURIComponent(String(fx.fixtureId))}`).then(x => x.json());
      const st = r?.state;
      if (st) {
        setMinute(String(st.minute ?? 0));
        setStatus(String(st.status ?? "NS"));
        setHomeGoals(String(st.homeGoals ?? 0));
        setAwayGoals(String(st.awayGoals ?? 0));
        setHtHome(st.htHome != null ? String(st.htHome) : "");
        setHtAway(st.htAway != null ? String(st.htAway) : "");
        setFirstGoal(String(st.firstGoal ?? ""));
        setRedHome(!!st.redHome);
        setRedAway(!!st.redAway);
        setPenaltyAny(!!st.penaltyAny);
      } else {
        // Yeni maç — fixture bilgisinden doldur
        setMinute("0");
        setStatus(String(fx.status ?? "NS"));
        setHomeGoals(String(scoreOf(fx) ? (fx.score?.home ?? fx.homeGoals ?? 0) : 0));
        setAwayGoals(String(scoreOf(fx) ? (fx.score?.away ?? fx.awayGoals ?? 0) : 0));
        setHtHome(""); setHtAway(""); setFirstGoal("");
        setRedHome(false); setRedAway(false); setPenaltyAny(false);
      }
      setNote("");
    } catch {
      // sunucu hatası — form boş başlasın
    }
  }, []);

  // ── Güncelle (POST) ───────────────────────────────────
  const postUpdate = useCallback(async (patch?: Record<string, any>) => {
    if (!selected) return;
    const fid = String(selected.fixtureId);
    try {
      setSaving(true);
      const body: any = {
        fixtureId: fid,
        teamHome: selected.home,
        teamAway: selected.away,
        kickoffISO: selected.kickoffISO,
        league: selected.league,
        minute: toNum(minute) ?? 0,
        status,
        homeGoals: toNum(homeGoals) ?? 0,
        awayGoals: toNum(awayGoals) ?? 0,
        htHome: htHome !== "" ? toNum(htHome) : undefined,
        htAway: htAway !== "" ? toNum(htAway) : undefined,
        firstGoal: firstGoal.trim() || undefined,
        redHome,
        redAway,
        penaltyAny,
        ...patch,
      };
      if (note.trim()) body.note = note.trim();

      const r = await apiFetch("/api/rt/admin-live-gs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(x => x.json());

      if (!r?.ok) { Alert.alert("Hata", r?.error || "POST_FAILED"); return; }

      // Sunucudan dönen state'i UI'a yansıt
      const st = r.state;
      if (st) {
        setMinute(String(st.minute ?? 0));
        setStatus(String(st.status ?? "NS"));
        setHomeGoals(String(st.homeGoals ?? 0));
        setAwayGoals(String(st.awayGoals ?? 0));
        if (st.htHome != null) setHtHome(String(st.htHome));
        if (st.htAway != null) setHtAway(String(st.htAway));
      }
      setNote("");
      // Listeyi de yenile (skor badge güncellenir)
      await loadFixtures();
    } catch (e: any) {
      Alert.alert("Hata", String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }, [selected, minute, status, homeGoals, awayGoals, htHome, htAway, firstGoal, redHome, redAway, penaltyAny, note, loadFixtures]);

  const quickStatus = (s: string) => {
    if (s === "HT") {
      // HT basıldığında mevcut skoru HT alanlarına otomatik kopyala
      const hg = String(toNum(homeGoals) ?? 0);
      const ag = String(toNum(awayGoals) ?? 0);
      setHtHome(hg);
      setHtAway(ag);
      postUpdate({ status: "HT", htHome: toNum(homeGoals) ?? 0, htAway: toNum(awayGoals) ?? 0 });
    } else {
      postUpdate({ status: s });
    }
  };
  const goalH = () => {
    const curH = toNum(homeGoals) ?? 0;
    const curA = toNum(awayGoals) ?? 0;
    const patch: Record<string, any> = { homeGoals: curH + 1, status: status === "NS" ? "LIVE" : status };
    // İlk gol otomatik algıla: skor 0-0 iken ilk gol atılıyorsa
    if (curH === 0 && curA === 0) {
      patch.firstGoal = "H";
      setFirstGoal("H");
    }
    postUpdate(patch);
  };
  const goalA = () => {
    const curH = toNum(homeGoals) ?? 0;
    const curA = toNum(awayGoals) ?? 0;
    const patch: Record<string, any> = { awayGoals: curA + 1, status: status === "NS" ? "LIVE" : status };
    if (curH === 0 && curA === 0) {
      patch.firstGoal = "A";
      setFirstGoal("A");
    }
    postUpdate(patch);
  };

  // ── FT Bitir + Tahminleri Settle Et ──────────────────
  const finishAndSettle = useCallback(async () => {
    if (!selected) return;
    const fid = String(selected.fixtureId);
    const h = toNum(homeGoals) ?? 0;
    const a = toNum(awayGoals) ?? 0;

    Alert.alert(
      "Maçı Bitir",
      `${selected.home} ${h}–${a} ${selected.away}\n\nSonuç kaydedilip tüm tahminler settle edilecek. Emin misin?`,
      [
        { text: "İptal", style: "cancel" },
        {
          text: "Evet, Bitir",
          style: "destructive",
          onPress: async () => {
            try {
              setSaving(true);
              // 1) Önce live state'i FT olarak güncelle
              await apiFetch("/api/rt/admin-live-gs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  fixtureId: fid,
                  teamHome: selected.home,
                  teamAway: selected.away,
                  kickoffISO: selected.kickoffISO,
                  league: selected.league,
                  minute: toNum(minute) ?? 90,
                  status: "FT",
                  homeGoals: h,
                  awayGoals: a,
                  htHome: htHome !== "" ? toNum(htHome) : undefined,
                  htAway: htAway !== "" ? toNum(htAway) : undefined,
                  firstGoal: firstGoal.trim() || undefined,
                  redHome, redAway, penaltyAny,
                }),
              });
              // 2) results.json'a kaydet
              const setRes = await apiFetch("/api/admin/results/set", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fixtureId: fid, home: h, away: a, updatedBy: "admin-mobile" }),
              });
              const setJson = await setRes.json();
              if (!setJson?.ok) {
                Alert.alert("Hata", setJson?.error || "RESULTS_SET_FAILED");
                return;
              }
              // 3) Tahminleri settle et
              const sRes = await apiFetch("/api/rt/settle2", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fixtureId: fid }),
              });
              const sJson = await sRes.json();
              if (!sJson?.ok) {
                Alert.alert("Hata", sJson?.error || "SETTLE_FAILED");
                return;
              }
              const settled = sJson?.leaderboard?.length ?? "?";
              const topScore = sJson?.leaderboard
                ?.slice()
                .sort((a: any, b: any) => (b.points ?? 0) - (a.points ?? 0))[0];
              const topLine = topScore
                ? `\n\n🥇 ${topScore.userId}: ${Math.round(topScore.points * 10) / 10} puan`
                : "";
              Alert.alert(
                "Maç Bitti ✓",
                `${selected.home} ${h}–${a} ${selected.away}\n\n${settled} tahmin settle edildi.${topLine}`
              );
              setStatus("FT");
              await loadFixtures();
            } catch (e: any) {
              Alert.alert("Hata", String(e?.message || e));
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  }, [selected, homeGoals, awayGoals, minute, status, htHome, htAway, firstGoal, redHome, redAway, penaltyAny, loadFixtures]);

  // ── Maç kartı ────────────────────────────────────────
  const renderFx = ({ item: fx }: { item: Fx }) => {
    const st = String(fx.status || "NS").toUpperCase();
    const isLive = st === "LIVE" || st === "1H" || st === "2H";
    const isHT = st === "HT";
    const isFT = st === "FT" || st === "AET" || st === "PEN";
    const isActive = selected?.fixtureId === String(fx.fixtureId);
    const sc = scoreOf(fx);

    const stColor = isLive ? Colors.live : isHT ? "#f59e0b" : isFT ? "#64748b" : Colors.muted;
    const stLabel = isLive ? `🔴 ${st}` : isHT ? "⏸ HT" : isFT ? "FT" : "NS";

    return (
      <TouchableOpacity
        onPress={() => selectFx(fx)}
        style={{
          marginBottom: 8, padding: 12, borderRadius: 12,
          borderWidth: isActive ? 2 : 1,
          borderColor: isActive ? Colors.accent : isLive ? "#22c55e55" : Colors.border,
          backgroundColor: isActive ? "#0f172a" : isLive ? "#0a1f0a" : "#111827",
          flexDirection: "row", alignItems: "center", gap: 10,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "800", fontSize: 14, color: "#f1f5f9" }} numberOfLines={1}>
            {fx.home ?? "?"} — {fx.away ?? "?"}
          </Text>
          <Text style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>
            {fmtKick(fx.kickoffISO)}{fx.league ? ` · ${fx.league}` : ""}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 2 }}>
          {sc && <Text style={{ fontWeight: "900", fontSize: 16, color: isLive ? Colors.live : "#94a3b8" }}>{sc}</Text>}
          <Text style={{ fontWeight: "700", fontSize: 11, color: stColor }}>{stLabel}</Text>
        </View>
        {isActive && <Text style={{ color: Colors.accent, fontSize: 18 }}>›</Text>}
      </TouchableOpacity>
    );
  };

  // ── Kontrol paneli ────────────────────────────────────
  const ControlPanel = selected ? (
    <View style={{
      margin: 12, marginTop: 0, padding: 14,
      borderRadius: 14, borderWidth: 2, borderColor: Colors.accent,
      backgroundColor: "#0f172a",
    }}>
      {/* Maç başlığı */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "900", fontSize: 16, color: "#f1f5f9" }} numberOfLines={1}>
            {selected.home} — {selected.away}
          </Text>
          <Text style={{ color: "#64748b", fontSize: 11 }}>
            {fmtKick(selected.kickoffISO)} · {String(selected.fixtureId)}
          </Text>
        </View>
        <TouchableOpacity onPress={() => setSelected(null)}>
          <Text style={{ color: "#64748b", fontSize: 20 }}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Büyük skor */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 14 }}>
        {/* Ev takımı */}
        <View style={{ alignItems: "center", backgroundColor: "#1e3a5f", borderRadius: 12, padding: 10, minWidth: 90 }}>
          <Text style={{ color: "#93c5fd", fontSize: 11, fontWeight: "700", marginBottom: 4 }} numberOfLines={1}>{selected.home}</Text>
          <TextInput
            value={homeGoals}
            onChangeText={v => setHomeGoals(v.replace(/[^0-9]/g, ""))}
            keyboardType="number-pad"
            style={{ color: "#fff", fontSize: 44, fontWeight: "900", lineHeight: 52, textAlign: "center", minWidth: 60 }}
          />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
            <TouchableOpacity
              onPress={() => { const n = Math.max(0, (toNum(homeGoals) ?? 0) - 1); setHomeGoals(String(n)); }}
              style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6, backgroundColor: "#0f2540" }}
            >
              <Text style={{ color: "#93c5fd", fontWeight: "900", fontSize: 18 }}>−</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={goalH}
              style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6, backgroundColor: "#1d4ed8" }}
            >
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 18 }}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ alignItems: "center", gap: 4 }}>
          <Text style={{ color: "#64748b", fontWeight: "900", fontSize: 20 }}>–</Text>
          <Text style={{ color: saving ? "#f59e0b" : "#22c55e", fontWeight: "800", fontSize: 12 }}>
            {saving ? "..." : status}
          </Text>
          <Text style={{ color: "#475569", fontSize: 10 }}>{minute}'</Text>
        </View>

        {/* Deplasman */}
        <View style={{ alignItems: "center", backgroundColor: "#3b1f3f", borderRadius: 12, padding: 10, minWidth: 90 }}>
          <Text style={{ color: "#d8b4fe", fontSize: 11, fontWeight: "700", marginBottom: 4 }} numberOfLines={1}>{selected.away}</Text>
          <TextInput
            value={awayGoals}
            onChangeText={v => setAwayGoals(v.replace(/[^0-9]/g, ""))}
            keyboardType="number-pad"
            style={{ color: "#fff", fontSize: 44, fontWeight: "900", lineHeight: 52, textAlign: "center", minWidth: 60 }}
          />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
            <TouchableOpacity
              onPress={() => { const n = Math.max(0, (toNum(awayGoals) ?? 0) - 1); setAwayGoals(String(n)); }}
              style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6, backgroundColor: "#2d1540" }}
            >
              <Text style={{ color: "#d8b4fe", fontWeight: "900", fontSize: 18 }}>−</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={goalA}
              style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6, backgroundColor: "#7c3aed" }}
            >
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 18 }}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Hızlı durum butonları */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
        {[
          { label: "▶ LIVE", s: "LIVE", bg: "#22c55e" },
          { label: "⏸ HT", s: "HT", bg: "#f59e0b" },
          { label: "✓ FT", s: "FT", bg: "#ef4444" },
          { label: "2H", s: "2H", bg: "#3b82f6" },
          { label: "NS", s: "NS", bg: "#334155" },
          { label: "AET", s: "AET", bg: "#a855f7" },
        ].map(({ label, s, bg }) => (
          <TouchableOpacity
            key={s}
            onPress={() => { setStatus(s); quickStatus(s); }}
            disabled={saving}
            style={{
              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
              backgroundColor: status === s ? bg : "#1e2d3d",
              borderWidth: 1, borderColor: status === s ? bg : "#334155",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Dakika */}
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <Text style={{ color: "#64748b", fontSize: 12, width: 50 }}>Dakika</Text>
        <TouchableOpacity onPress={() => { const m = (toNum(minute) ?? 0) - 1; setMinute(String(Math.max(0,m))); }} style={{ padding: 8, borderRadius: 8, backgroundColor: "#1e2d3d" }}>
          <Text style={{ color: "#fff", fontWeight: "900" }}>−</Text>
        </TouchableOpacity>
        <TextInput
          value={minute}
          onChangeText={setMinute}
          keyboardType="number-pad"
          style={{ flex: 1, color: "#f1f5f9", fontWeight: "700", fontSize: 16, textAlign: "center", borderWidth: 1, borderColor: "#334155", borderRadius: 8, paddingVertical: 6 }}
        />
        <TouchableOpacity onPress={() => { const m = (toNum(minute) ?? 0) + 1; setMinute(String(m)); }} style={{ padding: 8, borderRadius: 8, backgroundColor: "#1e2d3d" }}>
          <Text style={{ color: "#fff", fontWeight: "900" }}>+</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setMinute(String((toNum(minute) ?? 0) + 5)); }} style={{ padding: 8, borderRadius: 8, backgroundColor: "#1e2d3d" }}>
          <Text style={{ color: "#94a3b8", fontWeight: "700" }}>+5</Text>
        </TouchableOpacity>
      </View>

      {/* HT skoru */}
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <Text style={{ color: "#64748b", fontSize: 12, width: 50 }}>HT</Text>
        <TextInput value={htHome} onChangeText={setHtHome} keyboardType="number-pad" placeholder="H" placeholderTextColor="#475569"
          style={{ flex: 1, color: "#f1f5f9", textAlign: "center", borderWidth: 1, borderColor: "#334155", borderRadius: 8, paddingVertical: 6 }} />
        <Text style={{ color: "#475569" }}>–</Text>
        <TextInput value={htAway} onChangeText={setHtAway} keyboardType="number-pad" placeholder="A" placeholderTextColor="#475569"
          style={{ flex: 1, color: "#f1f5f9", textAlign: "center", borderWidth: 1, borderColor: "#334155", borderRadius: 8, paddingVertical: 6 }} />
      </View>

      {/* Togglelar */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        {[
          { label: "🟥 Ev Kırmızı", val: redHome, set: setRedHome },
          { label: "🟥 Dep Kırmızı", val: redAway, set: setRedAway },
          { label: "⚽ Penaltı", val: penaltyAny, set: setPenaltyAny },
        ].map(({ label, val, set }) => (
          <TouchableOpacity
            key={label}
            onPress={() => set(!val)}
            style={{
              flex: 1, paddingVertical: 8, borderRadius: 8,
              backgroundColor: val ? "#7c3aed" : "#1e2d3d",
              borderWidth: 1, borderColor: val ? "#7c3aed" : "#334155",
            }}
          >
            <Text style={{ color: val ? "#fff" : "#64748b", textAlign: "center", fontSize: 10, fontWeight: "700" }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* İlk gol */}
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <Text style={{ color: "#64748b", fontSize: 12, width: 50 }}>İlk Gol</Text>
        {["H", "A", ""].map((v) => (
          <TouchableOpacity key={v || "none"} onPress={() => setFirstGoal(v)}
            style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: firstGoal === v ? "#3b82f6" : "#1e2d3d", borderWidth: 1, borderColor: firstGoal === v ? "#3b82f6" : "#334155" }}>
            <Text style={{ color: firstGoal === v ? "#fff" : "#64748b", textAlign: "center", fontWeight: "700" }}>{v || "–"}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Not */}
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Not (timeline): 45' sarı kart, gol iptal..."
        placeholderTextColor="#475569"
        multiline
        style={{
          color: "#f1f5f9", borderWidth: 1, borderColor: "#334155", borderRadius: 8,
          paddingHorizontal: 10, paddingVertical: 8, fontSize: 12, marginBottom: 12, minHeight: 50,
        }}
      />

      {/* Kaydet */}
      <TouchableOpacity
        onPress={() => postUpdate()}
        disabled={saving}
        style={{
          paddingVertical: 14, borderRadius: 12, marginBottom: 8,
          backgroundColor: saving ? "#334155" : Colors.accent,
        }}
      >
        <Text style={{ textAlign: "center", color: "#fff", fontWeight: "900", fontSize: 15 }}>
          {saving ? "Kaydediliyor..." : "💾 Güncelle"}
        </Text>
      </TouchableOpacity>

      {/* FT Bitir + Settle */}
      <TouchableOpacity
        onPress={finishAndSettle}
        disabled={saving}
        style={{
          paddingVertical: 14, borderRadius: 12,
          backgroundColor: saving ? "#334155" : "#dc2626",
          borderWidth: 2, borderColor: "#ef4444",
        }}
      >
        <Text style={{ textAlign: "center", color: "#fff", fontWeight: "900", fontSize: 15 }}>
          🏁 FT Bitir + Tahminleri Settle Et
        </Text>
      </TouchableOpacity>
    </View>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: "#020617" }}>
      <BackBar title="🎮 Canlı Admin" />
      {/* Başlık */}
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <Text style={{ fontSize: 11, color: "#475569" }}>
          Maça dokun → kontrol paneli açılır
        </Text>
      </View>

      <FlatList
        data={fixtures}
        keyExtractor={fx => String(fx.fixtureId)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#475569" />}
        contentContainerStyle={{ padding: 12, paddingTop: 4, paddingBottom: 40 }}
        ListHeaderComponent={ControlPanel}
        ListEmptyComponent={
          loading
            ? <View style={{ paddingVertical: 40, alignItems: "center" }}><ActivityIndicator color="#475569" /></View>
            : <Text style={{ color: "#475569", textAlign: "center", paddingVertical: 40 }}>Maç bulunamadı</Text>
        }
        renderItem={renderFx}
      />
    </View>
  );
}
