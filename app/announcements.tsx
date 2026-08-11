import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, FlatList, ActivityIndicator,
  StyleSheet, RefreshControl,
} from "react-native";
import { useFocusEffect } from "expo-router";
import BackBar from "../components/BackBar";
import { apiFetch } from "../lib/apiFetch";
import { t, useLang } from "../lib/i18n";

type Announcement = {
  id: string;
  title: string;
  body: string;
  sentAt: string;
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString("tr-TR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function AnnouncementsScreen() {
  useLang();
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await apiFetch("/api/push/announcements?limit=50");
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error || t("annLoadFailed"));
      setItems(Array.isArray(j.items) ? j.items : []);
    } catch (e: any) {
      setErr(String(e?.message || e));
    }
  }, []);

  // Ekran açılınca yükle + okundu işaretle
  useFocusEffect(useCallback(() => {
    setLoading(true);
    load().finally(() => setLoading(false));

    // Okundu işareti — hata olsa da sessiz devam
    apiFetch("/api/push/announcements/read", { method: "POST" }).catch(() => {});
  }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <View style={s.screen}>
      <BackBar title={t("annTitle")} />

      {loading ? (
        <View style={s.center}><ActivityIndicator color="#60a5fa" size="large" /></View>
      ) : err ? (
        <View style={s.center}><Text style={s.err}>{err}</Text></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          contentContainerStyle={items.length === 0 ? s.emptyContainer : { padding: 16, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#60a5fa" />}
          ListEmptyComponent={
            <View style={s.center}>
              <Text style={s.emptyIcon}>🔔</Text>
              <Text style={s.emptyText}>{t("annEmpty")}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={s.card}>
              <Text style={s.cardTitle}>{item.title}</Text>
              <Text style={s.cardBody}>{item.body}</Text>
              <Text style={s.cardDate}>{fmtDate(item.sentAt)}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0b1120" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  err: { color: "#f87171", textAlign: "center" },
  emptyContainer: { flex: 1 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: "#64748b", fontSize: 15 },
  card: {
    backgroundColor: "#0f172a",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1e293b",
    padding: 16,
  },
  cardTitle: { color: "#f1f5f9", fontWeight: "800", fontSize: 15, marginBottom: 6 },
  cardBody: { color: "#94a3b8", fontSize: 13, lineHeight: 20, marginBottom: 8 },
  cardDate: { color: "#475569", fontSize: 10 },
});
