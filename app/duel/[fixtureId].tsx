import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, RefreshControl,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Colors from "../../constants/colors";
import { getApiBase, resetApiBase } from "../../lib/apiBase";
import { getAuthHeaders } from "../../lib/apiFetch";
import { useUserId } from "../../lib/useUserId";

// ─── Types ────────────────────────────────────────────────────────────────────

type DuelStatus = "open" | "active" | "settled" | "cancelled";
type Duel = {
  id: string;
  fixtureId: string;
  stake: number;
  pot: number;
  creatorId: string;
  challengedId: string | null;
  acceptorId: string | null;
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
function shortId(uid: string) { return String(uid || "").slice(-6); }

// ─── Component ────────────────────────────────────────────────────────────────

export default function DuelScreen() {
  const { fixtureId, home: qHome, away: qAway, league: qLeague, kickoffISO: qKickoff } =
    useLocalSearchParams<{ fixtureId?: string; home?: string; away?: string; league?: string; kickoffISO?: string }>();
  const router = useRouter();
  const userId = useUserId();

  const fx = String(fixtureId || "").trim();
  const matchHome = String(qHome || "").trim();
  const matchAway = String(qAway || "").trim();
  const matchLeague = String(qLeague || "").trim();
  const matchKickoff = String(qKickoff || "").trim();

  const [openDuels, setOpenDuels] = useState<Duel[]>([]);
  const [myDuels, setMyDuels] = useState<Duel[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Create duel form
  const [selectedStake, setSelectedStake] = useState(3);
  const [targetUser, setTargetUser] = useState("");
  const [creating, setCreating] = useState(false);

  // LC balance
  const [lcBalance, setLcBalance] = useState<number | null>(null);

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

  // ── Create duel ──────────────────────────────────────────────────────────

  async function createDuel() {
    if (!fx || !userId) return;
    const target = targetUser.trim();
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
          fixtureId: fx,
          stake: selectedStake,
          challengedId: target || null,
          home: matchHome || null,
          away: matchAway || null,
          league: matchLeague || null,
          kickoffISO: matchKickoff || null,
        }),
      });
      const j = await res.json();
      if (!j?.ok) {
        Alert.alert("Hata", j?.error === "LC_NOT_ENOUGH"
          ? `Yetersiz LC (bakiye: ${j.lc ?? "?"}, gereken: ${j.needed ?? selectedStake})`
          : j?.error || "Bilinmeyen hata");
        return;
      }
      Alert.alert("Meydan Okuma Gönderildi!", target
        ? `${target} kullanıcısına ${selectedStake} LC'lik meydan okuma gönderildi.`
        : `Herkese açık ${selectedStake} LC'lik meydan okuma yayınlandı.`);
      setTargetUser("");
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
    Alert.alert(
      "Meydan Okumayı Kabul Et",
      `${shortId(duel.creatorId)} kullanıcısının ${duel.stake} LC'lik meydan oklamasını kabul edeceksin. Kazanan ${duel.pot} LC alır.`,
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Kabul Et",
          onPress: async () => {
            try {
              const res = await apiFetch("/api/duels/accept", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ duelId: duel.id }),
              });
              const j = await res.json();
              if (!j?.ok) {
                Alert.alert("Hata", j?.error || "Kabul edilemedi");
                return;
              }
              Alert.alert("Kabul Edildi!", "Düello başladı. En yüksek puanı yapan kazanır!");
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
    Alert.alert("Meydan Okumayı Geri Çek", "Meydan okuma iptal edilecek, LC'n iade edilecek.", [
      { text: "Vazgeç", style: "cancel" },
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
            Alert.alert("İptal Edildi", `${duel.stake} LC iade edildi.`);
            loadAll();
          } catch (e: any) {
            Alert.alert("Hata", String(e?.message || e));
          }
        },
      },
    ]);
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function DuelCard({ duel, showAccept }: { duel: Duel; showAccept?: boolean }) {
    const isCreator = duel.creatorId.toLowerCase() === userId.toLowerCase();
    const isAcceptor = duel.acceptorId?.toLowerCase() === userId.toLowerCase();
    const myPoints = isCreator ? duel.creatorPoints : isAcceptor ? duel.acceptorPoints : null;
    const oppPoints = isCreator ? duel.acceptorPoints : isAcceptor ? duel.creatorPoints : null;
    const iWon = duel.winnerId?.toLowerCase() === userId.toLowerCase();
    const tied = duel.status === "settled" && !duel.winnerId;

    return (
      <View style={{
        borderRadius: 12, borderWidth: 1,
        borderColor: duel.status === "active" ? "#3b82f644" : duel.status === "settled" ? "#10b98144" : "#1e293b",
        backgroundColor: "#0f172a", padding: 12, gap: 8,
      }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: 18 }}>⚔️</Text>
            <View>
              <Text style={{ color: "#f1f5f9", fontWeight: "800", fontSize: 14 }}>
                {duel.stake} LC × 2 = {duel.pot} LC
              </Text>
              <Text style={{ color: "#64748b", fontSize: 10 }}>
                {duel.challengedId ? `→ ${shortId(duel.challengedId)} hedeflendi` : "Herkese açık"}
              </Text>
            </View>
          </View>
          <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: statusColor(duel.status) + "22" }}>
            <Text style={{ color: statusColor(duel.status), fontWeight: "700", fontSize: 11 }}>
              {statusLabel(duel.status)}
            </Text>
          </View>
        </View>

        {/* Players */}
        <View style={{ flexDirection: "row", gap: 6 }}>
          <PlayerChip
            uid={duel.creatorId}
            label={isCreator ? "Sen" : shortId(duel.creatorId)}
            points={duel.creatorPoints}
            isWinner={duel.winnerId === duel.creatorId}
            settled={duel.status === "settled"}
            tied={tied}
          />
          <View style={{ justifyContent: "center", alignItems: "center", width: 24 }}>
            <Text style={{ color: "#475569", fontWeight: "900", fontSize: 13 }}>VS</Text>
          </View>
          {duel.acceptorId ? (
            <PlayerChip
              uid={duel.acceptorId}
              label={isAcceptor ? "Sen" : shortId(duel.acceptorId)}
              points={duel.acceptorPoints}
              isWinner={duel.winnerId === duel.acceptorId}
              settled={duel.status === "settled"}
              tied={tied}
            />
          ) : (
            <View style={{ flex: 1, borderRadius: 8, borderWidth: 1, borderColor: "#1e293b", borderStyle: "dashed", alignItems: "center", justifyContent: "center", paddingVertical: 10 }}>
              <Text style={{ color: "#475569", fontSize: 11 }}>Rakip bekleniyor...</Text>
            </View>
          )}
        </View>

        {/* Settled result */}
        {duel.status === "settled" && (
          <View style={{
            borderRadius: 8, padding: 8,
            backgroundColor: tied ? "#1e293b" : iWon ? "#065f4622" : "#7f1d1d22",
            alignItems: "center",
          }}>
            <Text style={{
              fontWeight: "800", fontSize: 13,
              color: tied ? "#94a3b8" : iWon ? "#4ade80" : "#f87171",
            }}>
              {tied ? "🤝 Berabere — LC iade edildi" : iWon ? `🏆 Kazandın! +${duel.pot} LC` : `❌ Kaybettin — ${duel.stake} LC`}
            </Text>
          </View>
        )}

        {/* Actions */}
        {showAccept && duel.status === "open" && (
          <TouchableOpacity
            onPress={() => acceptDuel(duel)}
            style={{ borderRadius: 999, backgroundColor: "#3b82f6", paddingVertical: 9, alignItems: "center" }}
          >
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>⚔️ Kabul Et — {duel.stake} LC</Text>
          </TouchableOpacity>
        )}

        {isCreator && duel.status === "open" && (
          <TouchableOpacity
            onPress={() => cancelDuel(duel)}
            style={{ borderRadius: 999, borderWidth: 1, borderColor: "#ef4444", paddingVertical: 7, alignItems: "center" }}
          >
            <Text style={{ color: "#ef4444", fontWeight: "700", fontSize: 12 }}>Geri Çek — {duel.stake} LC iade</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  function PlayerChip({ uid, label, points, isWinner, settled, tied }: {
    uid: string; label: string; points: number | null;
    isWinner: boolean; settled: boolean; tied: boolean;
  }) {
    const borderColor = !settled ? "#1e293b" : tied ? "#475569" : isWinner ? "#4ade80" : "#ef4444";
    return (
      <View style={{
        flex: 1, borderRadius: 8, borderWidth: 1.5, borderColor,
        backgroundColor: "#0f172a", padding: 8, alignItems: "center", gap: 2,
      }}>
        <Text style={{ fontSize: 20 }}>{isWinner && settled && !tied ? "🏆" : "👤"}</Text>
        <Text style={{ color: "#e2e8f0", fontWeight: "700", fontSize: 12 }} numberOfLines={1}>{label}</Text>
        {settled && points != null && (
          <Text style={{ color: isWinner && !tied ? "#4ade80" : "#94a3b8", fontSize: 11, fontWeight: "700" }}>
            {Math.round(points * 10) / 10} puan
          </Text>
        )}
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const myActiveDuels = myDuels.filter(d => d.status === "open" || d.status === "active");
  const mySettled = myDuels.filter(d => d.status === "settled" || d.status === "cancelled");

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={{ padding: 16, gap: 14 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(); }} />}
    >
      {/* Match header */}
      {(matchHome || matchAway) && (
        <View style={{ borderRadius: 14, backgroundColor: "#0f172a", borderWidth: 1, borderColor: "#1e3a5f", padding: 14, alignItems: "center", gap: 4 }}>
          {matchLeague && <Text style={{ color: "#94a3b8", fontSize: 10, fontWeight: "700", letterSpacing: 1 }}>{matchLeague}</Text>}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 }}>
            <Text style={{ color: "#f1f5f9", fontWeight: "800", fontSize: 15, flex: 1, textAlign: "right" }} numberOfLines={1}>{matchHome}</Text>
            <Text style={{ color: "#64748b", fontWeight: "900", fontSize: 12 }}>VS</Text>
            <Text style={{ color: "#f1f5f9", fontWeight: "800", fontSize: 15, flex: 1, textAlign: "left" }} numberOfLines={1}>{matchAway}</Text>
          </View>
          <Text style={{ color: "#fbbf24", fontWeight: "700", fontSize: 11, marginTop: 4 }}>⚔️ DUELLO MODU</Text>
        </View>
      )}

      {/* LC balance strip */}
      {lcBalance !== null && (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#fef9c3", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 }}>
          <Text style={{ color: "#92400e", fontWeight: "700", fontSize: 13 }}>🪙 LC Bakiyen</Text>
          <Text style={{ color: "#78350f", fontWeight: "900", fontSize: 16 }}>{lcBalance} LC</Text>
        </View>
      )}

      {/* ── CREATE NEW DUEL ── */}
      <View style={{ borderRadius: 14, backgroundColor: "#0f172a", borderWidth: 1, borderColor: "#1e3a5f", padding: 14, gap: 10 }}>
        <Text style={{ color: "#f1f5f9", fontWeight: "800", fontSize: 15 }}>⚔️ Meydan Oku</Text>

        {/* Stake picker */}
        <View>
          <Text style={{ color: "#94a3b8", fontSize: 11, marginBottom: 6 }}>Bahis (LC)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {STAKES.map(s => (
              <TouchableOpacity
                key={s}
                onPress={() => setSelectedStake(s)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
                  borderWidth: 2,
                  borderColor: selectedStake === s ? "#f59e0b" : "#1e293b",
                  backgroundColor: selectedStake === s ? "#f59e0b22" : "#0f172a",
                }}
              >
                <Text style={{ color: selectedStake === s ? "#f59e0b" : "#64748b", fontWeight: "800", fontSize: 13 }}>
                  {s} LC
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Pot info */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", backgroundColor: "#1e293b", borderRadius: 8, padding: 10 }}>
          <Text style={{ color: "#64748b", fontSize: 12 }}>Sen yatırırsın</Text>
          <Text style={{ color: "#f1f5f9", fontWeight: "700" }}>{selectedStake} LC</Text>
          <Text style={{ color: "#64748b", fontSize: 12 }}>Kazanan alır</Text>
          <Text style={{ color: "#4ade80", fontWeight: "800" }}>{selectedStake * 2} LC</Text>
        </View>

        {/* Optional target */}
        <View>
          <Text style={{ color: "#94a3b8", fontSize: 11, marginBottom: 6 }}>Belirli kişiye meydan oku (isteğe bağlı)</Text>
          <TextInput
            value={targetUser}
            onChangeText={setTargetUser}
            placeholder="Kullanıcı ID'si (boş = herkese açık)"
            placeholderTextColor="#475569"
            autoCapitalize="none"
            style={{
              borderWidth: 1, borderColor: "#1e293b", borderRadius: 8,
              paddingHorizontal: 10, paddingVertical: 8,
              color: "#e2e8f0", fontSize: 13, backgroundColor: "#1e293b",
            }}
          />
        </View>

        <TouchableOpacity
          onPress={createDuel}
          disabled={creating || (lcBalance !== null && lcBalance < selectedStake)}
          style={{
            borderRadius: 999, paddingVertical: 12, alignItems: "center",
            backgroundColor: (creating || (lcBalance !== null && lcBalance < selectedStake)) ? "#1e293b" : "#f59e0b",
          }}
        >
          {creating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{
              fontWeight: "900", fontSize: 14,
              color: (lcBalance !== null && lcBalance < selectedStake) ? "#475569" : "#0f172a",
            }}>
              {lcBalance !== null && lcBalance < selectedStake
                ? `Yetersiz LC (${lcBalance}/${selectedStake})`
                : `⚔️ ${selectedStake} LC ile Meydan Oku`}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* ── OPEN DUELS (kabul edilebilir) ── */}
      {loading ? (
        <ActivityIndicator color={Colors.accent} style={{ marginTop: 16 }} />
      ) : openDuels.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: "#94a3b8", fontSize: 11, fontWeight: "700", letterSpacing: 1 }}>AÇIK MEYDAN OKUMALAR ({openDuels.length})</Text>
          {openDuels.map(d => <DuelCard key={d.id} duel={d} showAccept />)}
        </View>
      ) : (
        <View style={{ borderRadius: 10, borderWidth: 1, borderColor: "#1e293b", padding: 14, alignItems: "center" }}>
          <Text style={{ color: "#475569", fontSize: 13 }}>Bu maç için açık meydan okuma yok.</Text>
          <Text style={{ color: "#334155", fontSize: 11, marginTop: 4 }}>İlk meydan okuyan sen ol!</Text>
        </View>
      )}

      {/* ── MY ACTIVE DUELS ── */}
      {myActiveDuels.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={{ color: "#94a3b8", fontSize: 11, fontWeight: "700", letterSpacing: 1 }}>AKTİF DUELLOLARlM ({myActiveDuels.length})</Text>
          {myActiveDuels.map(d => <DuelCard key={d.id} duel={d} />)}
        </View>
      )}

      {/* ── MY SETTLED DUELS ── */}
      {mySettled.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={{ color: "#94a3b8", fontSize: 11, fontWeight: "700", letterSpacing: 1 }}>GEÇMİŞ DUELLOLAR</Text>
          {mySettled.map(d => <DuelCard key={d.id} duel={d} />)}
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
