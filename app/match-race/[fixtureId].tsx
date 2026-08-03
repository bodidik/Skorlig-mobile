import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { usePolling } from "../../hooks/usePolling";
import Colors from "../../constants/colors";
import { getApiBase } from "../../lib/apiBase";
import { getAuthHeaders, apiFetch as sharedApiFetch } from "../../lib/apiFetch";
import { shareResult } from "../../lib/share";
/* Hata kodunu kullaniciya anlasilir Turkce metne cevirir — bkz. engelleme akisi. */
import { hataMesaji } from "../../lib/hataMesaji";
import { t, useLang } from "../../lib/i18n";

/**
 * Paylasilan apiFetch'e delege eder.
 *
 * ⚠️ BURADA HAM `fetch` VARDI: zaman asimi ve yeniden deneme politikasi yoktu
 * (bkz. lib/fetchPolicy). Istek asildiginda ekran sonsuza kadar spinner
 * gosteriyor, kullanicinin iptal edecek bir seyi olmuyordu — "kings"
 * sekmesinde tam olarak bu yasandi. Ayni kopya 29 dosyada vardi.
 * Paylasilan surum auth basliklarini da kendisi ekliyor.
 */
async function apiFetch(path: string, init?: RequestInit) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return sharedApiFetch(p, init as any);
}

// `displayName` api/routes/settle2.cjs yarış yanıtında dönüyor (nickname
// yoksa userId'ye düşer).
type RaceRow = { rank: number; userId: string; displayName?: string | null; points: number; inRace: boolean; distance?: number | null; predScore?: { home: number; away: number } | null };
type Participant = { userId: string; displayName?: string | null; joinedAt?: string | null; predScore?: { home: number; away: number } | null };
type RaceResp = {
  ok: boolean;
  phase?: "pre" | "live";
  state?: {
    status?: string;
    minute?: number | null;
    score?: { home: number; away: number } | null;
    home?: string | null;
    away?: string | null;
    date?: string | null;
    time?: string | null;
    league?: string | null;
    firstGoal?: string | null;
    redAny?: boolean;
    penaltyAny?: boolean;
    updatedAt?: string | null;
  };
  totalPlayers?: number;
  inRaceCount?: number;
  top?: RaceRow[];
  participants?: Participant[];
  meJoined?: boolean;
  me?: RaceRow | null;
  error?: string;
};

type UserProfile = {
  ok: boolean;
  userId: string;
  displayName?: string | null;
  totalPoints: number;
  totalPenalty: number;
  matches: number;
  predCount: number;
  globalRank: number | null;
  totalPlayers: number;
  /** Yalnızca KENDİ profilinde gelir — bkz. LC bakiye satırı. */
  lc?: number;
  joinedAt: string | null;
};

const getRanks = () => [
  { name: t("rk2000"), min: 2000, color: "#f59e0b" },
  { name: t("rk1000"), min: 1000, color: "#a855f7" },
  { name: t("rk500"), min: 500, color: "#3b82f6" },
  { name: t("rk200"), min: 200, color: "#22c55e" },
  { name: t("rk50"), min: 50, color: "#94a3b8" },
  { name: t("rk0"), min: 0, color: "#64748b" },
];
function getRankName(pts: number) {
  const RANKS = getRanks();
  for (const r of RANKS) if (pts >= r.min) return r;
  return RANKS[RANKS.length - 1];
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return t("unknownTime");
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return t("todayLower");
  if (days < 30) return t("nDays", { n: days });
  const months = Math.floor(days / 30);
  if (months < 12) return t("nMonths", { n: months });
  const years = Math.floor(months / 12);
  return t("yearsMonths", { y: years, m: months % 12 });
}

const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT"]);
const POLL_MS = 20000;
const PRE_POLL_MS = 60000;

