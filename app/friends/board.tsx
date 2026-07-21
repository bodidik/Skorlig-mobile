import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Colors from "../../constants/colors";
import { getApiBase } from "../../lib/apiBase";
import { getAuthHeaders } from "../../lib/apiFetch";

type FriendRow = {
  userId: string;
  name?: string | null;
  totalPoints?: number | null;
};

type BoardResponse = {
  ok: boolean;
  items?: FriendRow[];
  rows?: FriendRow[];
  data?: FriendRow[];
  error?: string;
};

async function apiFetch(path: string, init?: RequestInit) {
  const base = await getApiBase();
  const authH = await getAuthHeaders();
  const p = path.startsWith("/") ? path : `/${path}`;
  return fetch(`${base}${p}`, { ...init, headers: { ...authH, ...(init?.headers as any) } });
}

export default function FriendsBoardScreen() {
  const router = useRouter();
  const { userId: qUser } = useLocalSearchParams<{ userId?: string }>();
  const userId = useMemo(() => String(qUser || "demo1").trim(), [qUser]);

  const [rows, setRows] = useState<FriendRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadBoard = useCallback(async () => {
    const uid = userId.trim();
    if (!uid) {
      setRows([]);
      return;
    }
    try {
      setLoading(true);
      const res = await apiFetch(
        `/api/friends/board/${encodeURIComponent(uid)}`
      );
      const j: BoardResponse = await res.json();

      if (!j?.ok) {
        setRows([]);
        return;
      }

      const arr =
        (Array.isArray(j.items) && j.items) ||
        (Array.isArray(j.rows) && j.rows) ||
        (Array.isArray(j.data) && j.data) ||
        [];

      setRows(arr);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadBoard();
    setRefreshing(false);
  }, [loadBoard]);

  /**
   * Arkadaşlık isteği:
   *  - Backend gövdesi: { fromUserId, toUserId }
   */
  const sendFriendRequest = useCallback(
    async (targetId: string) => {
      const toId = String(targetId || "").trim();
      if (!toId || !userId.trim()) return;
      if (toId.toLowerCase() === userId.toLowerCase()) return;

      try {
        const res = await apiFetch(`/api/friends/request`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromUserId: userId,
            toUserId: toId,
          }),
        });
        const j = await res.json();

        if (j?.ok) {
          Alert.alert(
            "SkorLig",
            `${toId} için arkadaşlık isteği işlendi. (Karşı taraf kabul edince listeye düşecek.)`
          );
        } else {
          Alert.alert("Hata", j?.error || "ARKADAS_ISTEK_GONDERILEMEDI");
        }
      } catch (e: any) {
        Alert.alert("Hata", String(e?.message || e));
      }
    },
    [userId]
  );

  const visibleRows: FriendRow[] =
    rows.length > 0
      ? rows
      : [
          {
            userId,
            name: userId,
            totalPoints: 0,
          },
        ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      {/* Geri butonu */}
      <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 4 }}>
        <Text style={{ color: Colors.muted, fontSize: 12 }}>← Geri</Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 20, fontWeight: "800", color: Colors.slate900 }}>
        Arkadaş Ligim
      </Text>

      <Text style={{ color: Colors.muted, fontSize: 12 }}>
        Kullanıcı: {userId || "-"}
      </Text>

      {loading && !refreshing && (
        <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center" }}>
          <ActivityIndicator size="small" />
          <Text style={{ color: Colors.muted, marginLeft: 8 }}>Yükleniyor...</Text>
        </View>
      )}

      <View style={{ marginTop: 8 }}>
        {visibleRows.map((r, ix) => {
          const uid = String(r.userId || "").trim();
          const isMe = uid.toLowerCase() === userId.toLowerCase();
          const name = (r.name && String(r.name).trim()) || uid || "-";
          const pts = Number(r.totalPoints ?? 0) || 0;

          return (
            <View
              key={`${uid}_${ix}`}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                backgroundColor: "#0b0b0e",
                padding: 12,
                borderRadius: 12,
                marginBottom: 8,
              }}
            >
              {/* Sol: kullanıcı bilgisi */}
              <TouchableOpacity
                disabled={isMe || !uid}
                onPress={() => {
                  if (!isMe && uid) {
                    Alert.alert(
                      "Arkadaş ekle",
                      `${name} adlı kullanıcıya arkadaşlık isteği gönderilsin mi?`,
                      [
                        { text: "Vazgeç", style: "cancel" },
                        { text: "Gönder", onPress: () => sendFriendRequest(uid) },
                      ]
                    );
                  }
                }}
                style={{ flex: 1, marginRight: 8 }}
              >
                <Text style={{ color: "#fff", fontWeight: "600" }}>
                  {ix + 1}. {name}
                  {isMe ? " (ben)" : ""}
                </Text>
                <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 2 }}>
                  @{uid || "-"}
                </Text>
              </TouchableOpacity>

              {/* Sağ: puan + arkadaş ekle */}
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: "#a3e635", fontWeight: "700", fontSize: 14 }}>
                  {pts} puan
                </Text>

                {!isMe && !!uid && (
                  <TouchableOpacity
                    onPress={() => sendFriendRequest(uid)}
                    style={{
                      marginTop: 4,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: Colors.accent,
                      backgroundColor: "#111827",
                    }}
                  >
                    <Text
                      style={{ color: Colors.accent, fontSize: 11, fontWeight: "600" }}
                    >
                      + Arkadaş ekle
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </View>

      <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 8 }}>
        Listede kendin ve arkadaşların görünür. Bir satıra dokunarak veya “+ Arkadaş
        ekle” tuşuyla arkadaşlık isteği gönderebilirsin.
      </Text>
    </ScrollView>
  );
}
