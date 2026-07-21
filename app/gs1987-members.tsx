import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import Colors from "../constants/colors";
import { getApiBase } from "../lib/apiBase";
import { getAuthHeaders } from "../lib/apiFetch";

type Member = {
  userId: string;
  label?: string | null;
  lastCode?: string | null;
  sinceAt?: string | null;
  lastVerifiedAt?: string | null;
  active?: boolean | null;
};

type MembersResponse = {
  ok: boolean;
  updatedAt?: string | null;
  total?: number;
  items?: Member[];
};

async function apiFetch(path: string, init?: RequestInit) {
  const base = await getApiBase();
  const authH = await getAuthHeaders();
  const p = path.startsWith("/") ? path : `/${path}`;
  return fetch(`${base}${p}`, { ...init, headers: { ...authH, ...(init?.headers as any) } });
}

export default function Gs1987MembersScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<Member[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await apiFetch(`/api/auth1987gs/members`);
      const j: MembersResponse = await r.json();
      if (!j?.ok) {
        setItems([]);
        setUpdatedAt(null);
        return;
      }
      setItems(Array.isArray(j.items) ? j.items : []);
      setUpdatedAt(j.updatedAt || null);
    } catch {
      setItems([]);
      setUpdatedAt(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Başlık + geri */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: Colors.border,
            marginRight: 8,
          }}
        >
          <Text style={{ color: Colors.muted, fontSize: 12 }}>← Geri</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 20,
              fontWeight: "800",
              color: Colors.slate900,
            }}
          >
            1987GS Üyeleri
          </Text>
          <Text
            style={{
              fontSize: 11,
              color: Colors.muted,
              marginTop: 2,
            }}
          >
            Kodla / profilden 1987’ye tanımlanmış kullanıcılar.
          </Text>
        </View>
      </View>

      <Text style={{ fontSize: 11, color: Colors.muted, marginBottom: 8 }}>
        Güncelleme: {updatedAt || "-"}
      </Text>

      {loading && !refreshing ? (
        <View
          style={{
            marginTop: 24,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator />
          <Text
            style={{
              marginTop: 8,
              color: Colors.muted,
              fontSize: 12,
            }}
          >
            Yükleniyor...
          </Text>
        </View>
      ) : items.length === 0 ? (
        <Text
          style={{
            marginTop: 16,
            color: Colors.muted,
            fontSize: 12,
          }}
        >
          Henüz 1987GS üyesi bulunmuyor.
        </Text>
      ) : (
        <View style={{ marginTop: 8, gap: 6 }}>
          {items.map((m) => {
            const active = m.active !== false;
            return (
              <View
                key={m.userId}
                style={{
                  padding: 10,
                  borderRadius: 10,
                  backgroundColor: active ? "#020617" : "#111827",
                  borderWidth: 1,
                  borderColor: Colors.border,
                }}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontWeight: "700",
                    fontSize: 13,
                  }}
                >
                  {m.userId}
                  {m.label ? ` · ${m.label}` : ""}
                </Text>

                {!!m.lastCode && (
                  <Text
                    style={{
                      color: Colors.muted,
                      fontSize: 11,
                      marginTop: 2,
                    }}
                  >
                    Son kod: {m.lastCode}
                  </Text>
                )}

                <Text
                  style={{
                    color: Colors.muted,
                    fontSize: 11,
                    marginTop: 2,
                  }}
                >
                  Üyelik: {m.sinceAt || "—"}
                </Text>

                <Text
                  style={{
                    color: Colors.muted,
                    fontSize: 11,
                    marginTop: 2,
                  }}
                >
                  Son doğrulama: {m.lastVerifiedAt || "—"}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}
