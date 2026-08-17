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
import { hataMesaji } from "../../lib/hataMesaji";

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

/**
 * ⚠️ BU EKRAN VAR OLMAYAN BİR API'YE GÖRE YAZILMIŞTI.
 *
 * `/api/stats/user` çağırıp `j.flag`, `j.team`, `j.total`, `j.items`
 * okuyordu; bu DÖRT alanın hiçbiri hiçbir dönüş yolunda yoktu. Sonuç:
 * başlıkta yalnız ham userId, "Genel Puan" HERKESE sabit 0, "Son oynananlar"
 * kalıcı boş — ve HATA GÖSTERİLMİYOR, çünkü tek koruma `if (!j?.ok) throw`
 * ve `ok` her zaman true.
 *
 * Aynı ucu kardeş ekran (`competition-kings.tsx:182`) doğru okuyor, yani uç
 * değil bu ekran yanlıştı. Artık üç gerçek sözleşmeden besleniyor:
 *
 *   /api/stats/user   → season.total          (genel puan)
 *   /api/users/profile→ profile.mainTeam/flag (başlık)
 *   /api/pred/my      → current[] + old[]     (son tahminler)
 */
type PredRow = {
  fixtureId: string;
  home?: string | null;        // TAKIM ADI (skor değil)
  away?: string | null;
  status?: string | null;
  score?: { home: number; away: number } | null;
  pred?: {
    outcome?: string | null;
    home?: number | null;      // TAHMİN edilen skor
    away?: number | null;
    firstGoal?: string | null;
    firstHalf?: string | null;
  } | null;
};

export default function StatsMeScreen() {
  useLang(); // dil değişince yeniden çizilsin
  const router = useRouter();
  const { userId: qUser } = useLocalSearchParams<{ userId?: string }>();

  const userId = useMemo(() => String(qUser || "demo1").trim(), [qUser]);

  const [loading, setLoading] = useState(false);

  const [flag, setFlag] = useState<string>("");
  const [team, setTeam] = useState<string>("");
  const [total, setTotal] = useState<number>(0);
  const [items, setItems] = useState<PredRow[]>([]);

  const load = useCallback(async () => {
    const u = encodeURIComponent(userId);
    try {
      setLoading(true);

      /* Üç uç paralel: biri yavaşsa diğerleri beklemesin. `allSettled` —
       * birinin düşmesi tüm ekranı boşaltmasın (eskiden tek uç vardı ve o da
       * yanlış alanları veriyordu, yani ekran her hâlükârda boştu). */
      const [sonuc, profil, tahmin] = await Promise.allSettled([
        apiFetch(`/api/stats/user?userId=${u}`).then((r) => r.json()),
        apiFetch(`/api/users/profile?userId=${u}`).then((r) => r.json()),
        apiFetch(`/api/pred/my?userId=${u}`).then((r) => r.json()),
      ]);

      const s = sonuc.status === "fulfilled" ? sonuc.value : null;
      const p = profil.status === "fulfilled" ? profil.value : null;
      const tp = tahmin.status === "fulfilled" ? tahmin.value : null;

      if (!s?.ok && !p?.ok && !tp?.ok) {
        throw new Error(s?.error || p?.error || tp?.error || "STATS_ME_FAILED");
      }

      // Genel puan: season.total (eskiden okunan `j.total` hiç yoktu).
      setTotal(Number(s?.season?.total || 0));

      setFlag(String(p?.profile?.flag || ""));
      setTeam(String(p?.profile?.mainTeam || ""));

      // Son tahminler: current (güncel) + old (eski), sunucunun sırasıyla.
      const cur = Array.isArray(tp?.current) ? tp.current : [];
      const esk = Array.isArray(tp?.old) ? tp.old : [];
      setItems([...cur, ...esk].slice(0, 50));
    } catch (e: any) {
      setFlag("");
      setTeam("");
      setTotal(0);
      setItems([]);
      Alert.alert(t("error"), hataMesaji(e));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const Btn = ({ title, to }: { title: string; to: string }) => (
    <TouchableOpacity
      onPress={() => router.push({ pathname: to as any, params: { userId } } as any)}
      style={{
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: Colors.headerBlue,
        borderRadius: 10,
      }}
    >
      <Text style={{ fontWeight: "600", color: "#e2e8f0" }}>{title}</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <View style={{ padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: "800", color: "#e2e8f0" }}>{t("myStats")}</Text>
        <Text style={{ color: Colors.muted }}>
          {flag || ""} {userId}
          {team ? ` • ${team}` : ""}
        </Text>

        <View
          style={{
            backgroundColor: "#0f172a",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.border,
            padding: 12,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#e2e8f0" }}>{t("overallScore")}</Text>

          {loading ? (
            <View style={{ marginTop: 10, alignItems: "center" }}>
              <ActivityIndicator />
              <Text style={{ marginTop: 8, color: Colors.muted }}>{t("loading")}</Text>
            </View>
          ) : (
            <Text style={{ fontSize: 28, fontWeight: "900", marginTop: 4, color: "#e2e8f0" }}>{total}</Text>
          )}

          <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <Btn title={t("openMatchesBtn")} to="/live" />
            <Btn title={t("myFavTeamBtn")} to="/live/fav" />
            <Btn title={t("flagBoardBtn")} to="/stats/board2" />
          </View>
        </View>

        <View
          style={{
            backgroundColor: "#0f172a",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.border,
          }}
        >
          <Text style={{ padding: 12, fontWeight: "700", color: "#e2e8f0" }}>{t("recentPlayed")}</Text>

          {items.length === 0 ? (
            <Text style={{ padding: 12, color: Colors.muted }}>{t("noRecords")}</Text>
          ) : (
            items.map((it, idx) => (
              <View
                key={it.fixtureId + "_" + idx}
                style={{
                  padding: 12,
                  borderTopWidth: idx ? 1 : 0,
                  borderColor: Colors.border,
                }}
              >
                {/* Takım adları satırın KENDİSİNDE (eskiden iç içe `live`
                    nesnesinde aranıyordu — öyle bir alan hiç yoktu). */}
                <Text style={{ fontWeight: "600", color: "#e2e8f0" }}>
                  {it.home || "Ev"} – {it.away || "Dep"}
                </Text>
                {/* Tahmin edilen skor `pred` altında; satır kökündeki
                    home/away TAKIM ADI. İkisini karıştırmak eski hataydı. */}
                <Text style={{ color: Colors.muted, fontSize: 12 }}>
                  {t("predLbl")}: {it.pred?.home ?? "-"}-{it.pred?.away ?? "-"}
                  {it.pred?.outcome ? ` (${it.pred.outcome})` : ""}
                  {it.pred?.firstGoal ? ` • FG:${it.pred.firstGoal}` : ""}
                  {it.pred?.firstHalf ? ` • 1Y:${it.pred.firstHalf}` : ""}
                </Text>
                {it.score ? (
                  <Text style={{ color: Colors.muted, fontSize: 12 }}>
                    {t("liveRow", { s: it.status || "-" })} • {it.score.home}-{it.score.away}
                  </Text>
                ) : null}
              </View>
            ))
          )}
        </View>
      </View>
    </ScrollView>
  );
}
