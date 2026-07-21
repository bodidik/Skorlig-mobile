import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import Colors from "../../constants/colors";
import { getApiBase } from "../../lib/apiBase";
import { getAuthHeaders } from "../../lib/apiFetch";

async function apiFetch(path: string, init?: RequestInit) {
  const base = await getApiBase();
  const authH = await getAuthHeaders();
  const p = path.startsWith("/") ? path : `/${path}`;
  return fetch(`${base}${p}`, { ...init, headers: { ...authH, ...(init?.headers as any) } });
}

type BoardRow = { userId: string; points: number; settledMatches: number; rank?: number };
type FxView = {
  fixtureId: string;
  home?: string | null;
  away?: string | null;
  kickoffISO?: string | null;
  league?: string | null;
  status?: string | null;
  score?: { home: number; away: number } | null;
  settled?: boolean;
};
type BoardResp = {
  ok: boolean;
  tournament?: {
    id: string;
    code: string;
    name: string;
    ownerId: string;
    memberCount: number;
    members?: string[];
    finishedAt?: string | null;
    winners?: string[] | null;
    rewardLc?: number | null;
  };
  fixtures?: FxView[];
  board?: BoardRow[];       // top 50
  totalMembers?: number;
  myRank?: number | null;
  myRow?: BoardRow | null;
  friendsInBoard?: BoardRow[];
  settledCount?: number;
  pendingCount?: number;
  error?: string;
};

type FriendRow = { userId: string; name?: string | null; flag?: string | null };

