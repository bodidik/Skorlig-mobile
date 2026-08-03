import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useUserId } from "../../lib/useUserId";
import { hataMesaji } from "../../lib/hataMesaji";
import { t, useLang } from "../../lib/i18n";
import Colors from "../../constants/colors";
import { getApiBase } from "../../lib/apiBase";
import { getAuthHeaders, apiFetch as sharedApiFetch } from "../../lib/apiFetch";

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

export default function FavTeamScreen() {
  useLang(); // dil değişince yeniden çizilsin
  const router = useRouter();

  // Kimlik oturumdan gelir; elle yazdırmak hem hatalı hem güvensizdi.
  const userId = useUserId();
  const [team, setTeam] = useState("");
  const [flag, setFlag] = useState("");

  const canSave = useMemo(() => {
    return String(userId || "").trim().length > 0 && String(team || "").trim().length > 0;
  }, [userId, team]);

  const save = useCallback(async () => {
    const uid = String(userId || "").trim();
    const tName = String(team || "").trim(); // eski adi t idi, i18n t() golgeleniyordu
    const f = String(flag || "").trim();

    if (!uid) {
      Alert.alert("SkorLig", t("loginRequired"));
      return;
    }
    if (!tName) {
      Alert.alert("SkorLig", t("teamNameEmpty"));
      return;
    }

    try {
      // ⚠️ YOL DÜZELTİLDİ: `/api/rt/fav-team` diye bir uç YOK — bu ekran da
      // hiçbir zaman kaydetmiyordu. (İkiz ekran app/live/fav.tsx aynı hatayı
      // farklı bir yanlış yolla yapıyordu: `/api/stats/fav`.)
      // Gerçek uç: POST /api/users/set-main-team; kimlik verifyToken'dan gelir.
      const res = await apiFetch(`/api/users/set-main-team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team: tName, flag: f || null }),
      });
      const j = await res.json();
      if (j?.ok) {
        Alert.alert("SkorLig", t("favTeamSaved"));
        router.back();
      } else {
        Alert.alert(t("error"), hataMesaji(j?.error));
      }
    } catch (e: any) {
      Alert.alert(t("error"), String(e?.message || e));
    }
  }, [userId, team, flag, router]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      <Text style={{ fontSize: 18, fontWeight: "800", color: "#e2e8f0" }}>{t("pickFavTeam")}</Text>

      <View
        style={{
          backgroundColor: "#0f172a",
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: Colors.border,
        }}
      >
        {/* ⚠️ "Kullanıcı ID" GİRİŞİ KALDIRILDI: kullanıcıdan 28 karakterlik
            Firebase kimliğini ELLE YAZMASI isteniyordu — kimse yapamaz.
            Kimlik artık istekle birlikte token'dan gidiyor
            (POST /api/users/set-main-team + verifyToken). */}
        <Text style={{ color: Colors.muted, fontSize: 12 }}>
          {t("accountTeamUpd")}
        </Text>
      </View>

      <View
        style={{
          backgroundColor: "#0f172a",
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: Colors.border,
        }}
      >
        <Text style={{ color: Colors.muted, marginBottom: 6 }}>{t("teamLbl")}</Text>
        <TextInput
          value={team}
          onChangeText={setTeam}
          autoCapitalize="words"
          style={{
            borderWidth: 1,
            borderColor: Colors.border,
            borderRadius: 8,
            padding: 10,
          }}
        />
      </View>

      <View
        style={{
          backgroundColor: "#0f172a",
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: Colors.border,
        }}
      >
        <Text style={{ color: Colors.muted, marginBottom: 6 }}>
          Bayrak (opsiyonel)
        </Text>
        <TextInput
          value={flag}
          onChangeText={setFlag}
          autoCapitalize="characters"
          style={{
            borderWidth: 1,
            borderColor: Colors.border,
            borderRadius: 8,
            padding: 10,
          }}
        />
      </View>

      <TouchableOpacity
        onPress={save}
        disabled={!canSave}
        style={{
          padding: 14,
          borderRadius: 12,
          backgroundColor: !canSave ? Colors.muted : Colors.live,
        }}
      >
        <Text style={{ color: "#fff", textAlign: "center", fontWeight: "700" }}>
          Kaydet
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
