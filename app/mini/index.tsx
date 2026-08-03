import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Colors from "../../constants/colors";
import { getApiBase } from "../../lib/apiBase";
import { getAuthHeaders, apiFetch as sharedApiFetch } from "../../lib/apiFetch";
import { t, useLang } from "../../lib/i18n";
const t2 = t; // map(t) golgelemesi icin takma ad

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

type MiniT = {
  id: string;
  code: string;
  name: string;
  ownerId: string;
  memberCount: number;
  fixtures: any[];
  createdAt: string;
};

export default function MiniTournamentsScreen() {
  useLang(); // dil değişince ekran yeniden çizilsin
  const router = useRouter();
  const { userId: qUserId } = useLocalSearchParams<{ userId?: string }>();
  const userId = String(qUserId || "demo1").trim();

  const [items, setItems] = useState<MiniT[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await apiFetch(`/api/mini/mine?userId=${encodeURIComponent(userId)}`).then((x) => x.json());
      setItems(r?.ok && Array.isArray(r.items) ? r.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function join() {
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      Alert.alert("SkorLig", t("writeCodeFirst"));
      return;
    }
    try {
      setJoining(true);
      const r = await apiFetch(`/api/mini/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, code }),
      }).then((x) => x.json());
      if (r?.ok) {
        Alert.alert("SkorLig", r.already ? t("alreadyInThisTour") : t("joinedTour", { n: r.tournament?.name }));
        setJoinCode("");
        load();
      } else {
        const msg =
          r?.error === "TOURNAMENT_NOT_FOUND"
            ? t("codeNotFound")
            : r?.error === "TOURNAMENT_FULL"
            ? t("tourFull")
            : r?.error || t("joinFailed3");
        Alert.alert("SkorLig", msg);
      }
    } catch (e: any) {
      Alert.alert(t("error"), String(e?.message || e));
    } finally {
      setJoining(false);
    }
  }

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
        <Text style={{ color: Colors.muted, fontSize: 12 }}>{t("back")}</Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 20, fontWeight: "800", color: Colors.slate900 }}>{t("miniToursTitle")}</Text>
      <Text style={{ color: Colors.muted, fontSize: 12 }}>
        {t("miniIntro")}
      </Text>

      <TouchableOpacity
        onPress={() => router.push({ pathname: "/mini/create", params: { userId } })}
        style={{ padding: 12, backgroundColor: Colors.accent, borderRadius: 12 }}
      >
        <Text style={{ textAlign: "center", color: Colors.onAccent, fontWeight: "800" }}>{t("newMiniTour")}</Text>
      </TouchableOpacity>

      {/* Kodla katıl */}
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
        <Text style={{ fontWeight: "700" }}>{t("joinWithCode")}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput
            value={joinCode}
            onChangeText={setJoinCode}
            placeholder={t("codePh3")}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: Colors.border,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 8,
              fontSize: 14,
              letterSpacing: 2,
            }}
          />
          <TouchableOpacity
            onPress={join}
            disabled={joining}
            style={{
              paddingHorizontal: 16,
              justifyContent: "center",
              borderRadius: 8,
              backgroundColor: joining ? Colors.border : Colors.live,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>{joining ? "..." : t("join")}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Turnuvalarım */}
      <Text style={{ fontWeight: "700", marginTop: 4 }}>{t("myTours")}</Text>
      {loading && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <ActivityIndicator size="small" />
          <Text style={{ color: Colors.muted, fontSize: 12 }}>{t("loading")}</Text>
        </View>
      )}
      {!loading && items.length === 0 && (
        <Text style={{ color: Colors.muted, fontSize: 12 }}>
          {t("noMiniYet")}
        </Text>
      )}
      {items.map((t) => (
        <TouchableOpacity
          key={t.id}
          onPress={() => router.push({ pathname: "/mini/[id]", params: { id: t.id, userId } })}
          style={{
            padding: 12,
            backgroundColor: "#020617",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.border,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: "#fff", fontWeight: "700", flex: 1 }} numberOfLines={1}>
              {t.name}
            </Text>
            <Text style={{ color: "#a5b4fc", fontSize: 11, fontWeight: "700" }}>{t.code}</Text>
          </View>
          <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 4 }}>
            {t2("tourRow", { m: t.fixtures?.length || 0, k: t.memberCount })}
            {t.ownerId === userId ? t2("founderSuffix") : ""}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
