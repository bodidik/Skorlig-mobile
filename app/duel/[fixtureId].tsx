import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Animated, Easing, Alert,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import Colors from "../../constants/colors";
import { getApiBase, resetApiBase } from "../../lib/apiBase";
import { getAuthHeaders } from "../../lib/apiFetch";
import { useUserId } from "../../lib/useUserId";
import { auth } from "../../lib/firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

type DuelStatus = "open" | "active" | "settled" | "cancelled";
type Duel = {
  id: string;
  fixtureId: string;
  stake: number;
  pot: number;
  creatorId: string;
  creatorName: string | null;
  challengedId: string | null;
  acceptorId: string | null;
  acceptorName: string | null;
  status: DuelStatus;
  home: string | null;
  away: string | null;
  league: string | null;
  kickoffISO: string | null;
  creatorPoints: number | null;
  acceptorPoints: number | null;
  winnerId: string | null;
  createdAt: string;
  acceptedAt: string | null;
  settledAt: string | null;
};

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function apiFetch(path: string, init?: RequestInit, _r = false): Promise<Response> {
  const base = await getApiBase();
  const authH = await getAuthHeaders();
  const p = path.startsWith("/") ? path : `/${path}`;
  try {
    return await fetch(`${base}${p}`, { ...init, headers: { ...authH, ...(init?.headers as any) } });
  } catch (e) {
    if (!_r) { resetApiBase(); return apiFetch(path, init, true); }
    throw e;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STAKES = [1, 2, 3, 5, 8, 10, 12];

function shortId(uid: string) { return String(uid || "").slice(-4).toUpperCase(); }

function playerAvatar(name: string | null): string {
  if (!name) return "👤";
  const map: Record<string, string> = {
    A:"🦅",B:"🐻",C:"🐱",D:"🐺",E:"🦊",F:"🔥",G:"🐊",H:"🦁",
    I:"⚡",J:"🐬",K:"🦀",L:"🐆",M:"🦉",N:"🐢",O:"🦜",P:"🐧",
    R:"🦝",S:"🌙",T:"🐯",U:"🦄",V:"🦈",Y:"🦚",Z:"🦓",
  };
  return map[name.trim().charAt(0).toUpperCase()] || "⚡";
}

// ─── Pulse animation hook ─────────────────────────────────────────────────────

function usePulse(active = true) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) { anim.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active]);
  return anim;
}

// ─── Seat component ───────────────────────────────────────────────────────────

