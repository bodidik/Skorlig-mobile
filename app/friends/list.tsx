import React, { useEffect, useState } from "react";
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
import Colors from "../../constants/colors";
import { getApiBase } from "../../lib/apiBase";
import { getAuthHeaders } from "../../lib/apiFetch";

async function apiFetch(path: string, init?: RequestInit) {
  const base = await getApiBase();
  const authH = await getAuthHeaders();
  const p = path.startsWith("/") ? path : `/${path}`;
  return fetch(`${base}${p}`, { ...init, headers: { ...authH, ...(init?.headers as any) } });
}

type FriendRow = {
  userId: string;
  name?: string | null;
  team?: string | null;
  flag?: string | null;
  totalPoints?: number | null;
};

type PendingInRow = {
  fromUserId: string;
  name?: string | null;
};

type PendingOutRow = {
  toUserId: string;
  name?: string | null;
};

export default function FriendsListScreen() {
  const router = useRouter();
  const { userId: qUserId } = useLocalSearchParams<{ userId?: string }>();
  const userId = String(qUserId || "demo1").trim();

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [pendingIn, setPendingIn] = useState<PendingInRow[]>([]);
  const [pendingOut, setPendingOut] = useState<PendingOutRow[]>([]);

  async function loadList() {
    try {
      setLoading(true);

      const r = await apiFetch(
        `/api/friends/list?userId=${encodeURIComponent(userId)}`
      );
      const j = await r.json();

      if (!j?.ok) {
        throw new Error(j?.error || "FRIENDS_LIST_FAILED");
      }

      setFriends(Array.isArray(j.friends) ? j.friends : []);
      setPendingIn(Array.isArray(j.pendingIn) ? j.pendingIn : []);
      setPendingOut(Array.isArray(j.pendingOut) ? j.pendingOut : []);
    } catch (e: any) {
      setFriends([]);
      setPendingIn([]);
      setPendingOut([]);
      Alert.alert("Hata", String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function onRefresh() {
    setRefreshing(true);
    await loadList();
    setRefreshing(false);
  }

  async function acceptRequest(fromUserId: string) {
    const from = String(fromUserId || "").trim();
    if (!from) return;

    try {
      const res = await apiFetch(`/api/friends/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          fromUserId: from,
        }),
      });
      const j = await res.json();
      if (j?.ok) {
        Alert.alert("SkorLig", `${from} isteği kabul edildi.`);
        loadList();
      } else {
        Alert.alert("Hata", j?.error || "FRIEND_ACCEPT_FAILED");
      }
    } catch (e: any) {
      Alert.alert("Hata", String(e?.message || e));
    }
  }

  async function rejectRequest(fromUserId: string) {
    const from = String(fromUserId || "").trim();
    if (!from) return;

    try {
      const res = await apiFetch(`/api/friends/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          fromUserId: from,
        }),
      });
      const j = await res.json();
      if (j?.ok) {
        Alert.alert("SkorLig", `${from} isteği reddedildi.`);
        loadList();
      } else {
        Alert.alert("Hata", j?.error || "FRIEND_REJECT_FAILED");
      }
    } catch (e: any) {
      Alert.alert("Hata", String(e?.message || e));
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      {/* Geri */}
      <TouchableOpacity
        onPress={() => router.back()}
        style={{ marginBottom: 4 }}
      >
        <Text style={{ color: Colors.muted, fontSize: 12 }}>← Geri</Text>
      </TouchableOpacity>

      {/* Başlık */}
      <Text
        style={{
          fontSize: 20,
          fontWeight: "800",
          color: Colors.slate900,
        }}
      >
        Arkadaşlarım
      </Text>
      <Text style={{ color: Colors.muted, fontSize: 12 }}>
        Kullanıcı: {userId}
      </Text>

      {/* Board'a git kısayolu */}
      <TouchableOpacity
        onPress={() =>
          router.push({
            pathname: "/friends/board",
            params: { userId },
          })
        }
        style={{
          marginTop: 8,
          paddingVertical: 8,
          borderRadius: 999,
          backgroundColor: Colors.headerBlue,
        }}
      >
        <Text
          style={{
            textAlign: "center",
            color: Colors.slate900,
            fontWeight: "600",
            fontSize: 13,
          }}
        >
          Arkadaş Ligini Gör
        </Text>
      </TouchableOpacity>

      {loading && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <ActivityIndicator size="small" />
          <Text style={{ color: Colors.muted, marginTop: 8 }}>
            Yükleniyor...
          </Text>
        </View>
      )}

      {/* Bekleyen gelen istekler */}
      <View style={{ marginTop: 16 }}>
        <Text
          style={{
            fontSize: 14,
            fontWeight: "700",
            color: Colors.slate900,
            marginBottom: 6,
          }}
        >
          Gelen İstekler
        </Text>

        {pendingIn.length === 0 ? (
          <Text style={{ color: Colors.muted, fontSize: 12 }}>
            Bekleyen arkadaşlık isteğin yok.
          </Text>
        ) : (
          pendingIn.map((r, ix) => {
            const uid = String(r.fromUserId || "").trim();
            const name = r.name || uid;
            return (
              <View
                key={uid + "_" + ix}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  backgroundColor: "#020617",
                  marginBottom: 6,
                  borderWidth: 1,
                  borderColor: Colors.border,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "600" }}>
                  {name}
                </Text>
                <Text
                  style={{
                    color: Colors.muted,
                    fontSize: 11,
                    marginTop: 2,
                  }}
                >
                  @{uid}
                </Text>

                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  <TouchableOpacity
                    onPress={() => acceptRequest(uid)}
                    style={{
                      flex: 1,
                      paddingVertical: 6,
                      borderRadius: 999,
                      backgroundColor: Colors.live,
                    }}
                  >
                    <Text
                      style={{
                        textAlign: "center",
                        color: "#fff",
                        fontWeight: "700",
                        fontSize: 12,
                      }}
                    >
                      Kabul Et
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => rejectRequest(uid)}
                    style={{
                      flex: 1,
                      paddingVertical: 6,
                      borderRadius: 999,
                      backgroundColor: "#111827",
                      borderWidth: 1,
                      borderColor: Colors.border,
                    }}
                  >
                    <Text
                      style={{
                        textAlign: "center",
                        color: Colors.muted,
                        fontWeight: "600",
                        fontSize: 12,
                      }}
                    >
                      Reddet
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* Gönderilmiş istekler */}
      <View style={{ marginTop: 16 }}>
        <Text
          style={{
            fontSize: 14,
            fontWeight: "700",
            color: Colors.slate900,
            marginBottom: 6,
          }}
        >
          Gönderdiğim İstekler
        </Text>

        {pendingOut.length === 0 ? (
          <Text style={{ color: Colors.muted, fontSize: 12 }}>
            Halen bekleyen gönderilmiş isteğin yok.
          </Text>
        ) : (
          pendingOut.map((r, ix) => {
            const uid = String(r.toUserId || "").trim();
            const name = r.name || uid;
            return (
              <View
                key={uid + "_" + ix}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  backgroundColor: "#020617",
                  marginBottom: 6,
                  borderWidth: 1,
                  borderColor: Colors.border,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "600" }}>
                  {name}
                </Text>
                <Text
                  style={{
                    color: Colors.muted,
                    fontSize: 11,
                    marginTop: 2,
                  }}
                >
                  @{uid}
                </Text>
                <Text
                  style={{
                    color: Colors.muted,
                    fontSize: 11,
                    marginTop: 4,
                  }}
                >
                  Beklemede
                </Text>
              </View>
            );
          })
        )}
      </View>

      {/* Arkadaş listesi */}
      <View style={{ marginTop: 16, marginBottom: 16 }}>
        <Text
          style={{
            fontSize: 14,
            fontWeight: "700",
            color: Colors.slate900,
            marginBottom: 6,
          }}
        >
          Arkadaş Listesi
        </Text>

        {friends.length === 0 ? (
          <Text style={{ color: Colors.muted, fontSize: 12 }}>
            Henüz arkadaşın yok. Profil ekranından veya Arkadaş Ligi ekranından
            istek gönderebilirsin.
          </Text>
        ) : (
          friends.map((f, ix) => {
            const uid = String(f.userId || "").trim();
            const name = f.name || uid;
            const pts = f.totalPoints ?? 0;

            return (
              <TouchableOpacity
                key={uid + "_" + ix}
                activeOpacity={0.8}
                onPress={() =>
                  router.push({ pathname: "/profile/[userId]", params: { userId: uid } })
                }
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: 10,
                  borderRadius: 10,
                  backgroundColor: "#020617",
                  marginBottom: 6,
                  borderWidth: 1,
                  borderColor: Colors.border,
                }}
              >
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={{ color: "#fff", fontWeight: "600" }}>
                    {name}
                  </Text>
                  <Text
                    style={{
                      color: Colors.muted,
                      fontSize: 11,
                      marginTop: 2,
                    }}
                  >
                    @{uid}
                    {f.team ? ` • ${f.team}` : ""}
                  </Text>
                </View>
                <Text
                  style={{
                    color: "#a3e635",
                    fontWeight: "700",
                    fontSize: 13,
                  }}
                >
                  {pts} p
                </Text>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}
