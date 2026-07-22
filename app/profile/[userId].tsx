import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Colors from "../../constants/colors";
import { getApiBase } from "../../lib/apiBase";
import { getAuthHeaders } from "../../lib/apiFetch";
import { useAuth } from "../../contexts/AuthContext";
import { useUserId } from "../../lib/useUserId";

async function apiFetch(path: string, init?: RequestInit) {
  const base = await getApiBase();
  const authH = await getAuthHeaders();
  const p = path.startsWith("/") ? path : `/${path}`;
  return fetch(`${base}${p}`, { ...init, headers: { ...authH, ...(init?.headers as any) } });
}

type HistoryItem = {
  fixtureId: string;
  points: number;
  detail?: { outcome?: number; exact?: number; firstGoal?: number; firstHalf?: number } | null;
  finalScore?: { home?: number; away?: number } | null;
  meta?: { home?: string; away?: string; league?: string } | null;
  computedAt?: string | null;
};

type Profile = {
  userId: string;
  mainTeam?: string | null;
  country?: string | null;
  is1987?: boolean;
  createdAt?: string | null;
  totals?: number;
  segment?: string | null;
};

function initials(uid: string) {
  return uid.slice(0, 2).toUpperCase();
}

function winRate(items: HistoryItem[]) {
  if (!items.length) return null;
  const correct = items.filter(i => (i.detail?.outcome ?? 0) > 0).length;
  return Math.round((correct / items.length) * 100);
}

function currentStreak(items: HistoryItem[]): number {
  let streak = 0;
  for (const it of [...items].reverse()) {
    if ((it.detail?.outcome ?? 0) > 0) streak++;
    else break;
  }
  return streak;
}

function bestStreak(items: HistoryItem[]): number {
  let best = 0, cur = 0;
  for (const it of items) {
    if ((it.detail?.outcome ?? 0) > 0) { cur++; best = Math.max(best, cur); }
    else cur = 0;
  }
  return best;
}

function pointColor(pts: number) {
  if (pts >= 10) return "#16a34a";
  if (pts >= 3) return Colors.accent;
  if (pts > 0) return Colors.muted;
  return "#dc2626";
}