function Seat({ name, uid, points, isWinner, settled, tied, empty, onSit, sitting, canSit }:
  { name: string|null; uid?: string; points?: number|null; isWinner?: boolean;
    settled?: boolean; tied?: boolean; empty?: boolean;
    onSit?: () => void; sitting?: boolean; canSit?: boolean }) {

  const pulse = usePulse(!!empty && !!canSit);
  const glowOpacity = pulse.interpolate({ inputRange: [0,1], outputRange: [0.3, 1] });
  const glowScale   = pulse.interpolate({ inputRange: [0,1], outputRange: [0.95, 1.05] });

  if (empty) {
    return (
      <View style={{ flex: 1, alignItems: "center", gap: 6 }}>
        {canSit ? (
          <Animated.View style={{ transform: [{ scale: glowScale }], opacity: glowOpacity, width: "100%" }}>
            <TouchableOpacity
              onPress={onSit}
              disabled={sitting}
              activeOpacity={0.7}
              style={{
                borderRadius: 14, borderWidth: 2, borderColor: "#3b82f6",
                backgroundColor: "#1e3a5f55", padding: 16, alignItems: "center", gap: 6,
                shadowColor: "#3b82f6", shadowOpacity: 0.6, shadowRadius: 12, elevation: 8,
              }}
            >
              {sitting ? (
                <ActivityIndicator color="#3b82f6" size="small" />
              ) : (
                <>
                  <Text style={{ fontSize: 26 }}>💺</Text>
                  <Text style={{ color: "#60a5fa", fontWeight: "900", fontSize: 15 }}>OTUR</Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <View style={{
            borderRadius: 14, borderWidth: 1, borderColor: "#1e293b",
            borderStyle: "dashed", padding: 16, alignItems: "center", gap: 6, width: "100%",
          }}>
            <Text style={{ fontSize: 26, opacity: 0.3 }}>💺</Text>
            <Text style={{ color: "#334155", fontSize: 11 }}>Boş</Text>
          </View>
        )}
      </View>
    );
  }

  const displayName = name || (uid ? shortId(uid) : "?");
  const avatar = playerAvatar(name);
  const borderCol = !settled ? "#1e3a5f"
    : tied ? "#475569" : isWinner ? "#4ade80" : "#ef444466";
  const bg = !settled ? "#0a1628"
    : tied ? "#1a2333" : isWinner ? "#052e1688" : "#1a0808";

  return (
    <View style={{
      flex: 1, borderRadius: 14, borderWidth: 1.5, borderColor: borderCol,
      backgroundColor: bg, padding: 12, alignItems: "center", gap: 4,
    }}>
      <Text style={{ fontSize: 28 }}>
        {settled && !tied && isWinner ? "🏆" : avatar}
      </Text>
      <Text style={{ color: "#e2e8f0", fontWeight: "800", fontSize: 13 }} numberOfLines={1}>
        {displayName}
      </Text>
      {settled && points != null && (
        <Text style={{
          fontWeight: "900", fontSize: 16,
          color: isWinner && !tied ? "#4ade80" : "#64748b",
        }}>
          {Math.round(points * 10) / 10} p
        </Text>
      )}
    </View>
  );
}

// ─── Arena card ───────────────────────────────────────────────────────────────

function ArenaCard({ duel, userId, myName, onAccept, onCancel }:
  { duel: Duel; userId: string; myName: string|null;
    onAccept: (d: Duel) => void; onCancel: (d: Duel) => void }) {

  const [sitting, setSitting] = useState(false);

  const isCreator = duel.creatorId.toLowerCase() === userId.toLowerCase();
  const isAcceptor = duel.acceptorId?.toLowerCase() === userId.toLowerCase();
  const iWon = duel.winnerId?.toLowerCase() === userId.toLowerCase();
  const tied = duel.status === "settled" && !duel.winnerId;
  const canSit = duel.status === "open" && !isCreator;

  const pulseGlow = usePulse(duel.status === "open");
  const borderGlow = pulseGlow.interpolate({ inputRange: [0,1], outputRange: [0.15, 0.55] });

  async function handleSit() {
    setSitting(true);
    try { await onAccept(duel); } finally { setSitting(false); }
  }

  const creatorDisplay = isCreator ? (myName || duel.creatorName) : duel.creatorName;
  const acceptorDisplay = isAcceptor ? (myName || duel.acceptorName) : duel.acceptorName;

  return (
    <Animated.View style={{
      borderRadius: 18,
      borderWidth: 1.5,
      borderColor: duel.status === "open"
        ? "#3b82f6"
        : duel.status === "active" ? "#8b5cf6"
        : duel.status === "settled" ? (iWon ? "#10b981" : tied ? "#475569" : "#ef4444")
        : "#1e293b",
      backgroundColor: "#07101f",
      overflow: "hidden",
    }}>
      {/* Stake banner */}
      <View style={{
        paddingVertical: 10, paddingHorizontal: 16,
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
        backgroundColor: duel.status === "open" ? "#0f1f3d"
          : duel.status === "active" ? "#13102b"
          : "#0a0a0a",
      }}>
        <Text style={{ color: "#f59e0b", fontWeight: "900", fontSize: 16 }}>
          🪙 {duel.stake} LC
        </Text>
        <Text style={{ color: "#334155", fontSize: 13 }}>×2 =</Text>
        <Text style={{ color: "#4ade80", fontWeight: "900", fontSize: 16 }}>
          {duel.pot} LC
        </Text>
        <View style={{ position: "absolute", right: 12 }}>
          <View style={{
            borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3,
            backgroundColor:
              duel.status === "open" ? "#1d4ed844"
              : duel.status === "active" ? "#7c3aed44"
              : duel.status === "settled" ? (iWon ? "#05503344" : "#44111144")
              : "#11111144",
          }}>
            <Text style={{
              fontWeight: "700", fontSize: 10,
              color: duel.status === "open" ? "#60a5fa"
                : duel.status === "active" ? "#a78bfa"
                : duel.status === "settled" ? (tied ? "#64748b" : iWon ? "#34d399" : "#f87171")
                : "#475569",
            }}>
              {duel.status === "open" ? "AÇIK"
                : duel.status === "active" ? "SÜRÜYOR"
                : duel.status === "settled" ? (tied ? "BERABERE" : iWon ? "KAZANDIN" : "KAYBETTİN")
                : "İPTAL"}
            </Text>
          </View>
        </View>
      </View>

      {/* Arena */}
      <View style={{ padding: 12, flexDirection: "row", alignItems: "stretch", gap: 10 }}>
        <Seat
          name={creatorDisplay}
          uid={duel.creatorId}
          points={duel.creatorPoints}
          isWinner={duel.winnerId === duel.creatorId}
          settled={duel.status === "settled"}
          tied={tied}
        />

        {/* Center divider */}
        <View style={{ alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 2 }}>
          <View style={{ width: 1, flex: 1, backgroundColor: "#1e293b" }} />
          <Text style={{ color: "#1e3a5f", fontWeight: "900", fontSize: 13, lineHeight: 16 }}>VS</Text>
          <View style={{ width: 1, flex: 1, backgroundColor: "#1e293b" }} />
        </View>

        {duel.acceptorId ? (
          <Seat
            name={acceptorDisplay}
            uid={duel.acceptorId}
            points={duel.acceptorPoints}
            isWinner={duel.winnerId === duel.acceptorId}
            settled={duel.status === "settled"}
            tied={tied}
          />
        ) : (
          <Seat empty canSit={canSit} onSit={handleSit} sitting={sitting} name={null} />
        )}
      </View>

      {/* Settled result */}
      {duel.status === "settled" && (isCreator || isAcceptor) && (
        <View style={{
          marginHorizontal: 12, marginBottom: 12, borderRadius: 10, padding: 10, alignItems: "center",
          backgroundColor: tied ? "#1e293b" : iWon ? "#052e1655" : "#1a040455",
        }}>
          <Text style={{
            fontWeight: "800", fontSize: 13,
            color: tied ? "#94a3b8" : iWon ? "#4ade80" : "#f87171",
          }}>
            {tied
              ? "🤝 Berabere — LC'ler iade edildi"
              : iWon
              ? `🏆 Kazandın! +${duel.pot} LC`
              : `❌ Kaybettin — ${duel.stake} LC`}
          </Text>
        </View>
      )}

      {/* Cancel button */}
      {isCreator && duel.status === "open" && (
        <TouchableOpacity
          onPress={() => onCancel(duel)}
          style={{
            marginHorizontal: 12, marginBottom: 12, borderRadius: 10,
            borderWidth: 1, borderColor: "#ef444433", paddingVertical: 8, alignItems: "center",
          }}
        >
          <Text style={{ color: "#ef4444", fontSize: 11 }}>Geri Çek — {duel.stake} LC iade edilir</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DuelScreen() {
  const { fixtureId, home: qHome, away: qAway, league: qLeague, kickoffISO: qKickoff } =
    useLocalSearchParams<{ fixtureId?:string; home?:string; away?:string; league?:string; kickoffISO?:string }>();

  const userId = useUserId();
  const myDisplayName = auth.currentUser?.displayName || null;

  const fx = String(fixtureId || "").trim();
  const matchHome = String(qHome || "").trim();
  const matchAway = String(qAway || "").trim();
  const matchLeague = String(qLeague || "").trim();
  const matchKickoff = String(qKickoff || "").trim();

  const [openDuels, setOpenDuels]   = useState<Duel[]>([]);
  const [myDuels,   setMyDuels]     = useState<Duel[]>([]);
  const [loading,   setLoading]     = useState(true);
  const [refreshing,setRefreshing]  = useState(false);
  const [selectedStake, setSelectedStake] = useState(3);
  const [creating,  setCreating]    = useState(false);
  const [toast,     setToast]       = useState<{ msg: string; ok: boolean } | null>(null);
  const [lcBalance, setLcBalance]   = useState<number | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  async function loadBalance(uid: string) {
    try {
      const r = await apiFetch(`/api/rt/lc-wallet/summary?userId=${encodeURIComponent(uid)}`);
      const j = await r.json();
      if (j?.ok && j.user) setLcBalance(Number(j.user.balance ?? 0));
    } catch {}
  }

  const loadAll = useCallback(async () => {
    if (!fx || !userId) return;
    setLoading(true);
    try {
      const [or, mr] = await Promise.all([
        apiFetch(`/api/duels/open?fixtureId=${encodeURIComponent(fx)}&userId=${encodeURIComponent(userId)}`),
        apiFetch(`/api/duels/my?userId=${encodeURIComponent(userId)}&fixtureId=${encodeURIComponent(fx)}`),
      ]);
      const [oj, mj] = await Promise.all([or.json(), mr.json()]);
      if (oj?.ok) setOpenDuels(oj.items || []);
      if (mj?.ok) setMyDuels(mj.items || []);
      loadBalance(userId);
    } catch (e: any) {
      showToast(String(e?.message || "Yükleme hatası"), false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fx, userId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Actions ──────────────────────────────────────────────────────────────

  async function createDuel() {
    if (!fx || !userId) return;
    if (lcBalance !== null && lcBalance < selectedStake) {
      showToast(`Yetersiz LC — bakiyen: ${lcBalance} LC`, false);
      return;
    }
    setCreating(true);
    try {
      const r = await apiFetch("/api/duels/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fixtureId: fx, stake: selectedStake, creatorName: myDisplayName,
          home: matchHome||null, away: matchAway||null,
          league: matchLeague||null, kickoffISO: matchKickoff||null,
        }),
      });
      const j = await r.json();
      if (!j?.ok) {
        showToast(j?.error === "LC_NOT_ENOUGH"
          ? `Yetersiz LC (${j.lc ?? "?"}/${j.needed ?? selectedStake})`
          : j?.error || "Hata", false);
        return;
      }
      showToast(`⚔️ ${selectedStake} LC'lik koltuğun hazır — rakip bekleniyor!`);
      loadAll();
    } catch (e: any) {
      showToast(String(e?.message || "Hata"), false);
    } finally {
      setCreating(false);
    }
  }

  async function acceptDuel(duel: Duel) {
    if (lcBalance !== null && lcBalance < duel.stake) {
      showToast(`Yetersiz LC — ${duel.stake} LC gerekiyor`, false);
      return;
    }
    const r = await apiFetch("/api/duels/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ duelId: duel.id, acceptorName: myDisplayName }),
    });
    const j = await r.json();
    if (!j?.ok) {
      showToast(j?.error || "Kabul edilemedi", false);
      return;
    }
    showToast("Düello başladı! 🏆 En yüksek puanı yapan kazanır");
    loadAll();
  }

  async function cancelDuel(duel: Duel) {
    Alert.alert("Geri Çek?", `${duel.stake} LC iade edilecek.`, [
      { text: "İptal", style: "cancel" },
      {
        text: "Evet, geri çek", style: "destructive",
        onPress: async () => {
          const r = await apiFetch("/api/duels/cancel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ duelId: duel.id }),
          });
          const j = await r.json();
          if (!j?.ok) { showToast(j?.error || "Hata", false); return; }
          showToast(`Meydan okuma iptal edildi. ${duel.stake} LC iade edildi.`);
          loadAll();
        },
      },
    ]);
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  const myActive  = myDuels.filter(d => d.status === "open" || d.status === "active");
  const mySettled = myDuels.filter(d => d.status === "settled" || d.status === "cancelled");
  const canAfford = lcBalance === null || lcBalance >= selectedStake;

  return (
    <View style={{ flex: 1, backgroundColor: "#040d1a" }}>
      <ScrollView
        contentContainerStyle={{ padding: 14, gap: 14, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor="#3b82f6"
          onRefresh={() => { setRefreshing(true); loadAll(); }} />}
      >

        {/* ── Match header ── */}
        <View style={{
          borderRadius: 18, overflow: "hidden",
          borderWidth: 1, borderColor: "#1e3a5f",
          backgroundColor: "#07101f",
        }}>
          <View style={{
            paddingVertical: 4, alignItems: "center",
            backgroundColor: "#0f1f3d",
          }}>
            <Text style={{ color: "#334155", fontSize: 9, fontWeight: "700", letterSpacing: 2 }}>
              {matchLeague ? matchLeague.toUpperCase() : "DUELLO ARENAСИ"}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text style={{ color: "#f1f5f9", fontWeight: "900", fontSize: 16, flex: 1, textAlign: "right" }} numberOfLines={1}>
              {matchHome}
            </Text>
            <View style={{ alignItems: "center", paddingHorizontal: 14 }}>
              <Text style={{ fontSize: 24 }}>⚔️</Text>
            </View>
            <Text style={{ color: "#f1f5f9", fontWeight: "900", fontSize: 16, flex: 1 }} numberOfLines={1}>
              {matchAway}
            </Text>
          </View>
          {lcBalance !== null && (
            <View style={{
              flexDirection: "row", alignItems: "center", justifyContent: "center",
              paddingBottom: 12, gap: 5,
            }}>
              <Text style={{ color: "#fbbf24", fontSize: 12 }}>🪙</Text>
              <Text style={{ color: "#fbbf24", fontWeight: "700", fontSize: 12 }}>
                Bakiyen: {lcBalance} LC
              </Text>
            </View>
          )}
        </View>

        {/* ── Toast ── */}
        {toast && (
          <View style={{
            borderRadius: 12, padding: 12, alignItems: "center",
            backgroundColor: toast.ok ? "#052e1699" : "#1a040499",
            borderWidth: 1, borderColor: toast.ok ? "#10b98155" : "#ef444455",
          }}>
            <Text style={{ color: toast.ok ? "#4ade80" : "#f87171", fontWeight: "700", fontSize: 13 }}>
              {toast.msg}
            </Text>
          </View>
        )}

        {/* ── Create new duel ── */}
        <View style={{
          borderRadius: 18, borderWidth: 1, borderColor: "#1e3a5f",
          backgroundColor: "#07101f", overflow: "hidden",
        }}>
          <View style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#0a1628" }}>
            <Text style={{ color: "#93c5fd", fontWeight: "800", fontSize: 14 }}>
              ⚔️  Yeni Meydan Okuma
            </Text>
            <Text style={{ color: "#334155", fontSize: 11, marginTop: 2 }}>
              Koltuğa otur, rakip bulsun seni
            </Text>
          </View>

          <View style={{ padding: 14, gap: 12 }}>
            {/* Stake row */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {STAKES.map(s => {
                const sel = selectedStake === s;
                const ok  = lcBalance === null || lcBalance >= s;
                return (
                  <TouchableOpacity
                    key={s}
                    onPress={() => setSelectedStake(s)}
                    style={{
                      paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999,
                      borderWidth: 2,
                      borderColor: sel ? "#f59e0b" : ok ? "#1e3a5f" : "#0f172a",
                      backgroundColor: sel ? "#f59e0b22" : "transparent",
                      opacity: ok ? 1 : 0.35,
                    }}
                  >
                    <Text style={{ color: sel ? "#f59e0b" : ok ? "#64748b" : "#334155", fontWeight: "800", fontSize: 14 }}>
                      {s}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Pot preview */}
            <View style={{ flexDirection: "row", borderRadius: 12, overflow: "hidden" }}>
              <View style={{ flex: 1, backgroundColor: "#0f172a", padding: 12, alignItems: "center" }}>
                <Text style={{ color: "#475569", fontSize: 9, fontWeight: "700", letterSpacing: 1 }}>YATIRIRSIN</Text>
                <Text style={{ color: "#f59e0b", fontWeight: "900", fontSize: 22, marginTop: 2 }}>
                  {selectedStake} LC
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: "#1e293b" }} />
              <View style={{ flex: 1, backgroundColor: "#0f172a", padding: 12, alignItems: "center" }}>
                <Text style={{ color: "#475569", fontSize: 9, fontWeight: "700", letterSpacing: 1 }}>KAZANIRSAN</Text>
                <Text style={{ color: "#4ade80", fontWeight: "900", fontSize: 22, marginTop: 2 }}>
                  {selectedStake * 2} LC
                </Text>
              </View>
            </View>

            {/* Chair preview + button */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              {/* My seat (filled) */}
              <View style={{
                flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: "#1e3a5f",
                backgroundColor: "#0a1628", padding: 12, alignItems: "center", gap: 4,
              }}>
                <Text style={{ fontSize: 26 }}>{playerAvatar(myDisplayName)}</Text>
                <Text style={{ color: "#93c5fd", fontWeight: "700", fontSize: 12 }} numberOfLines={1}>
                  {myDisplayName || "Sen"}
                </Text>
              </View>

              <Text style={{ color: "#1e3a5f", fontWeight: "900", fontSize: 14 }}>VS</Text>

              {/* Empty seat */}
              <View style={{
                flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: "#1e293b",
                borderStyle: "dashed", backgroundColor: "#07101f",
                padding: 12, alignItems: "center", gap: 4,
              }}>
                <Text style={{ fontSize: 26, opacity: 0.25 }}>💺</Text>
                <Text style={{ color: "#334155", fontSize: 11 }}>Rakip bekleniyor</Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={createDuel}
              disabled={creating || !canAfford}
              activeOpacity={0.8}
              style={{
                borderRadius: 999, paddingVertical: 14, alignItems: "center",
                backgroundColor: !canAfford ? "#0f172a" : creating ? "#92400e" : "#f59e0b",
                shadowColor: canAfford && !creating ? "#f59e0b" : "transparent",
                shadowOpacity: 0.4, shadowRadius: 12, elevation: 6,
              }}
            >
              {creating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ fontWeight: "900", fontSize: 15, color: !canAfford ? "#334155" : "#0f172a" }}>
                  {!canAfford
                    ? `Yetersiz LC (${lcBalance}/${selectedStake})`
                    : `⚔️  ${selectedStake} LC ile Koltuğa Otur`}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Open duels (accept) ── */}
        {loading ? (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <ActivityIndicator color="#3b82f6" size="large" />
            <Text style={{ color: "#334155", fontSize: 12 }}>Arena yükleniyor...</Text>
          </View>
        ) : openDuels.length > 0 ? (
          <View style={{ gap: 10 }}>
            <Text style={{ color: "#334155", fontSize: 10, fontWeight: "700", letterSpacing: 2, paddingHorizontal: 2 }}>
              AÇIK KOLTUКLAR ({openDuels.length})
            </Text>
            {openDuels.map(d => (
              <ArenaCard key={d.id} duel={d} userId={userId} myName={myDisplayName}
                onAccept={acceptDuel} onCancel={cancelDuel} />
            ))}
          </View>
        ) : (
          <View style={{
            borderRadius: 14, borderWidth: 1, borderColor: "#1e293b",
            borderStyle: "dashed", padding: 24, alignItems: "center", gap: 8,
            backgroundColor: "#07101f",
          }}>
            <Text style={{ fontSize: 32 }}>🏟️</Text>
            <Text style={{ color: "#475569", fontSize: 14, fontWeight: "700" }}>Arena boş</Text>
            <Text style={{ color: "#334155", fontSize: 12, textAlign: "center", lineHeight: 18 }}>
              Bu maç için henüz kimse koltuğa oturmadı.{"\n"}İlk meydan okumayı sen başlat!
            </Text>
          </View>
        )}

        {/* ── My active duels ── */}
        {myActive.length > 0 && (
          <View style={{ gap: 10 }}>
            <Text style={{ color: "#334155", fontSize: 10, fontWeight: "700", letterSpacing: 2, paddingHorizontal: 2 }}>
              AKTİF DUELLOLARlM ({myActive.length})
            </Text>
            {myActive.map(d => (
              <ArenaCard key={d.id} duel={d} userId={userId} myName={myDisplayName}
                onAccept={acceptDuel} onCancel={cancelDuel} />
            ))}
          </View>
        )}

        {/* ── Settled duels ── */}
        {mySettled.length > 0 && (
          <View style={{ gap: 10 }}>
            <Text style={{ color: "#334155", fontSize: 10, fontWeight: "700", letterSpacing: 2, paddingHorizontal: 2 }}>
              GEÇMİŞ DUELLOLAR
            </Text>
            {mySettled.map(d => (
              <ArenaCard key={d.id} duel={d} userId={userId} myName={myDisplayName}
                onAccept={acceptDuel} onCancel={cancelDuel} />
            ))}
          </View>
        )}

      </ScrollView>
    </View>
  );
}
