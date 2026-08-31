import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Animated, Easing,
} from "react-native";
import { useRouter } from "expo-router";
import Colors from "../../constants/colors";
import { getApiBase, resetApiBase } from "../../lib/apiBase";
import { getAuthHeaders, apiFetch as sharedApiFetch } from "../../lib/apiFetch";
import { ligEtiketi } from "../../lib/ulkeler";
import { t, useLang } from "../../lib/i18n";
import { macSaatiEtiketi } from "../../lib/macSaati";
import { useUserId } from "../../lib/useUserId";
import { auth } from "../../lib/firebase";
import { usePolling } from "../../hooks/usePolling";

// ─── Types ────────────────────────────────────────────────────────────────────

type OpenDuel = {
  id: string;
  fixtureId: string;
  stake: number;
  pot: number;
  houseCut: number;
  winAmount: number;
  creatorId: string;
  creatorName: string | null;
  challengedId: string | null;
  status: string;
};

type MatchArena = {
  fixtureId: string;
  home: string;
  away: string;
  league: string | null;
  /** Lig adlari ulkeden bagimsiz tekrar ediyor — etiket ulkeyi de gostermeli. */
  country?: string | null;
  kickoffISO: string | null;
  openCount: number;
  minStake: number;
  maxStake: number;
  preview: OpenDuel[];
  /** Gerçek düellosu olmayan "ilk sen aç" kartı — bkz. lib/arena-vitrin.cjs. */
  vitrin?: boolean;
};

// ─── Fetch ────────────────────────────────────────────────────────────────────

/**
 * Paylasilan apiFetch'e delege eder.
 *
 * ⚠️ Buradaki kopya ham `fetch` kullaniyordu (zaman asimi/yeniden deneme yok)
 * ama bir seyi DOGRU yapiyordu: ag hatasinda `resetApiBase()` ile adresi
 * tazeleyip bir kez yeniden deniyordu. O davranis kaybolmasin diye
 * lib/apiFetch icine tasindi — ve orada yalnizca GET/HEAD icin uygulaniyor
 * (POST'u tekrarlamak cifte tahmin/bahis demek olurdu).
 */
async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const p = path.startsWith("/") ? path : `/${path}`;
  return sharedApiFetch(p, init as any);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function playerAvatar(name: string | null): string {
  if (!name) return "⚡";
  const map: Record<string, string> = {
    A:"🦅",B:"🐻",C:"🐱",D:"🐺",E:"🦊",F:"🔥",G:"🐊",H:"🦁",
    I:"⚡",J:"🐬",K:"🦀",L:"🐆",M:"🦉",N:"🐢",O:"🦜",P:"🐧",
    R:"🦝",S:"🌙",T:"🐯",U:"🦄",V:"🦈",Y:"🦚",Z:"🦓",
  };
  return map[name.trim().charAt(0).toUpperCase()] || "⚡";
}

function shortId(uid: string) { return String(uid || "").slice(-4).toUpperCase(); }

function kickoffLabel(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    if (diff < 0) return t("started");
    if (diff < 3600000) return t("nMin", { n: Math.round(diff / 60000) });
    return macSaatiEtiketi(iso, { bugun: t("today"), yarin: t("tomorrow") });
  } catch { return ""; }
}

// ─── Pulse hook ───────────────────────────────────────────────────────────────

