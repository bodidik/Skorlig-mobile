import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
} from "react-native";
import Colors from "../../constants/colors";
import { getApiBase, syncServerTime } from "../../lib/apiBase";
import { withAdminHeaders, hasAdminToken } from "../../lib/adminToken";
import BackBar from "../../components/BackBar";

// --------------- tipler ---------------
type Fx = {
  fixtureId: string;
  home?: string | null;
  away?: string | null;
  kickoffISO?: string | null;
  status?: string | null;
  score?: { home?: number | null; away?: number | null } | null;
  homeGoals?: number | null;
  awayGoals?: number | null;
  league?: string | null;
};

type ResultEntry = {
  fixtureId: string;
  home?: number;
  away?: number;
  updatedAt?: string;
  updatedBy?: string;
};

function fmtKick(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return String(iso);
  return d.toLocaleString("tr-TR", {
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

async function apiFetch(path: string, init?: RequestInit) {
  const base = await getApiBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  const headers: Record<string, string> = await withAdminHeaders({
    ...((init?.headers as Record<string, string>) || {}),
  });
  return fetch(`${base}${p}`, { ...(init || {}), headers });
}

// --------------- bileşen ---------------
export default function AdminResultsScreen() {
  const [tokenReady, setTokenReady] = useState(false);
  useEffect(() => { hasAdminToken().then(setTokenReady); }, []);

  const [fixtures, setFixtures] = useState<Fx[]>([]);
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // inline editor
  const [selected, setSelected] = useState<Fx | null>(null);
  const [homeVal, setHomeVal] = useState("");
  const [awayVal, setAwayVal] = useState("");
  const [htHomeVal, setHtHomeVal] = useState("");
  const [htAwayVal, setHtAwayVal] = useState("");
  const [firstGoal, setFirstGoal] = useState<"H" | "A" | null>(null);
  const [redHome, setRedHome] = useState(false);
  const [redAway, setRedAway] = useState(false);
  const [penaltyAny, setPenaltyAny] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  // tab: "all" | "pending" | "done"
  const [tab, setTab] = useState<"all" | "pending" | "done">("pending");

  const loadAll = useCallback(async () => {
    setErr(null);
    try {
      await syncServerTime();
      // tüm maçları çek — /api/admin/fixtures zaman filtresi uygulamaz,
      // PILOT_MANUAL modda da çalışır (live2/schedule pilot modda boş dönüyordu)
      const [fxRes, resRes] = await Promise.all([
        apiFetch("/api/admin/fixtures"),
        apiFetch("/api/admin/results/recent?limit=200"),
      ]);
      const fxJson = await fxRes.json();
      const resJson = await resRes.json();

      setFixtures(Array.isArray(fxJson?.fixtures) ? fxJson.fixtures : []);
      setResults(Array.isArray(resJson?.items) ? resJson.items : []);
    } catch (e: any) {
      setErr(String(e?.message || e));
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadAll().finally(() => setLoading(false));
  }, [loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  // results haritası
  const resultMap = useMemo(() => {
    const m = new Map<string, ResultEntry>();
    for (const r of results) m.set(String(r.fixtureId), r);
    return m;
  }, [results]);

  // filtrelenmiş liste
  const listData = useMemo(() => {
    const sorted = [...fixtures].sort((a, b) => {
      const ta = new Date(a.kickoffISO || 0).getTime();
      const tb = new Date(b.kickoffISO || 0).getTime();
      return tb - ta; // en yeni önce
    });
    if (tab === "pending") {
      return sorted.filter((f) => {
        const st = String(f.status || "").toUpperCase();
        const hasResult = resultMap.has(String(f.fixtureId));
        return (st === "FT" || st === "AET" || st === "PEN") && !hasResult;
      });
    }
    if (tab === "done") {
      return sorted.filter((f) => resultMap.has(String(f.fixtureId)));
    }
    return sorted; // all
  }, [fixtures, tab, resultMap]);

  const pendingCount = useMemo(() =>
    fixtures.filter((f) => {
      const st = String(f.status || "").toUpperCase();
      const hasResult = resultMap.has(String(f.fixtureId));
      return (st === "FT" || st === "AET" || st === "PEN") && !hasResult;
    }).length,
    [fixtures, resultMap]
  );

  const openEditor = (fx: Fx) => {
    setSelected(fx);
    const r: any = resultMap.get(String(fx.fixtureId));
    setHomeVal(r ? String(r.home ?? "") : "");
    setAwayVal(r ? String(r.away ?? "") : "");
    setHtHomeVal(r?.htScore?.home != null ? String(r.htScore.home) : "");
    setHtAwayVal(r?.htScore?.away != null ? String(r.htScore.away) : "");
    setFirstGoal(r?.firstGoal === "H" || r?.firstGoal === "A" ? r.firstGoal : null);
    setRedHome(!!r?.redHome);
    setRedAway(!!r?.redAway);
    setPenaltyAny(typeof r?.penaltyAny === "boolean" ? r.penaltyAny : null);
  };

  const canSave = useMemo(() => {
    if (!selected) return false;
    const h = Number(homeVal);
    const a = Number(awayVal);
    return Number.isFinite(h) && Number.isFinite(a) && h >= 0 && a >= 0 &&
      homeVal.trim() !== "" && awayVal.trim() !== "";
  }, [selected, homeVal, awayVal]);

  const save = useCallback(async () => {
    if (!selected || !canSave) return;
    if (!tokenReady) {
      Alert.alert("Admin", "Token ayarlı değil. Profil > Admin bölümünden token gir.");
      return;
    }

    const h = Number(homeVal);
    const a = Number(awayVal);
    const fxId = selected.fixtureId;

    try {
      setSaving(true);

      // 1) skoru + mikro sonuçları kaydet
      const payload: any = {
        fixtureId: fxId, home: h, away: a,
        redHome, redAway,
        updatedBy: "admin-mobile",
      };
      const htH = htHomeVal.trim() !== "" ? Number(htHomeVal) : null;
      const htA = htAwayVal.trim() !== "" ? Number(htAwayVal) : null;
      if (htH != null && htA != null && Number.isFinite(htH) && Number.isFinite(htA)) {
        payload.htHome = htH;
        payload.htAway = htA;
      }
      if (firstGoal) payload.firstGoal = firstGoal;
      if (penaltyAny !== null) payload.penaltyAny = penaltyAny;

      const setRes = await apiFetch("/api/admin/results/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const setJson = await setRes.json();
      if (!setRes.ok || !setJson?.ok) {
        Alert.alert("Admin", setJson?.error || `SET_HTTP_${setRes.status}`);
        return;
      }

      // 2) tahminleri settle et
      const sRes = await apiFetch("/api/rt/settle2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixtureId: fxId }),
      });
      const sJson = await sRes.json();
      const settledCount = sJson?.settled ?? sJson?.settledCount ?? "?";

      Alert.alert(
        "Kaydedildi ✓",
        `${selected.home ?? fxId} ${h}–${a} ${selected.away ?? ""}\n\n` +
        `${settledCount} tahmin settle edildi.`
      );
      setSelected(null);
      await loadAll();
    } catch (e: any) {
      Alert.alert("Admin", String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }, [selected, canSave, homeVal, awayVal, htHomeVal, htAwayVal, firstGoal, redHome, redAway, penaltyAny, tokenReady, loadAll]);

  // ilerisi için: AI çekimi (şimdilik stub)
  const fetchWithAI = () => {
    Alert.alert(
      "Yapay Zeka ile Çek",
      "Bu özellik yakında! Skor API'si bağlandığında tek tuşla tüm maçların sonuçları çekilebilecek.",
      [{ text: "Tamam" }]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <BackBar title="Admin • Sonuç Gir" />
      {/* Başlık */}
      <View style={{ padding: 16, paddingBottom: 8, gap: 8 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={{ fontSize: 20, fontWeight: "900", color: Colors.slate900 }}>
              Admin • Sonuç Gir
            </Text>
            <Text style={{ fontSize: 11, color: Colors.muted, marginTop: 2 }}>
              Token: {tokenReady ? "✓ OK" : "✗ YOK"}{pendingCount > 0 ? ` • ${pendingCount} bekleyen` : ""}
            </Text>
          </View>
          {/* AI butonu - ileride aktif olacak */}
          <TouchableOpacity
            onPress={fetchWithAI}
            style={{
              flexDirection: "row", alignItems: "center", gap: 4,
              paddingHorizontal: 12, paddingVertical: 8,
              borderRadius: 999, borderWidth: 1, borderColor: "#7c3aed",
              backgroundColor: "#faf5ff",
            }}
          >
            <Text style={{ fontSize: 13 }}>🤖</Text>
            <Text style={{ fontSize: 11, fontWeight: "700", color: "#7c3aed" }}>AI ile Çek</Text>
          </TouchableOpacity>
        </View>

        {!!err && (
          <Text style={{ color: Colors.live, fontSize: 11 }}>Hata: {err}</Text>
        )}

        {/* Tab seçici */}
        <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
          {([
            { key: "pending", label: `Bekleyen${pendingCount > 0 ? ` (${pendingCount})` : ""}` },
            { key: "all", label: "Tümü" },
            { key: "done", label: "Girildi" },
          ] as const).map(({ key, label }) => {
            const active = tab === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setTab(key)}
                style={{
                  flex: 1, paddingVertical: 9, borderRadius: 10,
                  backgroundColor: active ? Colors.primary : "#e2e8f0",
                }}
              >
                <Text style={{
                  textAlign: "center", fontWeight: "800", fontSize: 12,
                  color: active ? "#fff" : Colors.slate900,
                }}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Inline editor */}
      {selected && (
        <View style={{
          marginHorizontal: 16, marginBottom: 12, padding: 14,
          borderRadius: 14, backgroundColor: "#fff",
          borderWidth: 2, borderColor: Colors.primary, gap: 10,
        }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontWeight: "900", color: Colors.slate900, flex: 1 }} numberOfLines={1}>
              {selected.home ?? "?"} — {selected.away ?? "?"}
            </Text>
            <TouchableOpacity onPress={() => setSelected(null)}>
              <Text style={{ color: Colors.muted, fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={{ color: Colors.muted, fontSize: 11 }}>
            {fmtKick(selected.kickoffISO)} · {selected.league ?? ""} · {selected.fixtureId}
          </Text>

          {/* Skor girişi */}
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <TextInput
              value={homeVal}
              onChangeText={setHomeVal}
              keyboardType="number-pad"
              placeholder="0"
              style={{
                flex: 1, borderWidth: 2, borderColor: Colors.primary,
                borderRadius: 10, paddingVertical: 10, textAlign: "center",
                fontSize: 28, fontWeight: "900",
              }}
            />
            <Text style={{ fontSize: 22, fontWeight: "900", color: Colors.muted }}>–</Text>
            <TextInput
              value={awayVal}
              onChangeText={setAwayVal}
              keyboardType="number-pad"
              placeholder="0"
              style={{
                flex: 1, borderWidth: 2, borderColor: Colors.primary,
                borderRadius: 10, paddingVertical: 10, textAlign: "center",
                fontSize: 28, fontWeight: "900",
              }}
            />
          </View>

          {/* İlk yarı skoru */}
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: "700", width: 56 }}>İY Skor</Text>
            <TextInput
              value={htHomeVal}
              onChangeText={setHtHomeVal}
              keyboardType="number-pad"
              placeholder="-"
              style={{
                flex: 1, borderWidth: 1, borderColor: Colors.border,
                borderRadius: 8, paddingVertical: 8, textAlign: "center",
                fontSize: 16, fontWeight: "800",
              }}
            />
            <Text style={{ color: Colors.muted, fontWeight: "900" }}>–</Text>
            <TextInput
              value={htAwayVal}
              onChangeText={setHtAwayVal}
              keyboardType="number-pad"
              placeholder="-"
              style={{
                flex: 1, borderWidth: 1, borderColor: Colors.border,
                borderRadius: 8, paddingVertical: 8, textAlign: "center",
                fontSize: 16, fontWeight: "800",
              }}
            />
          </View>

          {/* İlk gol */}
          <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
            <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: "700", width: 56 }}>İlk Gol</Text>
            {([["H", "Ev"], ["A", "Dep"], [null, "—"]] as const).map(([v, label]) => (
              <TouchableOpacity
                key={String(v)}
                onPress={() => setFirstGoal(v as "H" | "A" | null)}
                style={{
                  flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1,
                  borderColor: firstGoal === v ? Colors.primary : Colors.border,
                  backgroundColor: firstGoal === v ? "#eff6ff" : "#f8fafc",
                }}
              >
                <Text style={{
                  textAlign: "center", fontSize: 12, fontWeight: "700",
                  color: firstGoal === v ? Colors.primary : Colors.muted,
                }}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Kırmızı kart + penaltı */}
          <View style={{ flexDirection: "row", gap: 6 }}>
            <TouchableOpacity
              onPress={() => setRedHome(v => !v)}
              style={{
                flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1,
                borderColor: redHome ? "#ef4444" : Colors.border,
                backgroundColor: redHome ? "#fef2f2" : "#f8fafc",
              }}
            >
              <Text style={{ textAlign: "center", fontSize: 11, fontWeight: "700", color: redHome ? "#ef4444" : Colors.muted }}>
                🟥 Ev{redHome ? " ✓" : ""}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setRedAway(v => !v)}
              style={{
                flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1,
                borderColor: redAway ? "#ef4444" : Colors.border,
                backgroundColor: redAway ? "#fef2f2" : "#f8fafc",
              }}
            >
              <Text style={{ textAlign: "center", fontSize: 11, fontWeight: "700", color: redAway ? "#ef4444" : Colors.muted }}>
                🟥 Dep{redAway ? " ✓" : ""}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setPenaltyAny(c => (c === true ? false : c === false ? null : true))}
              style={{
                flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1,
                borderColor: penaltyAny === true ? "#f59e0b" : Colors.border,
                backgroundColor: penaltyAny === true ? "#fffbeb" : "#f8fafc",
              }}
            >
              <Text style={{ textAlign: "center", fontSize: 11, fontWeight: "700", color: penaltyAny === true ? "#b45309" : Colors.muted }}>
                ⚽ Pen: {penaltyAny === true ? "VAR" : penaltyAny === false ? "YOK" : "—"}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={save}
            disabled={!canSave || saving}
            style={{
              paddingVertical: 14, borderRadius: 12,
              backgroundColor: !canSave || saving ? Colors.border : Colors.primary,
            }}
          >
            <Text style={{ textAlign: "center", color: "#fff", fontWeight: "900", fontSize: 15 }}>
              {saving ? "Kaydediliyor..." : "✓ Kaydet ve Settle Et"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Liste */}
      <FlatList
        data={listData}
        keyExtractor={(it) => String(it.fixtureId)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 40 }}
        ListEmptyComponent={
          loading ? (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <ActivityIndicator />
              <Text style={{ color: Colors.muted, marginTop: 8 }}>Yükleniyor...</Text>
            </View>
          ) : (
            <Text style={{ color: Colors.muted, textAlign: "center", paddingVertical: 40 }}>
              {tab === "pending" ? "Bekleyen maç yok 🎉" : "Kayıt yok."}
            </Text>
          )
        }
        renderItem={({ item: fx }) => {
          const st = String(fx.status || "NS").toUpperCase();
          const result = resultMap.get(String(fx.fixtureId));
          const isFT = st === "FT" || st === "AET" || st === "PEN";
          const isSelected = selected?.fixtureId === String(fx.fixtureId);

          const stColor = result ? "#22c55e"
            : isFT ? "#f59e0b"
            : st === "1H" || st === "2H" || st === "HT" ? Colors.live
            : Colors.muted;

          const stLabel = result
            ? `✓ ${result.home}–${result.away}`
            : isFT ? "FT – sonuç bekleniyor"
            : st;

          return (
            <TouchableOpacity
              onPress={() => isSelected ? setSelected(null) : openEditor(fx)}
              style={{
                marginBottom: 8, padding: 12, borderRadius: 12,
                borderWidth: isSelected ? 2 : 1,
                borderColor: isSelected ? Colors.primary : result ? "#bbf7d0" : Colors.border,
                backgroundColor: isSelected ? "#eff6ff" : result ? "#f0fdf4" : "#fff",
                flexDirection: "row", alignItems: "center", gap: 10,
              }}
            >
              {/* Maç bilgisi */}
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "800", fontSize: 14, color: Colors.slate900 }} numberOfLines={1}>
                  {fx.home ?? "?"} — {fx.away ?? "?"}
                </Text>
                <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 2 }}>
                  {fmtKick(fx.kickoffISO)} · {fx.league ?? ""}
                </Text>
              </View>

              {/* Durum */}
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontWeight: "900", fontSize: 13, color: stColor }}>
                  {stLabel}
                </Text>
                {!result && isFT && (
                  <Text style={{ fontSize: 11, color: Colors.primary, marginTop: 2 }}>
                    Dokun →
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}