export default function MatchRaceScreen() {
  useLang(); // dil değişince ekran yeniden çizilsin
  const router = useRouter();
  const { fixtureId: qFid, userId: qUserId } = useLocalSearchParams<{ fixtureId?: string; userId?: string }>();
  const fixtureId = String(qFid || "").trim();
  const userId = String(qUserId || "demo1").trim();

  const [data, setData] = useState<RaceResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notifyOn, setNotifyOn] = useState(false);

  // Profil modal
  const [profileVisible, setProfileVisible] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(false);
  const [profileTargetId, setProfileTargetId] = useState("");
  const [blocked, setBlocked] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(
        `/api/rt/match-race?fixtureId=${encodeURIComponent(fixtureId)}&userId=${encodeURIComponent(userId)}&top=50`
      ).then((x) => x.json());
      setData(r);
    } catch (e: any) {
      setData({ ok: false, error: String(e?.message || e) });
    } finally {
      setLoading(false);
    }
  }, [fixtureId, userId]);

  // Aralık maç durumuna göre: canlıysa sık, maç öncesi seyrek, bittiyse hiç.
  // null → usePolling yoklamayı tamamen durdurur.
  const pollMs = React.useMemo(() => {
    const status = String(data?.state?.status || "").toUpperCase();
    if (LIVE_STATUSES.has(status)) return POLL_MS;
    if ((data?.phase || "") === "pre") return PRE_POLL_MS;
    return null;
  }, [data?.phase, data?.state?.status]);

  // Ekran görünür + uygulama ön plandayken yokla (bkz. hooks/usePolling).
  // pollMs null olsa bile (maç bitti) ekran açılışında bir kez yükler.
  usePolling(load, pollMs);

  const openProfile = async (targetUserId: string) => {
    setProfileVisible(true);
    setProfileLoading(true);
    setProfile(null);
    setProfileError(false);
    setProfileTargetId(targetUserId);
    setBlocked(false);
    try {
      const res = await apiFetch(`/api/rt/user-profile?userId=${encodeURIComponent(targetUserId)}`);
      const r = await res.json();
      if (r.ok) setProfile(r);
      else setProfileError(true);
    } catch (e) {
      console.warn("[match-race] profil yuklenemedi:", e);
      setProfileError(true);
    }
    setProfileLoading(false);
  };

  const toggleBlock = async (targetUserId: string) => {
    const action = blocked ? "unblock" : "block";
    const label = blocked ? t("unblock") : t("block");
    Alert.alert(
      label,
      blocked
        ? t("unblockAsk", { id: targetUserId })
        : t("blockAsk", { id: targetUserId }),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: label,
          style: blocked ? "default" : "destructive",
          onPress: async () => {
            /**
             * ⚠️ ENGELLEME BAŞARISIZKEN ARAYÜZ "ENGELLENDİ" DİYORDU.
             *
             * `apiFetch` YALNIZCA ağ hatasında fırlatır; 500/401/403 gibi
             * yanıtlarda fırlatmaz (standart fetch davranışı, bkz.
             * lib/apiFetch.ts). Eski kod yanıtı hiç okumuyor, doğrudan
             * `setBlocked(!blocked)` çağırıyordu:
             *
             *     await apiFetch(...)   // 500 -> fırlatmaz
             *     setBlocked(!blocked)  // ekran "engellendi" der
             *
             * Sunucu engellemedi ama kullanıcı engellediğini sanıyor. Bu bir
             * GÜVENLİK özelliği — taciz eden birini engellediğini düşünen
             * kişi korunduğunu da düşünür.
             *
             * `catch (_) {}` da tamamen sessizdi: çevrimdışıyken dokunuyorsun,
             * hiçbir şey olmuyor, hata da yok.
             */
            try {
              const res = await apiFetch(`/api/friends/${action}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ targetUserId }),
              });
              const j = await res.json().catch(() => null);
              if (!res.ok || j?.ok === false) {
                Alert.alert(
                  blocked ? t("unblockFailed") : t("blockFailed"),
                  hataMesaji(j?.error)
                );
                return;
              }
              setBlocked(!blocked);
            } catch (e: any) {
              Alert.alert(t("connError"), String(e?.message || e));
            }
          },
        },
      ]
    );
  };

  const st = data?.state;
  const phase = data?.phase || "";
  const isPre = phase === "pre";
  const isFT = String(st?.status || "").toUpperCase() === "FT";
  const isLive = LIVE_STATUSES.has(String(st?.status || "").toUpperCase());

  const renderUserRow = (uid: string, index: number, extra?: { points?: number; inRace?: boolean; rank?: number; displayName?: string; distance?: number | null; predScore?: { home: number; away: number } | null }) => {
    const isMe = uid.toLowerCase() === userId.toLowerCase();
    const name = extra?.displayName || uid;
    const label = extra?.rank
      ? (extra.rank === 1 ? "🥇" : extra.rank === 2 ? "🥈" : extra.rank === 3 ? "🥉" : `${extra.rank}.`)
      : `${index + 1}.`;
    return (
      <TouchableOpacity
        key={uid + index}
        activeOpacity={0.7}
        onPress={() => !isMe && openProfile(uid)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 8,
          paddingHorizontal: 10,
          borderRadius: 10,
          backgroundColor: isMe ? "#0f172a" : "#020617",
          borderWidth: 1,
          borderColor: isMe ? Colors.accent : Colors.border,
        }}
      >
        <Text style={{ color: Colors.muted, fontWeight: "600", width: 34, fontSize: 12 }}>{label}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#fff", fontWeight: isMe ? "900" : "600" }} numberOfLines={1}>
            {name}{isMe ? t("me2") : ""}
          </Text>
          {extra?.predScore && (
            <Text style={{ color: Colors.muted, fontSize: 10 }}>
              {t("predShort", { h: extra.predScore.home, a: extra.predScore.away })}
            </Text>
          )}
        </View>
        {extra?.inRace != null && (
          <Text style={{ fontSize: 11, marginRight: 8 }}>{extra.inRace ? "🟢" : "🔴"}</Text>
        )}
        {extra?.distance != null && extra.distance < 999 && (
          <Text style={{ color: "#60a5fa", fontWeight: "700", fontSize: 11, marginRight: 6 }}>Δ{extra.distance}</Text>
        )}
        {extra?.points != null && (
          <Text style={{ color: "#a3e635", fontWeight: "800" }}>{extra.points}p</Text>
        )}
        {!isMe && (
          <Text style={{ color: Colors.muted, fontSize: 10, marginLeft: 6 }}>›</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.bg }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
          />
        }
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
      >
        {/* Üst bar */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: Colors.muted, fontSize: 12 }}>{t("back")}</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              onPress={() => router.replace({ pathname: "/(tabs)/live", params: { tab: "open" } })}
              style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: "#1e293b" }}
            >
              <Text style={{ color: "#94a3b8", fontSize: 11, fontWeight: "600" }}>{t("matches")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.replace({ pathname: "/(tabs)/live", params: { tab: "mine" } })}
              style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: "#1e293b" }}
            >
              <Text style={{ color: "#94a3b8", fontSize: 11, fontWeight: "600" }}>{t("myPredsLbl")}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {loading && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <ActivityIndicator size="small" />
            <Text style={{ color: Colors.muted }}>{t("raceLoading")}</Text>
          </View>
        )}

        {!loading && !data?.ok && (
          <Text style={{ color: "#f97316" }}>
            {t("boardFailed", { e: data?.error || t("unknownError") })}
          </Text>
        )}

        {/* ===== PRE-MATCH ===== */}
        {!loading && data?.ok && isPre && st && (
          <>
            <View
              style={{
                padding: 20, borderRadius: 14, backgroundColor: "#020617",
                borderWidth: 1, borderColor: "#3b82f644", alignItems: "center", gap: 6,
              }}
            >
              {st.league && <Text style={{ color: "#60a5fa", fontSize: 11, fontWeight: "700" }}>{st.league}</Text>}
              <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800", textAlign: "center" }}>
                {st.home || t("home")} — {st.away || t("away")}
              </Text>
              <Text style={{ color: "#a3e635", fontSize: 28, fontWeight: "900" }}>vs</Text>
              {(st.date || st.time) && (
                <Text style={{ color: Colors.muted, fontSize: 12 }}>
                  {st.date ? `📅 ${st.date}` : ""}{st.time ? ` ⏰ ${st.time}` : ""}
                </Text>
              )}
              <View style={{ marginTop: 4, paddingHorizontal: 14, paddingVertical: 5, borderRadius: 999, backgroundColor: "#1e293b" }}>
                <Text style={{ color: "#fbbf24", fontSize: 11, fontWeight: "700" }}>{t("notStartedChip")}</Text>
              </View>
            </View>

            <View
              style={{
                padding: 14, borderRadius: 12, backgroundColor: "#0f172a",
                borderWidth: 1, borderColor: Colors.border, alignItems: "center", gap: 6,
              }}
            >
              <Text style={{ fontWeight: "900", fontSize: 32, color: Colors.accent }}>{data.totalPlayers || 0}</Text>
              <Text style={{ fontWeight: "700", fontSize: 13, color: "#e2e8f0" }}>{t("predSenders")}</Text>
              {data.meJoined && (
                <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: "#052e16", borderWidth: 1, borderColor: "#22c55e66" }}>
                  <Text style={{ color: "#4ade80", fontSize: 11, fontWeight: "700" }}>{t("youJoined")}</Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              onPress={() => setNotifyOn((v) => !v)}
              style={{
                padding: 14, borderRadius: 12,
                backgroundColor: notifyOn ? "#052e16" : "#1e293b",
                borderWidth: 1, borderColor: notifyOn ? "#22c55e" : Colors.border,
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              <Text style={{ fontSize: 18 }}>{notifyOn ? "🔔" : "🔕"}</Text>
              <View>
                <Text style={{ fontWeight: "700", color: notifyOn ? "#4ade80" : "#e2e8f0", fontSize: 14 }}>
                  {notifyOn ? t("notifyOnLbl") : t("notifyAsk")}
                </Text>
                <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 2 }}>
                  {notifyOn ? t("notifyOnHelp") : t("notifyOffHelp")}
                </Text>
              </View>
            </TouchableOpacity>

            <Text style={{ fontWeight: "700", color: "#e2e8f0", marginTop: 4 }}>
              {t("participants", { n: data.totalPlayers || 0 })}
            </Text>
            {(data.participants || []).map((p, i) => renderUserRow(p.userId, i, { displayName: p.displayName }))}
          </>
        )}

        {/* ===== CANLI / BİTEN MAÇ ===== */}
        {!loading && data?.ok && !isPre && st && (
          <>
            <View
              style={{
                padding: 16, borderRadius: 14, backgroundColor: "#020617",
                borderWidth: 1, borderColor: isLive ? "#22c55e" : Colors.border,
                alignItems: "center", gap: 4,
              }}
            >
              {isLive && (
                <Text style={{ color: "#22c55e", fontSize: 11, fontWeight: "800" }}>
                  🔴 CANLI {st.minute != null ? `· ${st.minute}'` : ""}
                </Text>
              )}
              {isFT && <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: "800" }}>{t("matchOutcome")}</Text>}
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700", textAlign: "center" }}>
                {st.home || t("home")} — {st.away || t("away")}
              </Text>
              <Text style={{ color: "#a3e635", fontSize: 34, fontWeight: "900" }}>
                {st.score ? `${st.score.home} - ${st.score.away}` : "vs"}
              </Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                {st.firstGoal && (
                  <Text style={{ color: Colors.muted, fontSize: 11 }}>
                    {t("firstGoalWho", { s: st.firstGoal === "H" ? t("home") : t("away") })}
                  </Text>
                )}
                {st.redAny && <Text style={{ color: "#ef4444", fontSize: 11 }}>{t("redLower")}</Text>}
                {st.penaltyAny && <Text style={{ color: "#f59e0b", fontSize: 11 }}>{t("penLower")}</Text>}
              </View>
            </View>

            <View
              style={{
                padding: 12, borderRadius: 12, backgroundColor: "#0f172a",
                borderWidth: 1, borderColor: Colors.border, gap: 6,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontWeight: "700", fontSize: 13, color: "#e2e8f0" }}>{t("inRaceLbl")}</Text>
                <Text style={{ fontWeight: "900", fontSize: 13, color: "#059669" }}>
                  {data.inRaceCount} / {data.totalPlayers}
                </Text>
              </View>
              <View style={{ height: 8, borderRadius: 999, backgroundColor: "#1e293b", overflow: "hidden" }}>
                <View
                  style={{
                    height: 8, borderRadius: 999, backgroundColor: "#22c55e",
                    width: `${data.totalPlayers ? Math.round(((data.inRaceCount || 0) / data.totalPlayers) * 100) : 0}%`,
                  }}
                />
              </View>
              <Text style={{ color: Colors.muted, fontSize: 10 }}>
                {t("eliminationHelp")}
              </Text>
            </View>

            {data.me ? (
              <View
                style={{
                  padding: 14, borderRadius: 12, borderWidth: 2,
                  borderColor: data.me.inRace ? "#22c55e" : "#ef4444",
                  backgroundColor: data.me.inRace ? "#052e16" : "#2a0a0a",
                  gap: 4,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontWeight: "900", fontSize: 15, color: "#e2e8f0" }}>
                    {t("currentRank", { r: data.me.rank, n: data.totalPlayers })}
                  </Text>
                  <Text style={{ fontWeight: "900", fontSize: 20, color: Colors.accent }}>{data.me.points}p</Text>
                </View>
                {data.me.predScore && (
                  <Text style={{ color: "#94a3b8", fontSize: 12 }}>
                    {t("myPredScore", { h: data.me.predScore.home, a: data.me.predScore.away })}
                    {data.me.distance != null && data.me.distance < 999 ? t("distanceSuffix", { d: data.me.distance }) : ""}
                  </Text>
                )}
                <Text style={{ color: data.me.inRace ? "#059669" : "#dc2626", fontSize: 12, fontWeight: "700" }}>
                  {data.me.inRace ? t("stillPossible") : t("impossible")}
                </Text>

                {/* Maç bitti ve puan kesinleşti → paylaşılacak bir sonuç var.
                    Maç sürerken paylaşmak anlamsız, puan hâlâ değişiyor. */}
                {isFT && (
                  <TouchableOpacity
                    onPress={() => shareResult({
                      match: {
                        fixtureId: String(fixtureId),
                        home: st?.home || t("home"),
                        away: st?.away || t("away"),
                        league: st?.league || null,
                      },
                      finalHome: Number(st?.score?.home ?? 0),
                      finalAway: Number(st?.score?.away ?? 0),
                      points: Number(data.me.points) || 0,
                      rank: data.me.rank ?? null,
                      total: data.totalPlayers ?? null,
                      userId: String(userId || ""),
                    })}
                    style={{
                      marginTop: 8, flexDirection: "row", alignItems: "center",
                      justifyContent: "center", gap: 8,
                      paddingVertical: 11, borderRadius: 999,
                      backgroundColor: Colors.accent,
                    }}
                  >
                    <Text style={{ fontSize: 15 }}>📣</Text>
                    <Text style={{ color: Colors.onAccent, fontWeight: "900", fontSize: 14 }}>
                      {t("shareResultBtn")}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <Text style={{ color: Colors.muted, fontSize: 12 }}>
                {t("watchOnly")}
              </Text>
            )}

            <Text style={{ fontWeight: "700", color: "#e2e8f0" }}>
              {t("topOfTotal", { a: (data.top || []).length, b: data.totalPlayers })}
            </Text>
            {(data.top || []).map((r, i) =>
              renderUserRow(r.userId, i, { points: r.points, inRace: r.inRace, rank: r.rank, displayName: r.displayName, distance: r.distance, predScore: r.predScore })
            )}
          </>
        )}
      </ScrollView>

      {/* ===== PROFİL MODAL ===== */}
      <Modal visible={profileVisible} transparent animationType="slide" onRequestClose={() => setProfileVisible(false)}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setProfileVisible(false)}
          style={{ flex: 1, backgroundColor: "#00000088", justifyContent: "flex-end" }}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{
            backgroundColor: "#0f172a", borderTopLeftRadius: 20, borderTopRightRadius: 20,
            padding: 20, paddingBottom: 40, minHeight: 320,
          }}>
            {profileLoading && (
              <View style={{ alignItems: "center", paddingVertical: 40 }}>
                <ActivityIndicator size="large" color={Colors.accent} />
              </View>
            )}

            {!profileLoading && profile && (
              <ProfileContent
                profile={profile}
                blocked={blocked}
                onClose={() => setProfileVisible(false)}
                onToggleBlock={() => toggleBlock(profile.userId)}
              />
            )}

            {!profileLoading && !profile && (
              <View style={{ alignItems: "center", paddingVertical: 40 }}>
                <Text style={{ color: Colors.muted, textAlign: "center" }}>
                  {profileError ? t("profileLoadError") : t("profileLoadFailed")}
                </Text>
                {profileError && profileTargetId && (
                  <TouchableOpacity
                    onPress={() => openProfile(profileTargetId)}
                    style={{ marginTop: 12, paddingHorizontal: 16, paddingVertical: 8,
                      backgroundColor: Colors.accent + "22", borderRadius: 8 }}
                  >
                    <Text style={{ color: Colors.accent }}>{t("retry")}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

function ProfileContent({ profile, blocked, onClose, onToggleBlock }: {
  profile: UserProfile; blocked: boolean; onClose: () => void; onToggleBlock: () => void;
}) {
  const rank = getRankName(profile.totalPoints);
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "900" }} numberOfLines={1}>
            {profile.displayName || (profile.userId.length > 12 ? profile.userId.slice(0, 8) + "…" : profile.userId)}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
            <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: rank.color + "22", borderWidth: 1, borderColor: rank.color }}>
              <Text style={{ color: rank.color, fontSize: 11, fontWeight: "800" }}>{rank.name}</Text>
            </View>
            {profile.globalRank != null && (
              <Text style={{ color: Colors.muted, fontSize: 11 }}>
                #{profile.globalRank} / {profile.totalPlayers}
              </Text>
            )}
          </View>
        </View>
        <TouchableOpacity onPress={onClose}>
          <Text style={{ color: Colors.muted, fontSize: 22, fontWeight: "300" }}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <StatBox label={t("statTotalPts")} value={String(profile.totalPoints)} color="#a3e635" />
        <StatBox label={t("statMatch")} value={String(profile.matches)} color="#60a5fa" />
        <StatBox label={t("statPred")} value={String(profile.predCount)} color="#f59e0b" />
      </View>

      <View style={{ gap: 8 }}>
        <DetailRow icon="📊" label={t("avgPerMatch")} value={profile.matches > 0 ? `${(profile.totalPoints / profile.matches).toFixed(1)}p` : "—"} />
        {/* ⚠️ BAKİYE ARTIK YALNIZCA KENDİ PROFİLİNDE GELİYOR. Uç herkesin
            bakiyesini döndürüyordu; bir tahmin oyununda rakibin ne kadar
            parası olduğunu bilmek düello ve havuzda doğrudan avantaj.
            Alan hiç gönderilmiyor (0 değil) — 0 basmak "parası yok" gibi
            okunur ve yine bilgi sızdırır. Koşulsuz basmak ise ekrana
            "undefined LC" yazardı; aynı hata premium tablosunda yaşandı. */}
        {profile.lc != null && (
          <DetailRow icon="💰" label={t("lcBalance")} value={`${profile.lc} LC`} />
        )}
        <DetailRow icon="📅" label={t("membershipAge")} value={timeAgo(profile.joinedAt)} />
        {profile.totalPenalty > 0 && (
          <DetailRow icon="⚠️" label={t("penaltyLbl")} value={`-${profile.totalPenalty}p`} />
        )}
      </View>

      <TouchableOpacity
        onPress={onToggleBlock}
        style={{
          marginTop: 6, padding: 12, borderRadius: 12,
          backgroundColor: blocked ? "#1e293b" : "#2a0a0a",
          borderWidth: 1, borderColor: blocked ? Colors.border : "#ef444444",
          alignItems: "center",
        }}
      >
        <Text style={{ color: blocked ? "#94a3b8" : "#f87171", fontWeight: "700", fontSize: 13 }}>
          {blocked ? t("unblockBtn") : t("blockBtn")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{
      flex: 1, padding: 12, borderRadius: 12, backgroundColor: "#020617",
      borderWidth: 1, borderColor: Colors.border, alignItems: "center", gap: 4,
    }}>
      <Text style={{ fontWeight: "900", fontSize: 20, color }}>{value}</Text>
      <Text style={{ color: Colors.muted, fontSize: 10, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text style={{ fontSize: 14 }}>{icon}</Text>
      <Text style={{ color: Colors.muted, fontSize: 12, flex: 1 }}>{label}</Text>
      <Text style={{ color: "#e2e8f0", fontSize: 12, fontWeight: "700" }}>{value}</Text>
    </View>
  );
}
