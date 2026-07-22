import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, Animated,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
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

// ─── apiFetch ─────────────────────────────────────────────────────────────────

async function apiFetch(path: string, init?: RequestInit, _retried = false): Promise<Response> {
  const base = await getApiBase();
  const authH = await getAuthHeaders();
  const p = path.startsWith("/") ? path : `/${path}`;
  try {
    return await fetch(`${base}${p}`, { ...init, headers: { ...authH, ...(init?.headers as any) } });
  } catch (e) {
    if (!_retried) { resetApiBase(); return apiFetch(path, init, true); }
    throw e;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STAKES = [1, 2, 3, 5, 8, 10, 12];

function statusLabel(s: DuelStatus) {
  return s === "open" ? "Bekliyor" : s === "active" ? "Aktif" : s === "settled" ? "Bitti" : "İptal";
}
function statusColor(s: DuelStatus) {
  return s === "open" ? "#f59e0b" : s === "active" ? "#3b82f6" : s === "settled" ? "#10b981" : "#64748b";
}
function shortId(uid: string) { return String(uid || "").slice(-4).toUpperCase(); }

function playerAvatar(name: string | null, uid: string): string {
  if (!name) return "👤";
  const first = name.trim().charAt(0).toUpperCase();
  const emojis: Record<string, string> = {
    A: "🦊", B: "🐻", C: "🐱", D: "🐶", E: "🦅",
    F: "🦊", G: "🐊", H: "🦁", I: "🦋", J: "🐬",
    K: "🦀", L: "🐆", M: "🦉", N: "🐢", O: "🦜",
    P: "🐧", R: "🦝", S: "🐺", T: "🐯", U: "🦄",
    V: "🦈", Y: "🦚", Z: "🦓",
  };
  return emojis[first] || "⚡";
}

function playerInitials(name: string | null, uid: string): string {
  if (name) return name.trim().slice(0, 2).toUpperCase();
  return shortId(uid);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DuelScreen() {
  const { fixtureId, home: qHome, away: qAway, league: qLeague, kickoffISO: qKickoff } =
    useLocalSearchParams<{ fixtureId?: string; home?: string; away?: string; league?: string; kickoffISO?: string }>();
  const router = useRouter();
  const userId = useUserId();
  const myDisplayName = auth.currentUser?.displayName || null;

  const fx = String(fixtureId || "").trim();
  const matchHome = String(qHome || "").trim();
  const matchAway = String(qAway || "").trim();
  const matchLeague = String(qLeague || "").trim();
  const matchKickoff = String(qKickoff || "").trim();

  const [openDuels, setOpenDuels] = useState<Duel[]>([]);
  const [myDuels, setMyDuels] = useState<Duel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStake, setSelectedStake] = useState(3);
  const [creating, setCreating] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [howOpen, setHowOpen] = useState(false);
  const [lcBalance, setLcBalance] = useState<number | null>(null);

  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    if (successTimer.current) clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setSuccessMsg(null), 3500);
  }

  async function loadBalance(uid: string) {
    try {
      const res = await apiFetch(`/api/rt/lc-wallet/summary?userId=${encodeURIComponent(uid)}`);
      const j = await res.json();
      if (j?.ok && j.user) setLcBalance(Number(j.user.balance ?? 0));
    } catch {}
  }

  const loadAll = useCallback(async () => {
    if (!fx || !userId) return;
    setLoading(true);
    try {
      const [openRes, myRes] = await Promise.all([
        apiFetch(`/api/duels/open?fixtureId=${encodeURIComponent(fx)}&userId=${encodeURIComponent(userId)}`),
        apiFetch(`/api/duels/my?userId=${encodeURIComponent(userId)}&fixtureId=${encodeURIComponent(fx)}`),
      ]);
      const [openJ, myJ] = await Promise.all([openRes.json(), myRes.json()]);
      if (openJ?.ok) setOpenDuels(openJ.items || []);
      if (myJ?.ok) setMyDuels(myJ.items || []);
      loadBalance(userId);
    } catch (e: any) {
      Alert.alert("Hata", String(e?.message || e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fx, userId]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => () => { if (successTimer.current) clearTimeout(successTimer.current); }, []);

  // ── Create duel ──────────────────────────────────────────────────────────

  async function createDuel() {
    if (!fx || !userId) return;
    if (lcBalance !== null && lcBalance < selectedStake) {
      Alert.alert("Yetersiz LC", `Meydan okumak için ${selectedStake} LC gerekiyor. Bakiyen: ${lcBalance} LC`);
      return;
    }
    try {
      setCreating(true);
      const res = await apiFetch("/api/duels/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fixtureId: fx, stake: selectedStake,
          creatorName: myDisplayName,
          home: matchHome || null, away: matchAway || null,
          league: matchLeague || null, kickoffISO: matchKickoff || null,
        }),
      });
      const j = await res.json();
      if (!j?.ok) {
        Alert.alert("Hata", j?.error === "LC_NOT_ENOUGH"
          ? `Yetersiz LC (bakiye: ${j.lc ?? "?"}, gereken: ${j.needed ?? selectedStake})`
          : j?.error || "Bilinmeyen hata");
        return;
      }
      showSuccess(`⚔️ ${selectedStake} LC'lik meydan okuma yayınlandı!`);
      loadAll();
    } catch (e: any) {
      Alert.alert("Hata", String(e?.message || e));
    } finally {
      setCreating(false);
    }
  }

  // ── Accept duel ──────────────────────────────────────────────────────────

  async function acceptDuel(duel: Duel) {
    if (lcBalance !== null && lcBalance < duel.stake) {
      Alert.alert("Yetersiz LC", `Bu düelloyu kabul etmek için ${duel.stake} LC gerekiyor.`);
      return;
    }
    const name = duel.creatorName || shortId(duel.creatorId);
    Alert.alert(
      "Meydan Okumayı Kabul Et",
      `${name} kullanıcısının ${duel.stake} LC'lik meydan okumasını kabul edeceksin.\n\nKazanan ${duel.pot} LC alır. Hazır mısın?`,
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "⚔️ Kabul Et",
          onPress: async () => {
            try {
              const res = await apiFetch("/api/duels/accept", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ duelId: duel.id, acceptorName: myDisplayName }),
              });
              const j = await res.json();
              if (!j?.ok) { Alert.alert("Hata", j?.error || "Kabul edilemedi"); return; }
              showSuccess("Düello başladı! En yüksek puanı yapan kazanır 🏆");
              loadAll();
            } catch (e: any) {
              Alert.alert("Hata", String(e?.message || e));
            }
          },
        },
      ]
    );
  }

  // ── Cancel duel ──────────────────────────────────────────────────────────

  async function cancelDuel(duel: Duel) {
    Alert.alert("Meydan Okumayı Geri Çek", `${duel.stake} LC iade edilecek.`, [
      { text: "Dur, kalsın", style: "cancel" },
      {
        text: "İptal Et", style: "destructive",
        onPress: async () => {
          try {
            const res = await apiFetch("/api/duels/cancel", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ duelId: duel.id }),
            });
            const j = await res.json();
            if (!j?.ok) { Alert.alert("Hata", j?.error || "İptal edilemedi"); return; }
            showSuccess(`Meydan okuma iptal edildi. ${duel.stake} LC iade edildi.`);
            loadAll();
          } catch (e: any) {
            Alert.alert("Hata", String(e?.message || e));
          }
        },
      },
    ]);
  }

  // ── Sub-components ────────────────────────────────────────────────────────

  function PlayerChip({ uid, name, points, isWinner, settled, tied, pending }: {
    uid: string; name: string | null; points: number | null;
    isWinner: boolean; settled: boolean; tied: boolean; pending?: boolean;
  }) {
    const borderColor = !settled ? (pending ? "#1e293b" : "#334155")
      : tied ? "#475569" : isWinner ? "#4ade80" : "#ef444488";
    const bg = !settled ? "#0f172a"
      : tied ? "#1e293b" : isWinner ? "#052e1688" : "#1a0a0a";
    const displayName = name || shortId(uid);

    return (
      <View style={{
        flex: 1, borderRadius: 10, borderWidth: 1.5, borderColor, backgroundColor: bg,
        padding: 10, alignItems: "center", gap: 4,
      }}>
        {pending ? (
          <>
            <Text style={{ fontSize: 22, opacity: 0.3 }}>❓</Text>
            <Text style={{ color: "#334155", fontSize: 11, fontStyle: "italic" }}>Bekleniyor</Text>
          </>
        ) : (
          <>
            <Text style={{ fontSize: 22 }}>
              {settled && !tied && isWinner ? "🏆" : playerAvatar(name, uid)}
            </Text>
            <Text style={{ color: "#e2e8f0", fontWeight: "700", fontSize: 12 }} numberOfLines={1}>
              {displayName}
            </Text>
            {settled && points != null && (
              <Text style={{ color: isWinner && !tied ? "#4ade80" : "#64748b", fontSize: 11, fontWeight: "800" }}>
                {Math.round(points * 10) / 10} puan
              </Text>
            )}
          </>
        )}
      </View>
    );
  }

  function DuelCard({ duel, showAccept }: { duel: Duel; showAccept?: boolean }) {
    const isCreator = duel.creatorId.toLowerCase() === userId.toLowerCase();
    const isAcceptor = duel.acceptorId?.toLowerCase() === userId.toLowerCase();
    const iWon = duel.winnerId?.toLowerCase() === userId.toLowerCase();
    const tied = duel.status === "settled" && !duel.winnerId;
    const sc = statusColor(duel.status);
    const borderCol = duel.status === "active" ? "#3b82f633"
      : duel.status === "settled" ? (iWon ? "#10b98133" : tied ? "#47556933" : "#ef444422")
      : "#1e293b";

    return (
      <View style={{
        borderRadius: 14, borderWidth: 1, borderColor: borderCol,
        backgroundColor: "#0a0f1e", padding: 14, gap: 10,
      }}>
        {/* Header row */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: sc + "22", alignItems: "center", justifyContent: "center",
            }}>
              <Text style={{ fontSize: 18 }}>⚔️</Text>
            </View>
            <View>
              <Text style={{ color: "#f1f5f9", fontWeight: "800", fontSize: 15 }}>
                {duel.stake} <Text style={{ color: "#fbbf24" }}>LC</Text>
                <Text style={{ color: "#475569" }}> × 2 = </Text>
                <Text style={{ color: "#4ade80" }}>{duel.pot} LC</Text>
              </Text>
              <Text style={{ color: "#475569", fontSize: 10, marginTop: 1 }}>
                {duel.challengedId
                  ? `Kişiye özel meydan okuma`
                  : duel.status === "open" ? "Herkese açık"
                  : duel.status === "active" ? "Düello sürüyor"
                  : ""}
              </Text>
            </View>
          </View>
          <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: sc + "22" }}>
            <Text style={{ color: sc, fontWeight: "700", fontSize: 11 }}>{statusLabel(duel.status)}</Text>
          </View>
        </View>

        {/* VS layout */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <PlayerChip
            uid={duel.creatorId}
            name={isCreator ? (myDisplayName || duel.creatorName) : duel.creatorName}
            points={duel.creatorPoints}
            isWinner={duel.winnerId === duel.creatorId}
            settled={duel.status === "settled"}
            tied={tied}
          />
          <View style={{ alignItems: "center", gap: 2 }}>
            <Text style={{ color: "#1e293b", fontWeight: "900", fontSize: 16 }}>VS</Text>
            {duel.status === "active" && (
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#3b82f6" }} />
            )}
          </View>
          {duel.acceptorId ? (
            <PlayerChip
              uid={duel.acceptorId}
              name={isAcceptor ? (myDisplayName || duel.acceptorName) : duel.acceptorName}
              points={duel.acceptorPoints}
              isWinner={duel.winnerId === duel.acceptorId}
              settled={duel.status === "settled"}
              tied={tied}
            />
          ) : (
            <PlayerChip uid="" name={null} points={null} isWinner={false} settled={false} tied={false} pending />
          )}
        </View>

        {/* Settled result banner */}
        {duel.status === "settled" && (
          <View style={{
            borderRadius: 10, padding: 10, alignItems: "center",
            backgroundColor: tied ? "#1e293b" : iWon ? "#052e1688" : "#1a0a0a",
          }}>
            <Text style={{
              fontWeight: "800", fontSize: 14,
              color: tied ? "#94a3b8" : iWon ? "#4ade80" : "#f87171",
            }}>
              {tied ? "🤝 Berabere — LC'ler iade edildi"
                : iWon ? `🏆 Kazandın! +${duel.pot} LC bakiyene eklendi`
                : `Düelloyu kaybettin — ${duel.stake} LC`}
            </Text>
          </View>
        )}

        {/* Action buttons */}
        {showAccept && duel.status === "open" && (
          <TouchableOpacity
            onPress={() => acceptDuel(duel)}
            style={{
              borderRadius: 999, paddingVertical: 11, alignItems: "center",
              backgroundColor: "#3b82f6",
              flexDirection: "row", justifyContent: "center", gap: 6,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>
              ⚔️ Kabul Et  —  {duel.stake} LC yatır, {duel.pot} LC kazan
            </Text>
          </TouchableOpacity>
        )}

        {isCreator && duel.status === "open" && (
          <TouchableOpacity
            onPress={() => cancelDuel(duel)}
            style={{ borderRadius: 999, borderWidth: 1, borderColor: "#ef444455", paddingVertical: 8, alignItems: "center" }}
          >
            <Text style={{ color: "#ef4444", fontSize: 12 }}>Geri Çek — {duel.stake} LC iade edilir</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const myActive = myDuels.filter(d => d.status === "open" || d.status === "active");
  const mySettled = myDuels.filter(d => d.status === "settled" || d.status === "cancelled");
  const canAfford = lcBalance === null || lcBalance >= selectedStake;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(); }} />}
    >
      {/* Match header */}
      <View style={{
        borderRadius: 16, backgroundColor: "#0a0f1e",
        borderWidth: 1, borderColor: "#1e3a5f", padding: 16,
      }}>
        {matchLeague ? (
          <Text style={{ color: "#475569", fontSize: 10, fontWeight: "700", letterSpacing: 1.2, textAlign: "center" }}>
            {matchLeague.toUpperCase()}
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <Text style={{ color: "#f1f5f9", fontWeight: "800", fontSize: 15, flex: 1, textAlign: "right" }} numberOfLines={1}>
            {matchHome}
          </Text>
          <View style={{ paddingHorizontal: 12, alignItems: "center" }}>
            <Text style={{ color: "#fbbf24", fontSize: 18 }}>⚔️</Text>
            <Text style={{ color: "#334155", fontSize: 9, fontWeight: "700", marginTop: 2 }}>DUELLO</Text>
          </View>
          <Text style={{ color: "#f1f5f9", fontWeight: "800", fontSize: 15, flex: 1, textAlign: "left" }} numberOfLines={1}>
            {matchAway}
          </Text>
        </View>
        {lcBalance !== null && (
          <View style={{
            marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "center",
            gap: 6, backgroundColor: "#fef9c311", borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14,
          }}>
            <Text style={{ color: "#fbbf24", fontSize: 13 }}>🪙</Text>
            <Text style={{ color: "#fbbf24", fontWeight: "700", fontSize: 13 }}>{lcBalance} LC bakiyen var</Text>
          </View>
        )}
      </View>

      {/* Inline success message */}
      {successMsg && (
        <View style={{
          borderRadius: 10, backgroundColor: "#052e1699", borderWidth: 1,
          borderColor: "#10b98155", padding: 12, alignItems: "center",
        }}>
          <Text style={{ color: "#4ade80", fontWeight: "700", fontSize: 13 }}>{successMsg}</Text>
        </View>
      )}

      {/* How it works */}
      <TouchableOpacity
        onPress={() => setHowOpen(v => !v)}
        style={{
          borderRadius: 10, borderWidth: 1, borderColor: "#1e293b",
          backgroundColor: "#0a0f1e", padding: 12,
          flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        }}
      >
        <Text style={{ color: "#94a3b8", fontWeight: "700", fontSize: 12 }}>💡 Duello nasıl çalışır?</Text>
        <Text style={{ color: "#475569", fontSize: 14 }}>{howOpen ? "▲" : "▼"}</Text>
      </TouchableOpacity>
      {howOpen && (
        <View style={{
          borderRadius: 10, borderWidth: 1, borderColor: "#1e293b55",
          backgroundColor: "#0a0f1e", padding: 14, gap: 8,
        }}>
          {[
            ["⚔️", "Meydan oku", "LC yatır, herkese açık bir düello başlat."],
            ["🤝", "Rakip kabul eder", "Bir başka oyuncu aynı miktarı yatırır, düello başlar."],
            ["⚽", "Tahmin yap", "Her iki oyuncu da bu maç için tahmin yapar."],
            ["🏆", "Maç biter", "Daha yüksek puanı yapan tüm pot'u alır. Beraberse LC'ler iade edilir."],
          ].map(([icon, title, desc]) => (
            <View key={title} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
              <Text style={{ fontSize: 18, width: 26 }}>{icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#e2e8f0", fontWeight: "700", fontSize: 12 }}>{title}</Text>
                <Text style={{ color: "#64748b", fontSize: 11, marginTop: 1 }}>{desc}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ── CREATE DUEL ── */}
      <View style={{
        borderRadius: 16, backgroundColor: "#0a0f1e",
        borderWidth: 1, borderColor: "#1e3a5f", padding: 16, gap: 12,
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ fontSize: 20 }}>⚔️</Text>
          <Text style={{ color: "#f1f5f9", fontWeight: "800", fontSize: 16 }}>Meydan Oku</Text>
        </View>

        {/* Stake picker */}
        <View>
          <Text style={{ color: "#475569", fontSize: 11, marginBottom: 8, fontWeight: "600" }}>BAHIS MİKTARI</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {STAKES.map(s => {
              const active = selectedStake === s;
              const affordable = lcBalance === null || lcBalance >= s;
              return (
                <TouchableOpacity
                  key={s}
                  onPress={() => setSelectedStake(s)}
                  style={{
                    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999,
                    borderWidth: 2,
                    borderColor: active ? "#f59e0b" : affordable ? "#1e293b" : "#1e293b44",
                    backgroundColor: active ? "#f59e0b22" : "transparent",
                    opacity: affordable ? 1 : 0.4,
                  }}
                >
                  <Text style={{
                    color: active ? "#f59e0b" : affordable ? "#94a3b8" : "#334155",
                    fontWeight: "800", fontSize: 14,
                  }}>
                    {s} LC
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Win/lose summary */}
        <View style={{
          borderRadius: 12, backgroundColor: "#0f172a",
          flexDirection: "row", overflow: "hidden",
        }}>
          <View style={{ flex: 1, padding: 12, alignItems: "center", gap: 2 }}>
            <Text style={{ color: "#475569", fontSize: 10, fontWeight: "600" }}>YATIRIRSIN</Text>
            <Text style={{ color: "#f59e0b", fontWeight: "900", fontSize: 18 }}>{selectedStake} LC</Text>
          </View>
          <View style={{ width: 1, backgroundColor: "#1e293b" }} />
          <View style={{ flex: 1, padding: 12, alignItems: "center", gap: 2 }}>
            <Text style={{ color: "#475569", fontSize: 10, fontWeight: "600" }}>KAZANIRSAN</Text>
            <Text style={{ color: "#4ade80", fontWeight: "900", fontSize: 18 }}>{selectedStake * 2} LC</Text>
          </View>
        </View>

        {/* Create button */}
        <TouchableOpacity
          onPress={createDuel}
          disabled={creating || !canAfford}
          activeOpacity={0.8}
          style={{
            borderRadius: 999, paddingVertical: 14, alignItems: "center",
            backgroundColor: !canAfford ? "#1e293b" : creating ? "#b45309" : "#f59e0b",
          }}
        >
          {creating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{
              fontWeight: "900", fontSize: 15,
              color: !canAfford ? "#475569" : "#0f172a",
            }}>
              {!canAfford
                ? `Yetersiz LC (${lcBalance}/${selectedStake})`
                : `⚔️  ${selectedStake} LC ile Meydan Oku`}
            </Text>
          )}
        </TouchableOpacity>

        {canAfford && !creating && (
          <Text style={{ color: "#334155", fontSize: 11, textAlign: "center" }}>
            Herkese açık yayınlanır — ilk kabul eden rakibin olur
          </Text>
        )}
      </View>

      {/* ── OPEN DUELS ── */}
      {loading ? (
        <View style={{ paddingVertical: 24, alignItems: "center" }}>
          <ActivityIndicator color={Colors.accent} />
          <Text style={{ color: "#334155", marginTop: 8, fontSize: 12 }}>Duellolar yükleniyor...</Text>
        </View>
      ) : openDuels.length > 0 ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: "#475569", fontSize: 10, fontWeight: "700", letterSpacing: 1.5 }}>
            AÇIK MEYDAN OKUMALAR ({openDuels.length})
          </Text>
          {openDuels.map(d => <DuelCard key={d.id} duel={d} showAccept />)}
        </View>
      ) : (
        <View style={{
          borderRadius: 14, borderWidth: 1, borderColor: "#1e293b",
          borderStyle: "dashed", padding: 20, alignItems: "center", gap: 6,
        }}>
          <Text style={{ fontSize: 28 }}>🏟️</Text>
          <Text style={{ color: "#64748b", fontSize: 13, fontWeight: "600" }}>Açık meydan okuma yok</Text>
          <Text style={{ color: "#334155", fontSize: 11, textAlign: "center" }}>
            Bu maç için henüz kimse meydan okumadı. İlk sen başlat!
          </Text>
        </View>
      )}

      {/* ── MY ACTIVE DUELS ── */}
      {myActive.length > 0 && (
        <View style={{ gap: 10 }}>
          <Text style={{ color: "#475569", fontSize: 10, fontWeight: "700", letterSpacing: 1.5 }}>
            AKTİF DUELLOLARlM ({myActive.length})
          </Text>
          {myActive.map(d => <DuelCard key={d.id} duel={d} />)}
        </View>
      )}

      {/* ── MY SETTLED DUELS ── */}
      {mySettled.length > 0 && (
        <View style={{ gap: 10 }}>
          <Text style={{ color: "#475569", fontSize: 10, fontWeight: "700", letterSpacing: 1.5 }}>
            GEÇMİŞ DUELLOLAR
          </Text>
          {mySettled.map(d => <DuelCard key={d.id} duel={d} />)}
        </View>
      )}
    </ScrollView>
  );
}