export default function MiniBoardScreen() {
  const router = useRouter();
  const { id: qId, userId: qUserId } = useLocalSearchParams<{ id?: string; userId?: string }>();
  const id = String(qId || "").trim();
  const userId = String(qUserId || "demo1").trim();

  const [data, setData] = useState<BoardResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [inviting, setInviting] = useState<string | null>(null);
  const [boardTab, setBoardTab] = useState<"top50" | "friends">("top50");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await apiFetch(`/api/mini/board?id=${encodeURIComponent(id)}&userId=${encodeURIComponent(userId)}`).then((x) => x.json());
      setData(r);
    } catch (e: any) {
      setData({ ok: false, error: String(e?.message || e) });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Arkadaş listesi (davet için)
  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch(`/api/friends/list/${encodeURIComponent(userId)}`).then((x) => x.json());
        setFriends(r?.ok && Array.isArray(r.friends) ? r.friends : []);
      } catch {
        setFriends([]);
      }
    })();
  }, [userId]);

  async function invite(friendUserId: string) {
    try {
      setInviting(friendUserId);
      const r = await apiFetch(`/api/mini/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, id, friendUserId }),
      }).then((x) => x.json());
      if (r?.ok) {
        Alert.alert("SkorLig", r.already ? "Zaten turnuvada." : `${friendUserId} turnuvaya eklendi! 🎉`);
        load();
      } else {
        const msg =
          r?.error === "NOT_FRIENDS"
            ? "Bu kullanıcı arkadaş listende değil."
            : r?.error === "TOURNAMENT_FULL"
            ? "Turnuva dolu."
            : r?.error || "Davet başarısız.";
        Alert.alert("SkorLig", msg);
      }
    } catch (e: any) {
      Alert.alert("Hata", String(e?.message || e));
    } finally {
      setInviting(null);
    }
  }

  async function copyCode() {
    const code = data?.tournament?.code;
    if (!code) return;
    await Clipboard.setStringAsync(code);
    Alert.alert("SkorLig", `Kod kopyalandı: ${code}\nArkadaşlarına gönder!`);
  }

  const t = data?.tournament;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 4 }}>
        <Text style={{ color: Colors.muted, fontSize: 12 }}>← Geri</Text>
      </TouchableOpacity>

      {loading && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <ActivityIndicator size="small" />
          <Text style={{ color: Colors.muted }}>Yükleniyor...</Text>
        </View>
      )}

      {!loading && !data?.ok && (
        <Text style={{ color: "#f97316" }}>Turnuva yüklenemedi: {data?.error || "?"}</Text>
      )}

      {!loading && data?.ok && t && (
        <>
          <Text style={{ fontSize: 20, fontWeight: "800", color: Colors.slate900 }}>{t.name}</Text>

          {/* Kazanan pankartı */}
          {t.finishedAt && (
            <View
              style={{
                padding: 14,
                borderRadius: 12,
                borderWidth: 2,
                borderColor: "#fbbf24",
                backgroundColor: "#fffbeb",
                alignItems: "center",
                gap: 4,
              }}
            >
              {(t.winners || []).length > 0 ? (
                <>
                  <Text style={{ fontSize: 24 }}>🏆</Text>
                  <Text style={{ fontWeight: "900", color: "#92400e", fontSize: 16, textAlign: "center" }}>
                    {(t.winners || []).length > 1 ? "Ortak Şampiyonlar: " : "Şampiyon: "}
                    {(t.winners || []).join(", ")}
                  </Text>
                  {!!t.rewardLc && (
                    <Text style={{ color: "#b45309", fontSize: 12, fontWeight: "700" }}>
                      Ödül: +{t.rewardLc} LC 💰
                    </Text>
                  )}
                </>
              ) : (
                <Text style={{ color: "#92400e", fontSize: 13, fontWeight: "600" }}>
                  Turnuva bitti — kimse puan alamadığı için şampiyon yok.
                </Text>
              )}
              <Text style={{ color: "#b45309", fontSize: 10 }}>
                Bitiş: {String(t.finishedAt).slice(0, 16).replace("T", " ")}
              </Text>
            </View>
          )}

          {/* Kod kartı */}
          <TouchableOpacity
            onPress={copyCode}
            style={{
              padding: 12,
              backgroundColor: "#020617",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: Colors.border,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <View>
              <Text style={{ color: Colors.muted, fontSize: 11 }}>Katılım kodu (dokun, kopyala)</Text>
              <Text style={{ color: "#a5b4fc", fontSize: 22, fontWeight: "900", letterSpacing: 4 }}>{t.code}</Text>
            </View>
            <Text style={{ color: Colors.muted, fontSize: 11 }}>
              {t.memberCount} katılımcı{"\n"}
              {data.settledCount}/{(data.fixtures || []).length} maç bitti
            </Text>
          </TouchableOpacity>

          {/* Arkadaş davet */}
          {(() => {
            if (t.finishedAt) return null; // biten turnuvaya davet olmaz
            const memberSet = new Set((t.members || []).map((m) => m.toLowerCase()));
            const invitable = friends.filter((f) => !memberSet.has(String(f.userId).toLowerCase()));
            if (!invitable.length) return null;
            return (
              <View
                style={{
                  padding: 12,
                  backgroundColor: "#fff",
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: Colors.border,
                  gap: 8,
                }}
              >
                <Text style={{ fontWeight: "700" }}>Arkadaşlarını Davet Et</Text>
                <Text style={{ color: Colors.muted, fontSize: 11 }}>
                  Arkadaşın koda gerek kalmadan doğrudan turnuvaya eklenir.
                </Text>
                {invitable.map((f) => (
                  <View
                    key={f.userId}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingVertical: 4,
                    }}
                  >
                    <Text style={{ color: Colors.slate900, fontWeight: "600", flex: 1 }} numberOfLines={1}>
                      {f.flag ? `${f.flag} ` : ""}
                      {f.name || f.userId}
                    </Text>
                    <TouchableOpacity
                      disabled={inviting === f.userId}
                      onPress={() => invite(f.userId)}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 6,
                        borderRadius: 999,
                        backgroundColor: inviting === f.userId ? Colors.border : Colors.live,
                      }}
                    >
                      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>
                        {inviting === f.userId ? "..." : "Davet Et"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            );
          })()}

          {/* Benim sıram */}
          {data.myRow && (
            <View style={{ borderRadius: 12, borderWidth: 2, borderColor: Colors.accent, backgroundColor: "#0f172a", padding: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.accent + "33", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: Colors.accent, fontWeight: "900", fontSize: 16 }}>
                  {data.myRank === 1 ? "🥇" : data.myRank === 2 ? "🥈" : data.myRank === 3 ? "🥉" : `#${data.myRank}`}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>Benim Sıram</Text>
                <Text style={{ color: Colors.muted, fontSize: 11 }}>
                  {data.totalMembers} katılımcı arasında {data.myRank}. sıra
                </Text>
              </View>
              <Text style={{ color: "#a3e635", fontWeight: "900", fontSize: 18 }}>{data.myRow.points} p</Text>
            </View>
          )}

          {/* Sıralama tab */}
          <View style={{ flexDirection: "row", backgroundColor: "#0f172a", borderRadius: 999, padding: 3, marginTop: 4 }}>
            {(["top50", "friends"] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => setBoardTab(tab)}
                style={{ flex: 1, paddingVertical: 7, borderRadius: 999, backgroundColor: boardTab === tab ? Colors.accent : "transparent", alignItems: "center" }}
              >
                <Text style={{ color: boardTab === tab ? "#000" : Colors.muted, fontWeight: "700", fontSize: 12 }}>
                  {tab === "top50" ? `🏆 İlk 50` : `👥 Arkadaşlar (${(data.friendsInBoard || []).length})`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Sıralama listesi */}
          {(() => {
            const rows = boardTab === "friends" ? (data.friendsInBoard || []) : (data.board || []);
            if (rows.length === 0) return (
              <Text style={{ color: Colors.muted, fontSize: 12, textAlign: "center", paddingVertical: 12 }}>
                {boardTab === "friends" ? "Arkadaşın bu turnuvada yok." : "Henüz katılımcı yok."}
              </Text>
            );
            return rows.map((row) => {
              const isMe = row.userId.toLowerCase() === userId.toLowerCase();
              const rank = row.rank ?? (data.board || []).indexOf(row) + 1;
              const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}.`;
              return (
                <View
                  key={row.userId}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: 10,
                    borderRadius: 10,
                    backgroundColor: isMe ? "#0f172a" : "#020617",
                    borderWidth: 1,
                    borderColor: isMe ? Colors.accent : Colors.border,
                  }}
                >
                  <Text style={{ color: isMe ? Colors.accent : "#94a3b8", fontWeight: isMe ? "900" : "600", minWidth: 36 }}>
                    {medal}
                  </Text>
                  <Text style={{ color: "#fff", fontWeight: isMe ? "800" : "500", flex: 1 }} numberOfLines={1}>
                    {row.userId}{isMe ? " 👤" : ""}
                  </Text>
                  <Text style={{ color: "#a3e635", fontWeight: "800" }}>
                    {row.points} p
                  </Text>
                </View>
              );
            });
          })()}
          {boardTab === "top50" && (data.totalMembers ?? 0) > 50 && (
            <Text style={{ color: Colors.muted, fontSize: 11, textAlign: "center" }}>
              İlk 50 gösteriliyor • Toplam {data.totalMembers} katılımcı
            </Text>
          )}

          {/* Maçlar */}
          <Text style={{ fontWeight: "700", marginTop: 4 }}>Turnuva Maçları</Text>
          {(data.fixtures || []).map((f) => {
            const ko = f.kickoffISO ? new Date(f.kickoffISO) : null;
            const upcoming = ko && ko.getTime() > Date.now();
            return (
              <TouchableOpacity
                key={f.fixtureId}
                disabled={!upcoming}
                onPress={() =>
                  router.push({ pathname: "/(tabs)/predict", params: { fixtureId: f.fixtureId, userId } })
                }
                style={{
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: "#020617",
                  borderWidth: 1,
                  borderColor: Colors.border,
                  opacity: f.settled ? 0.75 : 1,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: "#fff", fontWeight: "700", flex: 1 }} numberOfLines={1}>
                    {f.home} — {f.away}
                  </Text>
                  {f.score ? (
                    <Text style={{ color: "#a3e635", fontWeight: "900" }}>
                      {f.score.home}-{f.score.away}
                    </Text>
                  ) : (
                    <Text style={{ color: Colors.muted, fontSize: 11 }}>{f.status || "NS"}</Text>
                  )}
                </View>
                <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 2 }}>
                  {f.league || ""}
                  {ko
                    ? ` · ${ko.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                    : ""}
                  {upcoming ? " · tahmin için dokun" : f.settled ? " · puanlandı ✓" : ""}
                </Text>
              </TouchableOpacity>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}
