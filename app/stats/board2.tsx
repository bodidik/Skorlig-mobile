import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import Colors from "../../constants/colors";
import { getApiBase } from "../../lib/apiBase";
import { getAuthHeaders } from "../../lib/apiFetch";

async function apiFetch(path: string, init?: RequestInit) {
  const base = await getApiBase();
  const authH = await getAuthHeaders();
  const p = path.startsWith("/") ? path : `/${path}`;
  return fetch(`${base}${p}`, { ...init, headers: { ...authH, ...(init?.headers as any) } });
}

type BoardRow = {
  userId: string;
  points: number;
  flag?: string | null;
};

export default function Board2Screen() {
  const router = useRouter();

  const [items, setItems] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const r = await apiFetch("/api/stats/board2");
      const j = await r.json();

      if (j?.ok && Array.isArray(j.items)) {
        setItems(j.items);
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={load} />
      }
    >
      {/* Geri */}
      <TouchableOpacity onPress={() => router.back()}>
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
        Liderlik Tablosu
      </Text>

      {/* Liste */}
      <View
        style={{
          backgroundColor: "#fff",
          borderRadius: 12,
          borderWidth: 1,
          borderColor: Colors.border,
        }}
      >
        {items.length === 0 ? (
          <Text style={{ padding: 12, color: Colors.muted }}>
            Kayıt bulunamadı.
          </Text>
        ) : (
          items.map((x, idx) => (
            <View
              key={x.userId + "_" + idx}
              style={{
                padding: 12,
                borderTopWidth: idx ? 1 : 0,
                borderColor: Colors.border,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Text
                style={{
                  width: 28,
                  textAlign: "right",
                  fontWeight: "700",
                }}
              >
                {idx + 1}
              </Text>
              <Text style={{ width: 26, textAlign: "center" }}>
                {x.flag || ""}
              </Text>
              <Text style={{ flex: 1 }}>{x.userId}</Text>
              <Text style={{ fontWeight: "800" }}>{x.points}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