function usePulse() {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(a, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  return a;
}

// ─── MiniDuelRow ─────────────────────────────────────────────────────────────

function MiniDuelRow({ duel, userId, myName, lcBalance, onAccepted, onError }: {
  duel: OpenDuel; userId: string; myName: string | null;
  lcBalance: number | null; onAccepted: (duelId: string) => void;
  onError: (msg: string) => void;
}) {
  const [sitting, setSitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const pulse = usePulse();

  const canAfford = lcBalance === null || lcBalance >= duel.stake;
  /* ⚠️ SABİT ÇARPAN KALDIRILDI (2026-08-05). Burada `pot * 0.95` vardı; kasa
   * payı artık kademeli TAM SAYI LC olduğu için tek bir çarpan yanlış ödül
   * vaat eder (bahis 5'te %10, bahis 12'de %4.2, bahis 1-4'te %0 —
   * bkz. api/lib/duello-kesinti.cjs). Yedek, sunucunun sonuçlandırma
   * yolundaki ile AYNI: winAmount yoksa pot. */
  const prize = duel.winAmount ?? duel.pot;
  const creatorLabel = duel.creatorName || shortId(duel.creatorId);

  async function sit() {
    if (!canAfford) { onError(t("needLcForDuel", { n: duel.stake })); return; }
    setSitting(true);
    try {
      const r = await apiFetch("/api/duels/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duelId: duel.id, acceptorName: myName }),
      });
      const j = await r.json();
      if (!j?.ok) {
        if (j?.error === "NOT_OPEN") {
          setAccepted(true); // başkası kapmış
          onAccepted(duel.id);
        } else {
          onError(j?.error || t("acceptFailed"));
        }
        return;
      }
      setAccepted(true);
      onAccepted(duel.id);
    } catch (e: any) {
      onError(String(e?.message || t("error")));
    } finally {
      setSitting(false);
    }
  }

  if (accepted) return null;

  const oScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.04] });
  const oOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });

  return (
    <View style={{
      flexDirection: "row", alignItems: "center", gap: 8,
      backgroundColor: "#07101f", borderRadius: 10,
      borderWidth: 1, borderColor: "#1e293b", padding: 8,
    }}>
      {/* Creator seat */}
      <View style={{
        flex: 1, flexDirection: "row", alignItems: "center", gap: 6,
        borderRadius: 8, borderWidth: 1, borderColor: "#1e3a5f",
        backgroundColor: "#0a1628", padding: 8,
      }}>
        <Text style={{ fontSize: 18 }}>{playerAvatar(duel.creatorName)}</Text>
        <Text style={{ color: "#93c5fd", fontWeight: "700", fontSize: 11 }} numberOfLines={1}>
          {creatorLabel}
        </Text>
      </View>

      {/* Stakes */}
      <View style={{ alignItems: "center", gap: 1 }}>
        <Text style={{ color: "#f59e0b", fontWeight: "900", fontSize: 12 }}>{duel.stake} LC</Text>
        <Text style={{ color: "#1e3a5f", fontSize: 9 }}>→{prize}LC</Text>
      </View>

      {/* Empty seat / OTUR */}
      {canAfford ? (
        <Animated.View style={{ flex: 1, transform: [{ scale: oScale }], opacity: oOpacity }}>
          <TouchableOpacity
            onPress={sit}
            disabled={sitting}
            style={{
              borderRadius: 8, borderWidth: 2, borderColor: "#3b82f6",
              backgroundColor: "#1e3a5f44", padding: 8,
              alignItems: "center", justifyContent: "center", gap: 2,
            }}
          >
            {sitting
              ? <ActivityIndicator color="#3b82f6" size="small" />
              : <>
                  <Text style={{ fontSize: 16 }}>💺</Text>
                  <Text style={{ color: "#60a5fa", fontWeight: "900", fontSize: 10 }}>OTUR</Text>
                </>
            }
          </TouchableOpacity>
        </Animated.View>
      ) : (
        <View style={{
          flex: 1, borderRadius: 8, borderWidth: 1, borderColor: "#1e293b",
          borderStyle: "dashed", padding: 8, alignItems: "center", opacity: 0.4,
        }}>
          <Text style={{ fontSize: 16 }}>💺</Text>
          <Text style={{ color: "#334155", fontSize: 9 }}>Yetersiz LC</Text>
        </View>
      )}
    </View>
  );
}

// ─── MatchCard ────────────────────────────────────────────────────────────────

