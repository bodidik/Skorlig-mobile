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
import { getAuthHeaders, apiFetch as sharedApiFetch } from "../../lib/apiFetch";
import { t, useLang } from "../../lib/i18n";

/**
 * Paylasilan apiFetch'e delege eder.
 *
 * ⚠️ BURADA HAM `fetch` VARDI: zaman asimi ve yeniden deneme politikasi yoktu
 * (bkz. lib/fetchPolicy). Istek asildiginda ekran sonsuza kadar spinner
 * gosteriyor, kullanicinin iptal edecek bir seyi olmuyordu — "kings"
 * sekmesinde tam olarak bu yasandi. Ayni kopya 29 dosyada vardi.
 * Paylasilan surum auth basliklarini da kendisi ekliyor.
 */
async function apiFetch(path: string, init?: RequestInit) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return sharedApiFetch(p, init as any);
}

type BoardRow = {
  userId: string;
  points: number;
  flag?: string | null;
};

export default function Board2Screen() {
  useLang();
  const router = useRouter();

  const [items, setItems] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  async function load() {
    try {
      setLoading(true);
      setLoadError(false);
      // ⚠️ YOL DÜZELTİLDİ: `/api/stats/board2` diye bir uç YOK (404) — ekran hep
      // boş kalıyordu. Rota `totals-read.cjs` içinde ve `/api/rt` altında mount
      // ediliyor. Aynı sınıf hata "kings" ekranında da vardı (`/api/users`).
      const r = await apiFetch("/api/rt/board2");
      const j = await r.json();

      if (j?.ok && Array.isArray(j.items)) {
        setItems(j.items);
      } else {
        setItems([]);
      }
    } catch (e) {
      console.warn("[board2] yuklenemedi:", e);
      setItems([]);
      setLoadError(true);
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
        <Text style={{ color: Colors.muted, fontSize: 12 }}>{t("back")}</Text>
      </TouchableOpacity>

      {/* Başlık */}
      <Text
        style={{
          fontSize: 20,
          fontWeight: "800",
          color: Colors.slate900,
        }}
      >
        {t("leaderboardTitle")}
      </Text>

      {/* Liste */}
      <View
        style={{
          backgroundColor: "#0f172a",
          borderRadius: 12,
          borderWidth: 1,
          borderColor: Colors.border,
        }}
      >
        {items.length === 0 ? (
          <Text style={{ padding: 12, color: loadError ? Colors.danger : Colors.muted }}>
            {loadError ? t("tableLoadError") : t("noRecordsFound")}
          </Text>
        ) : (
          items.slice(0, 100).map((x, idx) => (
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
              <Text style={{ fontWeight: "800", color: "#e2e8f0" }}>{x.points}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