export default function ProfileUserScreen() {
  const router = useRouter();
  const { userId: qUserId } = useLocalSearchParams<{ userId?: string }>();
  const ownUserId = useUserId();

  const userId = useMemo(() => String(qUserId || "").trim(), [qUserId]);
  const isOwn = ownUserId && ownUserId === userId;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [lcBalance, setLcBalance] = useState<number | null>(null);
  const [totalsMatches, setTotalsMatches] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const uid = userId.trim();
    if (!uid) { setError("USER_ID_MISSING"); setLoading(false); return; }
    try {
      setLoading(true);
      setError(null);

      const [profRes, histRes, totRes, walRes] = await Promise.allSettled([
        apiFetch(`/api/users/profile?userId=${encodeURIComponent(uid)}`).then(r => r.json()),
        apiFetch(`/api/rt/pred/history?userId=${encodeURIComponent(uid)}&limit=100`).then(r => r.json()),
        apiFetch(`/api/rt/totals?userId=${encodeURIComponent(uid)}`).then(r => r.json()),
        isOwn
          ? apiFetch(`/api/rt/lc-wallet/summary?userId=${encodeURIComponent(uid)}`).then(r => r.json())
          : Promise.resolve(null),
      ]);

      if (profRes.status === "fulfilled" && profRes.value?.ok) {
        setProfile(profRes.value.profile || { userId: uid });
      } else {
        // fallback: try /api/users/get
        const fb = await apiFetch(`/api/users/get?userId=${encodeURIComponent(uid)}`).then(r => r.json()).catch(() => null);
        setProfile(fb?.ok ? (fb.user || fb.profile || { userId: uid }) : { userId: uid });
      }

      if (histRes.status === "fulfilled" && histRes.value?.ok) {
        setHistory(Array.isArray(histRes.value.items) ? histRes.value.items : []);
      }

      if (totRes.status === "fulfilled" && totRes.value?.ok) {
        const items: any[] = totRes.value.items || [];
        const me = items.find((x: any) => String(x.userId || "").toLowerCase() === uid.toLowerCase());
        if (me) setTotalsMatches(Number(me.matches || 0));
      }

      if (walRes.status === "fulfilled" && walRes.value?.ok) {
        setLcBalance(walRes.value.user?.balance ?? null);
      }
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [userId]);

  const wr = useMemo(() => winRate(history), [history]);
  const streak = useMemo(() => currentStreak(history), [history]);
  const best = useMemo(() => bestStreak(history), [history]);
  const totalPts = useMemo(() => history.reduce((s, i) => s + (i.points ?? 0), 0) || (profile?.totals ?? 0), [history, profile]);
  const predCount = totalsMatches ?? history.length;

  const outcomeBreakdown = useMemo(() => {
    const correct = history.filter(i => (i.detail?.outcome ?? 0) > 0).length;
    const wrong   = history.filter(i => (i.detail?.outcome ?? 0) < 0).length;
    const neutral = history.length - correct - wrong;
    const exact   = history.filter(i => (i.detail?.exact ?? 0) > 0).length;
    return { correct, wrong, neutral, exact };
  }, [history]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      {/* ─── Üst bar ─── */}
      <View style={{
        flexDirection: "row", alignItems: "center", gap: 8,
        padding: 16, paddingBottom: 8,
      }}>
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/live" as any)}
          style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: Colors.border }}
        >
          <Text style={{ color: Colors.muted, fontSize: 12 }}>← Geri</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 17, fontWeight: "800", color: Colors.slate900 }}>Profil</Text>
      </View>

      {loading && !profile ? (
        <View style={{ paddingVertical: 40, alignItems: "center" }}>
          <ActivityIndicator size="large" />
          <Text style={{ marginTop: 8, color: Colors.muted }}>Yükleniyor...</Text>
        </View>
      ) : error && !profile ? (
        <View style={{ margin: 16, padding: 12, borderRadius: 12, backgroundColor: "#7f1d1d" }}>
          <Text style={{ color: "#fee2e2", fontWeight: "700" }}>Kullanıcı bulunamadı</Text>
          <Text style={{ color: "#fecaca", fontSize: 12, marginTop: 4 }}>{error}</Text>
        </View>
      ) : (
        <View style={{ padding: 16, gap: 12 }}>

          {/* ─── Avatar + kimlik ─── */}
          <View style={{
            backgroundColor: "#fff", borderRadius: 16, padding: 16,
            borderWidth: 1, borderColor: Colors.border,
            flexDirection: "row", alignItems: "center", gap: 14,
          }}>
            <View style={{
              width: 60, height: 60, borderRadius: 30,
              backgroundColor: Colors.accent,
              alignItems: "center", justifyContent: "center",
            }}>
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 22 }}>
                {initials(profile?.userId || userId)}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontWeight: "800", fontSize: 16, color: Colors.slate900 }}>
                {profile?.userId || userId}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {profile?.country && (
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: "#edf4ff", borderWidth: 1, borderColor: Colors.accent }}>
                    <Text style={{ fontSize: 11, fontWeight: "600" }}>🌍 {profile.country}</Text>
                  </View>
                )}
                {profile?.mainTeam && (
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: Colors.live }}>
                    <Text style={{ fontSize: 11, fontWeight: "600", color: "#fff" }}>⚽ {profile.mainTeam}</Text>
                  </View>
                )}
                {profile?.is1987 && (
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: "#1a0a0a" }}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: "#c9a227" }}>🔴 1987GS</Text>
                  </View>
                )}
              </View>
              {profile?.createdAt && (
                <Text style={{ fontSize: 10, color: Colors.muted }}>
                  Kayıt: {String(profile.createdAt).slice(0, 10)}
                </Text>
              )}
            </View>
          </View>

          {/* ─── Ana istatistik kartları ─── */}
          <View style={{ flexDirection: "row", gap: 8 }}>
            {[
              { label: "Puan", value: totalPts, icon: "🏆", color: "#f59e0b" },
              { label: "Tahmin", value: predCount, icon: "📋", color: Colors.accent },
              { label: "İsabet %", value: wr !== null ? `${wr}%` : "—", icon: "✅", color: "#16a34a" },
              { label: "Seri", value: streak > 0 ? `${streak} 🔥` : streak, icon: "🎯", color: "#dc2626" },
            ].map(s => (
              <View key={s.label} style={{
                flex: 1, backgroundColor: "#fff", borderRadius: 12, padding: 10,
                borderWidth: 1, borderColor: Colors.border, alignItems: "center", gap: 2,
              }}>
                <Text style={{ fontSize: 18 }}>{s.icon}</Text>
                <Text style={{ fontSize: 18, fontWeight: "900", color: s.color }}>{String(s.value)}</Text>
                <Text style={{ fontSize: 10, color: Colors.muted, textAlign: "center" }}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* ─── LC bakiyesi (sadece kendi profili) ─── */}
          {isOwn && lcBalance !== null && (
            <View style={{
              backgroundColor: "#fef9c3", borderRadius: 12, padding: 14,
              borderWidth: 1, borderColor: "#fde047",
              flexDirection: "row", alignItems: "center", gap: 10,
            }}>
              <Text style={{ fontSize: 28 }}>🪙</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "900", fontSize: 22, color: "#92400e" }}>{lcBalance} LC</Text>
                <Text style={{ fontSize: 11, color: "#78350f" }}>LiveCoin bakiyesi</Text>
              </View>
              <TouchableOpacity
                onPress={() => router.push({ pathname: "/lc-ledger", params: { userId } } as any)}
                style={{ paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "#f59e0b", borderRadius: 999 }}
              >
                <Text style={{ fontWeight: "700", fontSize: 12 }}>Geçmiş →</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ─── Tahmin dağılımı ─── */}
          {history.length > 0 && (
            <View style={{
              backgroundColor: "#fff", borderRadius: 12, padding: 14,
              borderWidth: 1, borderColor: Colors.border, gap: 10,
            }}>
              <Text style={{ fontWeight: "700", fontSize: 14 }}>Tahmin Dağılımı</Text>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {[
                  { label: "Doğru", value: outcomeBreakdown.correct, color: "#16a34a", bg: "#dcfce7" },
                  { label: "Yanlış", value: outcomeBreakdown.wrong,  color: "#dc2626", bg: "#fee2e2" },
                  { label: "Nötr",  value: outcomeBreakdown.neutral, color: Colors.muted, bg: "#f8fafc" },
                  { label: "Skor",  value: outcomeBreakdown.exact,   color: Colors.accent, bg: "#edf4ff" },
                ].map(b => (
                  <View key={b.label} style={{
                    flex: 1, backgroundColor: b.bg, borderRadius: 10, padding: 8,
                    alignItems: "center", gap: 2,
                  }}>
                    <Text style={{ fontWeight: "800", fontSize: 18, color: b.color }}>{b.value}</Text>
                    <Text style={{ fontSize: 10, color: b.color, fontWeight: "600" }}>{b.label}</Text>
                  </View>
                ))}
              </View>

              {/* En iyi seri */}
              {best > 1 && (
                <Text style={{ fontSize: 12, color: Colors.muted }}>
                  En iyi seri: <Text style={{ fontWeight: "700", color: Colors.slate900 }}>{best} maç</Text> üst üste doğru
                </Text>
              )}

              {/* İlerleme çubuğu */}
              {wr !== null && history.length >= 3 && (
                <View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                    <Text style={{ fontSize: 11, color: Colors.muted }}>İsabet oranı</Text>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: Colors.slate900 }}>{wr}%</Text>
                  </View>
                  <View style={{ height: 8, backgroundColor: "#f1f5f9", borderRadius: 999, overflow: "hidden" }}>
                    <View style={{ height: 8, width: `${wr}%`, backgroundColor: wr >= 60 ? "#16a34a" : wr >= 40 ? "#f59e0b" : "#dc2626", borderRadius: 999 }} />
                  </View>
                </View>
              )}
            </View>
          )}

          {/* ─── Son tahminler ─── */}
          {history.length > 0 && (
            <View style={{
              backgroundColor: "#fff", borderRadius: 12,
              borderWidth: 1, borderColor: Colors.border, overflow: "hidden",
            }}>
              <Text style={{ padding: 14, paddingBottom: 8, fontWeight: "700", fontSize: 14 }}>
                Son Tahminler ({Math.min(history.length, 15)})
              </Text>
              {history.slice(0, 15).map((it, idx) => {
                const pts = it.points ?? 0;
                const correct = (it.detail?.outcome ?? 0) > 0;
                const wrong   = (it.detail?.outcome ?? 0) < 0;
                const home = it.meta?.home || it.finalScore ? `${it.meta?.home ?? "Ev"}` : null;
                const away = it.meta?.away || null;
                const score = it.finalScore ? `${it.finalScore.home ?? "-"} - ${it.finalScore.away ?? "-"}` : null;
                return (
                  <View key={it.fixtureId + idx} style={{
                    flexDirection: "row", alignItems: "center",
                    paddingHorizontal: 14, paddingVertical: 10,
                    borderTopWidth: idx ? 1 : 0, borderColor: Colors.border,
                    backgroundColor: correct ? "#f0fdf4" : wrong ? "#fff1f2" : "#fff",
                  }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontWeight: "600", fontSize: 13, color: Colors.slate900 }} numberOfLines={1}>
                        {home && away ? `${home} – ${away}` : it.fixtureId}
                      </Text>
                      <Text style={{ fontSize: 11, color: Colors.muted }}>
                        {score ? `Sonuç: ${score}` : "Bekleniyor"}
                        {it.meta?.league ? ` · ${it.meta.league}` : ""}
                        {it.computedAt ? ` · ${String(it.computedAt).slice(0, 10)}` : ""}
                      </Text>
                    </View>
                    <View style={{
                      minWidth: 38, height: 38, borderRadius: 10,
                      backgroundColor: pts > 0 ? "#dcfce7" : pts < 0 ? "#fee2e2" : "#f1f5f9",
                      alignItems: "center", justifyContent: "center",
                    }}>
                      <Text style={{ fontWeight: "900", fontSize: 15, color: pointColor(pts) }}>
                        {pts > 0 ? `+${pts}` : String(pts)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {history.length === 0 && !loading && (
            <View style={{ padding: 24, alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 32 }}>📋</Text>
              <Text style={{ color: Colors.muted, textAlign: "center" }}>
                Henüz tamamlanmış tahmin yok.
              </Text>
            </View>
          )}

        </View>
      )}
    </ScrollView>
  );
}
