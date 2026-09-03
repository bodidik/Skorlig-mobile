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
import { getAuthHeaders, apiFetch as sharedApiFetch } from "../../lib/apiFetch";
import { t, useLang } from "../../lib/i18n";
import { puanYaz } from "../../lib/lcBicim";
import { hataMesaji } from "../../lib/hataMesaji";
import { gorunenAd } from "../../lib/gorunenAd";

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

type TeamRow = {
  userId: string;
  points: number;
  team?: string | null;
  flag?: string | null;
};

export default function TeamTotalsScreen() {
  useLang(); // dil değişince yeniden çizilsin
  const router = useRouter();
  const params = useLocalSearchParams();

  const team = String((params as any)?.team ?? "").trim();
  const userId = String((params as any)?.userId ?? "").trim();

  const title = useMemo(() => {
    if (team) return t("teamRankingT", { t: team });
    return t("teamRanking");
  }, [team]);

  const [items, setItems] = useState<TeamRow[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchJson = useCallback(async (url: string) => {
    const r = await apiFetch(url);
    const j = await r.json().catch(() => null);
    return j;
  }, []);

  const load = useCallback(async () => {
    const tName = String(team || "").trim(); // eski adi t idi, i18n t() golgeleniyordu
    if (!tName) {
      setItems([]);
      setUpdatedAt(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      /* ⚠️ YOL DÜZELTİLDİ: `/api/rt/team-totals` diye bir uç YOK (404) — bu
       * ekran hiçbir zaman veri göstermedi. Aynı sınıf hata kings, board2,
       * live-fav ve stats-fav ekranlarında da vardı; bu, listede parkta
       * bekleyen sonuncularından biriydi.
       *
       * Gerçek uç `/api/stats/team-ranks` ve `userId` İSTEMİYOR: takımın
       * kadrosunu ve puanlarını takım adından çözüyor. */
      const url = `/api/stats/team-ranks?team=${encodeURIComponent(tName)}`;

      const j: any = await fetchJson(url);

      if (!j?.ok) {
        setItems([]);
        setUpdatedAt(j?.updatedAt || null);
        return;
      }

      const rows: TeamRow[] = Array.isArray(j.items)
        ? j.items.map((x: any) => ({
            userId: String(x.userId || x.userIdLower || ""),
            /* ⚠️ ALAN ADI `total`. Uç `points` DEĞİL `total` döndürüyor;
             * yalnızca yolu düzeltmek yetmezdi — her satır 0 puan görünür ve
             * ekran "çalışıyor ama herkes sıfır" gibi, daha da yanıltıcı
             * olurdu. Bu depoda aynı tuzağa qualified/minPlayed/cups ve
             * ratingRaw ile de düşülmüş. */
            points: Number(x.total ?? x.points ?? x.totalPoints ?? 0),
            team: x.team ?? null,
            flag: x.flag ?? null,
          }))
        : [];

      rows.sort((a, b) => (b.points || 0) - (a.points || 0));

      setItems(rows);
      setUpdatedAt(j.updatedAt || null);
    } catch (e: any) {
      setItems([]);
      setUpdatedAt(null);
      /* ⚠️ HAM HATA BASILMIYOR: kullanıcı "AbortError: ..." okuyamaz ve
       * okuyamadığı bir hatada yapabileceği bir şey de yoktur. */
      Alert.alert(t("error"), hataMesaji(e));
    } finally {
      setLoading(false);
    }
  }, [team, userId, fetchJson]);

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
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: Colors.border,
          }}
        >
          <Text style={{ color: Colors.muted, fontSize: 12 }}>{t("back")}</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 18,
              fontWeight: "800",
              color: Colors.slate900,
            }}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 2 }}>
            {t("updatedRow", { d: updatedAt || "-" })}
          </Text>
        </View>
      </View>

      {/* Loading */}
      {loading && (
        <View style={{ paddingVertical: 12 }}>
          <ActivityIndicator />
          <Text style={{ color: Colors.muted, fontSize: 12, marginTop: 8 }}>
            {t("loading")}
          </Text>
        </View>
      )}

      {/* List */}
      <View
        style={{
          backgroundColor: "#0f172a",
          borderRadius: 12,
          borderWidth: 1,
          borderColor: Colors.border,
          overflow: "hidden",
        }}
      >
        {items.length === 0 ? (
          <Text style={{ padding: 12, color: Colors.muted }}>
            {t("noRecordsFound")}
          </Text>
        ) : (
          items.map((x, idx) => (
            <View
              key={`${x.userId || "u"}_${idx}`}
              style={{
                padding: 12,
                borderTopWidth: idx ? 1 : 0,
                borderColor: Colors.border,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Text style={{ width: 28, textAlign: "right", fontWeight: "700", color: "#e2e8f0" }}>
                {idx + 1}
              </Text>
              <Text style={{ width: 26, textAlign: "center" }}>
                {x.flag || ""}
              </Text>
              <Text style={{ flex: 1 }}>
                {gorunenAd(x)}
                {x.team ? ` • ${x.team}` : ""}
              </Text>
              <Text style={{ fontWeight: "800", color: "#e2e8f0" }}>{puanYaz(x.points)}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}
