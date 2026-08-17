import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Colors, { on } from "../../constants/colors";
import { getApiBase } from "../../lib/apiBase";
import { getAuthHeaders, apiFetch as sharedApiFetch } from "../../lib/apiFetch";
import { hataMesaji } from "../../lib/hataMesaji";
import { t, useLang } from "../../lib/i18n";
import { useUserId } from "../../lib/useUserId";

const MIN_FIXTURES = 2;
const MAX_FIXTURES = 10;

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

type Fx = {
  fixtureId: string | number;
  home?: string | null;
  away?: string | null;
  kickoffISO?: string | null;
  league?: string | null;
  status?: string | null;
};

export default function MiniCreateScreen() {
  useLang(); // dil değişince ekran yeniden çizilsin
  const router = useRouter();
  const { userId: qUserId } = useLocalSearchParams<{ userId?: string }>();
  // ⚠️ "demo1" YEDEĞİ KALDIRILDI: OyunModlari parametresiz açıyordu ve ekran
  // demo1'in profil ülkesine göre sıralıyordu. Kimlik artık oturumdan gelir;
  // sunucu zaten gövdedeki userId'yi değil token'ı kullanıyor (mini.cjs).
  const userId = useUserId(qUserId);

  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [fixtures, setFixtures] = useState<Fx[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      // Kullanıcının yereli neyse onu göster (profil ülkesi)
      let country: string | null = null;
      try {
        const p = await apiFetch(`/api/users/profile?userId=${encodeURIComponent(userId)}`).then((x) => x.json());
        country = p?.ok && p.profile?.country ? String(p.profile.country) : null;
      } catch {
        country = null;
      }
      const cq = country ? `&country=${encodeURIComponent(country)}` : "";
      const r = await apiFetch(`/api/live2/schedule?backDays=0&fwdDays=14${cq}`).then((x) => x.json());
      const list: Fx[] = r?.ok && Array.isArray(r.fixtures) ? r.fixtures : [];
      // sadece henüz başlamamış maçlar seçilebilsin
      const upcoming = list.filter((f) => {
        const ko = new Date(f.kickoffISO || 0).getTime();
        return Number.isFinite(ko) && ko > Date.now();
      });
      setFixtures(upcoming);
    } catch {
      setFixtures([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const selCount = selected.size;

  function toggle(fid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fid)) next.delete(fid);
      else if (next.size < MAX_FIXTURES) next.add(fid);
      else Alert.alert("SkorLig", t("maxNMatches", { n: MAX_FIXTURES }));
      return next;
    });
  }

  const canCreate = useMemo(
    () => name.trim().length > 0 && selCount >= MIN_FIXTURES && selCount <= MAX_FIXTURES,
    [name, selCount]
  );

  async function create() {
    if (!canCreate) {
      Alert.alert("SkorLig", t("nameAndPick", { a: MIN_FIXTURES, b: MAX_FIXTURES }));
      return;
    }
    try {
      setCreating(true);
      const chosen = fixtures.filter((f) => selected.has(String(f.fixtureId)));
      const r = await apiFetch(`/api/mini/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          name: name.trim(),
          isPublic,
          fixtures: chosen.map((f) => ({
            fixtureId: String(f.fixtureId),
            home: f.home,
            away: f.away,
            kickoffISO: f.kickoffISO,
            league: f.league,
          })),
        }),
      }).then((x) => x.json());

      if (r?.ok && r.tournament) {
        const msg = isPublic
          ? t("createdPublic", { n: r.tournament.name, c: r.tournament.code })
          : t("createdPrivate", { n: r.tournament.name, c: r.tournament.code });
        Alert.alert("SkorLig", msg);
        router.replace({ pathname: "/mini/[id]", params: { id: r.tournament.id, userId } });
      } else {
        Alert.alert(t("error"), r?.error || t("createFailed"));
      }
    } catch (e: any) {
      // Ham hata nesnesi kullanıcıya basılmaz (bkz. lib/hataMesaji.ts).
      Alert.alert(t("error"), hataMesaji(e?.message || e, t("createFailed")));
    } finally {
      setCreating(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 4 }}>
        <Text style={{ color: Colors.muted, fontSize: 12 }}>← Geri</Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 20, fontWeight: "800", color: Colors.slate900 }}>Mini Turnuva Kur</Text>

      <View style={{ padding: 12, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: Colors.border, gap: 10 }}>
        <Text style={{ fontWeight: "700" }}>{t("tourName")}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t("tourNamePh")}
          maxLength={60}
          style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }}
        />

        {/* Görünürlük toggle */}
        <Text style={{ fontWeight: "700", marginTop: 4 }}>{t("visibility")}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            onPress={() => setIsPublic(false)}
            style={{ flex: 1, padding: 10, borderRadius: 10, borderWidth: 2, borderColor: !isPublic ? "#3b82f6" : Colors.border, backgroundColor: !isPublic ? "#eff6ff" : "#fff", alignItems: "center", gap: 2 }}
          >
            <Text style={{ fontSize: 18 }}>🔒</Text>
            <Text style={{ fontWeight: "700", fontSize: 12, color: !isPublic ? "#1d4ed8" : Colors.muted }}>{t("friendsOnly")}</Text>
            <Text style={{ fontSize: 10, color: Colors.muted, textAlign: "center" }}>{t("friendsOnlyDesc")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setIsPublic(true)}
            style={{ flex: 1, padding: 10, borderRadius: 10, borderWidth: 2, borderColor: isPublic ? "#f59e0b" : Colors.border, backgroundColor: isPublic ? "#fffbeb" : "#fff", alignItems: "center", gap: 2 }}
          >
            <Text style={{ fontSize: 18 }}>🌍</Text>
            <Text style={{ fontWeight: "700", fontSize: 12, color: isPublic ? "#d97706" : Colors.muted }}>{t("publicLbl")}</Text>
            <Text style={{ fontSize: 10, color: Colors.muted, textAlign: "center" }}>{t("publicDesc")}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontWeight: "700" }}>{t("pickMatches")}</Text>
        <Text style={{ color: selCount >= MIN_FIXTURES ? Colors.live : Colors.muted, fontSize: 12, fontWeight: "700" }}>
          {t("nSelected", { n: selCount, m: MAX_FIXTURES })}{selCount >= MIN_FIXTURES ? "✓" : t("atLeastN", { n: MIN_FIXTURES })}
        </Text>
      </View>
      <Text style={{ color: Colors.muted, fontSize: 11 }}>
        {t("next14Days")}
      </Text>

      {loading && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <ActivityIndicator size="small" />
          <Text style={{ color: Colors.muted, fontSize: 12 }}>{t("loadingMatches")}</Text>
        </View>
      )}
      {!loading && fixtures.length === 0 && (
        <Text style={{ color: Colors.muted, fontSize: 12 }}>
          {t("noSelectable")}
        </Text>
      )}

      {fixtures.map((f) => {
        const fid = String(f.fixtureId);
        const active = selected.has(fid);
        const ko = f.kickoffISO ? new Date(f.kickoffISO) : null;
        return (
          <TouchableOpacity
            key={fid}
            onPress={() => toggle(fid)}
            style={{
              padding: 12,
              borderRadius: 12,
              borderWidth: 2,
              borderColor: active ? Colors.accent : Colors.border,
              backgroundColor: active ? "#0f172a" : "#020617",
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: "#fff", fontWeight: "700", flex: 1 }} numberOfLines={1}>
                {f.home} — {f.away}
              </Text>
              {active && <Text style={{ color: Colors.accent, fontWeight: "900" }}>✓</Text>}
            </View>
            <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 2 }}>
              {f.league || ""}
              {ko ? ` · ${ko.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}
            </Text>
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity
        onPress={create}
        disabled={creating || !canCreate}
        style={{
          padding: 14,
          borderRadius: 12,
          backgroundColor: canCreate ? Colors.accent : Colors.border,
          opacity: creating ? 0.7 : 1,
          marginTop: 4,
          marginBottom: 24,
        }}
      >
        <Text style={{ textAlign: "center", color: on(canCreate ? Colors.accent : Colors.border), fontWeight: "800" }}>
          {creating ? t("creating") : t("createTour")}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
