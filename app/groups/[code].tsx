/**
 * GRUP PANOSU — sunucuda hazırdı, hiç görüntülenmiyordu.
 *
 * ⚠️ ÖLÇÜLEN KUSUR (2026-09-10 TR40 denetimi, me.tsx:843, "kritik", 3/3):
 * `GET /api/groups/:code/board` puan sıralamalı tam bir grup tablosu
 * döndürüyor (routes/groups.cjs handleBoard, season_totals ile) ve istemcide
 * SIFIR çağıranı vardı.
 *
 * "Beni grup toplamında say / sayma" seçeneği de aynı durumdaydı
 * (`POST /:code/opt`) — sunucuda yazılabiliyor, ekranda yoktu.
 *
 * İstek mantığı `lib/gruplar.ts` içinde ve GERÇEK sunucuya karşı sınanıyor
 * (api/tests/grup-kablosu.mongo.test.cjs).
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import Colors from "../../constants/colors";
import { t, useLang } from "../../lib/i18n";
import { hataMesaji } from "../../lib/hataMesaji";
import { apiFetch } from "../../lib/apiFetch";
import { useUserId } from "../../lib/useUserId";
import { grupPanosu, toplamaKatilim, uyeCikar, gruptanAyril, kodNormalle, type Pano, type PanoSatir } from "../../lib/gruplar";
import { puanYaz } from "../../lib/lcBicim";

export default function GroupBoardScreen() {
  useLang();
  const userId = useUserId();
  const router = useRouter();
  const { code: ham } = useLocalSearchParams<{ code?: string }>();
  const code = kodNormalle(Array.isArray(ham) ? ham[0] : ham);

  const [yukleniyor, setYukleniyor] = useState(true);
  const [yenileniyor, setYenileniyor] = useState(false);
  const [pano, setPano] = useState<Pano | null>(null);
  const [hata, setHata] = useState("");

  const yukle = useCallback(async () => {
    if (!code) { setHata(t("groupNotFound")); setYukleniyor(false); return; }
    const r = await grupPanosu(code, apiFetch as any);
    if (r.durum === "ok") { setPano(r.pano); setHata(""); }
    else { setPano(null); setHata(hataMesaji(r.hata)); }
    setYukleniyor(false);
  }, [code]);

  useEffect(() => { yukle(); }, [yukle]);

  const benimSatir = pano?.items.find((x) => x.userId === userId) || null;
  /* Düğmeyi yalnız kurucu görüyor. Yetki yine SUNUCUDA (handleRemove
   * NOT_OWNER); buradaki kontrol arayüz ipucu, kapı değil. */
  const kurucuyum = !!pano?.ownerId && pano.ownerId === userId;

  async function cikar(satir: PanoSatir) {
    /**
     * ⚠️ İKİ FARKLI SONUÇ, İKİ FARKLI CÜMLE. Bot anında çıkar; insan SEZON
     * SONUNDA. Kullanıcıya bunu söylemezsek 'çıkardım ama hâlâ listede'
     * diye hata sanır. Onay metni erteleme GEREKÇESİNİ de söylüyor:
     * bu sezonun sıralaması değişmediği için kimse öne geçtiği diye
     * çıkarılamaz (bkz. api/lib/social-store.cjs setGroupRemoval).
     */
    const soru = satir.bot
      ? t("groupRemoveBotQ", { u: satir.name })
      : t("groupRemoveManQ", { u: satir.name });
    Alert.alert(t("groupRemove"), soru, [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("groupRemove"),
        style: "destructive",
        onPress: async () => {
          const r = await uyeCikar(code, satir.userId, apiFetch as any);
          if (r.durum !== "ok") { Alert.alert(t("error"), hataMesaji(r.hata)); return; }
          await yukle();
          Alert.alert("SkorLig", r.mode === "immediate" ? t("groupRemoveDone") : t("groupRemovePlan"));
        },
      },
    ]);
  }

  async function cikarmayiIptal(satir: PanoSatir) {
    const r = await uyeCikar(code, satir.userId, apiFetch as any, true);
    if (r.durum !== "ok") { Alert.alert(t("error"), hataMesaji(r.hata)); return; }
    await yukle();
    Alert.alert("SkorLig", t("groupCancelDone"));
  }

  async function ayril() {
    Alert.alert(t("groupLeave"), t("groupLeaveQ"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("groupLeave"),
        style: "destructive",
        onPress: async () => {
          const r = await gruptanAyril(code, apiFetch as any);
          if (r.durum !== "ok") { Alert.alert(t("error"), hataMesaji(r.hata)); return; }
          Alert.alert("SkorLig", t("groupLeaveDone"));
          router.back();
        },
      },
    ]);
  }

  async function katilimiDegistir() {
    if (!benimSatir) return;
    const r = await toplamaKatilim(code, !benimSatir.includeInTotal, apiFetch as any);
    if (r.durum !== "ok") { Alert.alert(t("error"), hataMesaji(r.hata)); return; }
    await yukle();
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={yenileniyor}
          onRefresh={async () => { setYenileniyor(true); await yukle(); setYenileniyor(false); }}
          tintColor={Colors.accent}
        />
      }
    >
      <Text style={{ color: Colors.text, fontSize: 22, fontWeight: "800" }}>
        {pano?.name || t("groupsTitle")}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 }}>
        <Text style={{ color: Colors.muted, fontSize: 11 }}>{t("groupCodeLabel")}</Text>
        <Text selectable style={{ color: Colors.text, fontSize: 14, fontWeight: "800", letterSpacing: 3 }}>
          {code}
        </Text>
        {pano ? (
          <Text style={{ color: Colors.muted, fontSize: 11 }}>{t("groupMembers", { n: pano.size })}</Text>
        ) : null}
      </View>

      {yukleniyor ? (
        <ActivityIndicator color={Colors.accent} style={{ marginTop: 24 }} />
      ) : hata ? (
        <View style={{ marginTop: 20, padding: 14, borderRadius: 12, backgroundColor: Colors.dark }}>
          <Text style={{ color: Colors.text, fontSize: 13 }}>{hata}</Text>
          <TouchableOpacity onPress={yukle} style={{ marginTop: 10 }}>
            <Text style={{ color: Colors.accent, fontWeight: "700" }}>{t("retry")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={{ marginTop: 16, borderRadius: 12, backgroundColor: Colors.dark, overflow: "hidden" }}>
            {(pano?.items || []).map((s, i) => (
              <View
                key={s.userId}
                style={{
                  flexDirection: "row", alignItems: "center", padding: 12,
                  borderBottomWidth: i === (pano!.items.length - 1) ? 0 : 1,
                  borderBottomColor: "#1f2937",
                }}
              >
                <Text style={{ color: Colors.muted, width: 28, fontWeight: "700" }}>{i + 1}</Text>
                {/* Üye adı — dokununca profil (Play: takma ad görülen yerden bildirme
                    yolu olmalı; bildir düğmesi profil ekranında). Kendi satırı hariç. */}
                <TouchableOpacity
                  style={{ flex: 1 }}
                  disabled={s.userId === userId}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: "/profile/[userId]", params: { userId: s.userId } } as any)}
                >
                  <Text style={{ color: Colors.text, fontWeight: s.userId === userId ? "800" : "600" }}>
                    {s.flag ? `${s.flag} ` : ""}{s.name}
                  </Text>
                </TouchableOpacity>
                {/* Toplama katılmayan üye tabloda kalır ama işaretlenir —
                    yoksa "puanım neden sayılmıyor" sorusu cevapsız kalır. */}
                {s.ayrilacak ? (
                  <Text style={{ color: "#f59e0b", fontSize: 10, marginRight: 8 }}>{t("groupLeaving")}</Text>
                ) : null}
                {!s.includeInTotal ? (
                  <Text style={{ color: Colors.muted, fontSize: 10, marginRight: 8 }}>{t("groupNotCounted")}</Text>
                ) : null}
                {/* ⚠️ HAM BASILMIYOR. Puanlar da kesirli birikiyor — üretim
                    verisinde 5.717648576819556e-17 gibi artıklar ölçüldü ve
                    kullanıcı ekranda tam olarak onu görüyor (nöbetçi:
                    tests/lc-gosterim-bicimi). */}
                <Text style={{ color: Colors.accent, fontWeight: "800" }}>{puanYaz(s.points)}</Text>
                {kurucuyum && s.userId !== pano?.ownerId ? (
                  <TouchableOpacity
                    onPress={() => (s.ayrilacak ? cikarmayiIptal(s) : cikar(s))}
                    style={{ marginLeft: 10 }}
                  >
                    <Text style={{ color: s.ayrilacak ? Colors.accent : "#ef4444", fontSize: 11, fontWeight: "700" }}>
                      {s.ayrilacak ? t("groupCancelPlan") : t("groupRemove")}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>

          {benimSatir ? (
            <TouchableOpacity
              onPress={katilimiDegistir}
              style={{ marginTop: 14, padding: 14, borderRadius: 12, backgroundColor: Colors.dark }}
            >
              <Text style={{ color: Colors.text, fontSize: 13, fontWeight: "700" }}>
                {benimSatir.includeInTotal ? t("groupOptOut") : t("groupOptIn")}
              </Text>
              <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 4, lineHeight: 16 }}>
                {t("groupOptHelp")}
              </Text>
            </TouchableOpacity>
          ) : null}

          {benimSatir && !kurucuyum ? (
            <TouchableOpacity onPress={ayril} style={{ marginTop: 10, padding: 14, alignSelf: "center" }}>
              <Text style={{ color: "#ef4444", fontSize: 13, fontWeight: "700" }}>{t("groupLeave")}</Text>
            </TouchableOpacity>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}