function MatchCard({ match, userId, myName, lcBalance, onAccepted, onError, onOpenFull }: {
  match: MatchArena; userId: string; myName: string | null;
  lcBalance: number | null; onAccepted: (duelId: string) => void;
  onError: (msg: string) => void; onOpenFull: (match: MatchArena) => void;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  function handleAccepted(duelId: string) {
    setHidden(prev => new Set([...prev, duelId]));
    onAccepted(duelId);
  }

  const visible = match.preview.filter(d => !hidden.has(d.id));
  const remainingCount = match.openCount - hidden.size;

  const stakeRange = match.minStake === match.maxStake
    ? `${match.minStake} LC`
    : `${match.minStake}–${match.maxStake} LC`;

  return (
    <View style={{
      borderRadius: 16, backgroundColor: "#07101f",
      borderWidth: 1, borderColor: "#1e293b", overflow: "hidden",
    }}>
      {/* Match header — tappable */}
      <TouchableOpacity onPress={() => onOpenFull(match)} activeOpacity={0.8}>
        <View style={{
          backgroundColor: "#0a1628", padding: 12,
          flexDirection: "row", alignItems: "center",
        }}>
          <View style={{ flex: 1 }}>
            {ligEtiketi(match.league, match.country) ? (
              /* ⚠️ toUpperCase KALDIRILDI: bayrak + Türkçe ülke adı büyük
                 harfe çevrilince bozuluyor ("İ" tuzağı) ve etiket okunmaz
                 hâle geliyor. Ayırt ediciliği ülke sağlıyor, kapitalizasyon
                 değil. */
              <Text style={{ color: "#334155", fontSize: 9, fontWeight: "700", letterSpacing: 1.2, marginBottom: 3 }}>
                {ligEtiketi(match.league, match.country)}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ color: "#f1f5f9", fontWeight: "900", fontSize: 14 }} numberOfLines={1}>
                {match.home}
              </Text>
              <Text style={{ color: "#334155", fontWeight: "700", fontSize: 11 }}>–</Text>
              <Text style={{ color: "#f1f5f9", fontWeight: "900", fontSize: 14 }} numberOfLines={1}>
                {match.away}
              </Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end", gap: 3, marginLeft: 10 }}>
            {match.kickoffISO ? (
              <Text style={{ color: "#475569", fontSize: 10 }}>{kickoffLabel(match.kickoffISO)}</Text>
            ) : null}
            <View style={{
              flexDirection: "row", alignItems: "center", gap: 4,
              backgroundColor: match.vitrin ? "#3f2d14" : "#1e3a5f",
              borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3,
            }}>
              <Text style={{ fontSize: 10 }}>{match.vitrin ? "✨" : "⚔️"}</Text>
              <Text style={{ color: match.vitrin ? "#fbbf24" : "#60a5fa", fontWeight: "800", fontSize: 11 }}>
                {match.vitrin ? t("duelBeFirst") : t("nOpen", { n: remainingCount })}
              </Text>
            </View>
            {!match.vitrin && <Text style={{ color: "#334155", fontSize: 9 }}>{stakeRange}</Text>}
          </View>
        </View>
      </TouchableOpacity>

      {/* Vitrin: gerçek düello yok, kullanıcı ilkini açsın */}
      {match.vitrin ? (
        <TouchableOpacity onPress={() => onOpenFull(match)} activeOpacity={0.85}
          style={{ padding: 12, alignItems: "center", gap: 8 }}>
          <Text style={{ color: "#64748b", fontSize: 11, textAlign: "center" }}>
            {t("noDuelYetHere")}
          </Text>
          <View style={{
            flexDirection: "row", alignItems: "center", gap: 6,
            backgroundColor: "#2563eb", borderRadius: 999,
            paddingHorizontal: 18, paddingVertical: 9,
          }}>
            <Text style={{ fontSize: 13 }}>⚔️</Text>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>{t("openFirstDuel")}</Text>
          </View>
        </TouchableOpacity>
      ) : visible.length > 0 ? (
        <View style={{ padding: 8, gap: 6 }}>
          {visible.map(d => (
            <MiniDuelRow
              key={d.id}
              duel={d}
              userId={userId}
              myName={myName}
              lcBalance={lcBalance}
              onAccepted={handleAccepted}
              onError={onError}
            />
          ))}
          {remainingCount > visible.length && (
            <TouchableOpacity
              onPress={() => onOpenFull(match)}
              style={{
                padding: 8, alignItems: "center", borderRadius: 8,
                borderWidth: 1, borderColor: "#1e293b", borderStyle: "dashed",
              }}
            >
              <Text style={{ color: "#475569", fontSize: 11 }}>
                {t("moreSeeAll", { n: remainingCount - visible.length })}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : remainingCount === 0 ? (
        <View style={{ padding: 12, alignItems: "center" }}>
          <Text style={{ color: "#1e293b", fontSize: 11 }}>{t("allSeatsFull")}</Text>
        </View>
      ) : (
        <TouchableOpacity onPress={() => onOpenFull(match)} style={{ padding: 12, alignItems: "center" }}>
          <Text style={{ color: "#475569", fontSize: 11 }}>
            {t("nOpenSeats", { n: remainingCount })}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Arena screen ─────────────────────────────────────────────────────────────

const POLL_MS = 15_000;

export default function ArenaScreen() {
  useLang(); // dil değişince ekran yeniden çizilsin
  const router = useRouter();
  const userId = useUserId();
  const myName = auth.currentUser?.displayName || null;

  const [matches, setMatches] = useState<MatchArena[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lcBalance, setLcBalance] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  async function loadBalance() {
    if (!userId) return;
    try {
      const r = await apiFetch(`/api/rt/lc-wallet/summary?userId=${encodeURIComponent(userId)}`);
      const j = await r.json();
      if (j?.ok && j.user) setLcBalance(Number(j.user.balance ?? 0));
    } catch {}
  }

  const loadArena = useCallback(async (silent = false) => {
    if (!userId) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const r = await apiFetch(`/api/duels/arena?userId=${encodeURIComponent(userId)}`);
      const j = await r.json();
      if (j?.ok) setMatches(j.matches || []);
      loadBalance();
    } catch (e: any) {
      if (!silent) showToast(String(e?.message || t("loadError")), false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  // Yoklama yalnızca bu sekme görünürken ve uygulama ön plandayken çalışır.
  // Sekmeler mount'ta kaldığı için eskiden başka sekmedeyken de istek gidiyordu.
  // İlk yükleme sessiz DEĞİL: açılışta bir hata olursa kullanıcı görsün.
  const firstLoad = useRef(true);
  usePolling(() => {
    const silent = !firstLoad.current;
    firstLoad.current = false;
    loadArena(silent);
  }, POLL_MS);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  function handleAccepted(duelId: string) {
    showToast(t("duelStarted2"));
    // silently refresh to catch other changes
    setTimeout(() => loadArena(true), 500);
  }

  function openFull(match: MatchArena) {
    router.push({
      pathname: "/duel/[fixtureId]",
      params: {
        fixtureId: match.fixtureId,
        home: match.home,
        away: match.away,
        league: match.league || "",
        kickoffISO: match.kickoffISO || "",
      },
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#040d1a" }}>
      {/* Header */}
      <View style={{
        backgroundColor: "#07101f", borderBottomWidth: 1, borderBottomColor: "#1e293b",
        paddingTop: 52, paddingBottom: 12, paddingHorizontal: 16,
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      }}>
        <View>
          <Text style={{ color: "#f1f5f9", fontWeight: "900", fontSize: 20 }}>{t("duelArena")}</Text>
          <Text style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>
            Otur, rakip bulsun seni
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          {lcBalance !== null && (
            <View style={{
              flexDirection: "row", alignItems: "center", gap: 4,
              backgroundColor: "#fef9c311", borderRadius: 999,
              paddingHorizontal: 10, paddingVertical: 5,
            }}>
              <Text style={{ fontSize: 12 }}>🪙</Text>
              <Text style={{ color: "#fbbf24", fontWeight: "700", fontSize: 12 }}>{lcBalance} LC</Text>
            </View>
          )}
          <View style={{
            width: 8, height: 8, borderRadius: 4,
            backgroundColor: "#10b981",
          }} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor="#3b82f6"
            onRefresh={() => { setRefreshing(true); loadArena(); }}
          />
        }
      >
        {/* Toast */}
        {toast && (
          <View style={{
            borderRadius: 10, padding: 10, alignItems: "center",
            backgroundColor: toast.ok ? "#052e1699" : "#1a040499",
            borderWidth: 1, borderColor: toast.ok ? "#10b98155" : "#ef444455",
          }}>
            <Text style={{ color: toast.ok ? "#4ade80" : "#f87171", fontWeight: "700", fontSize: 12 }}>
              {toast.msg}
            </Text>
          </View>
        )}

        {/* Loading */}
        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: "center", gap: 10 }}>
            <ActivityIndicator color="#3b82f6" size="large" />
            <Text style={{ color: "#64748b", fontSize: 12 }}>{t("arenaLoading")}</Text>
          </View>
        ) : matches.length === 0 ? (
          <View style={{
            borderRadius: 16, borderWidth: 1, borderColor: "#1e293b",
            borderStyle: "dashed", padding: 40, alignItems: "center", gap: 10,
            backgroundColor: "#07101f",
          }}>
            <Text style={{ fontSize: 40 }}>🏟️</Text>
            <Text style={{ color: "#94a3b8", fontSize: 15, fontWeight: "700" }}>{t("arenaEmptyNow")}</Text>
            <Text style={{ color: "#64748b", fontSize: 12, textAlign: "center", lineHeight: 18 }}>
              {t("arenaEmptyHelp1")}{"\n"}{t("arenaEmptyHelp2")}
            </Text>
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/(tabs)/live", params: { tab: "open" } })}
              activeOpacity={0.85}
              style={{
                marginTop: 6, flexDirection: "row", alignItems: "center", gap: 6,
                backgroundColor: "#2563eb", borderRadius: 999,
                paddingHorizontal: 20, paddingVertical: 11,
              }}
            >
              <Text style={{ fontSize: 14 }}>⚽</Text>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>{t("goMatchesPredict")}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={{ color: "#334155", fontSize: 9, fontWeight: "700", letterSpacing: 2, paddingHorizontal: 2 }}>
              {t("nMatchSeats", { m: matches.length, k: matches.reduce((s, m) => s + m.openCount, 0) })}
            </Text>
            {matches.map(m => (
              <MatchCard
                key={m.fixtureId}
                match={m}
                userId={userId}
                myName={myName}
                lcBalance={lcBalance}
                onAccepted={handleAccepted}
                onError={msg => showToast(msg, false)}
                onOpenFull={openFull}
              />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}
