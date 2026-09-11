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
import { useLocalSearchParams } from "expo-router";

import Colors from "../../constants/colors";
import { t, useLang } from "../../lib/i18n";
import { hataMesaji } from "../../lib/hataMesaji";
import { apiFetch } from "../../lib/apiFetch";
import { useUserId } from "../../lib/useUserId";
import { grupPanosu, toplamaKatilim, kodNormalle, type Pano } from "../../lib/gruplar";
import { puanYaz } from "../../lib/lcBicim";

export default function GroupBoardScreen() {
  useLang();
  const userId = useUserId();
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
                <Text style={{ color: Colors.text, flex: 1, fontWeight: s.userId === userId ? "800" : "600" }}>
                  {s.flag ? `${s.flag} ` : ""}{s.name}
                </Text>
                {/* Toplama katılmayan üye tabloda kalır ama işaretlenir —
                    yoksa "puanım neden sayılmıyor" sorusu cevapsız kalır. */}
                {!s.includeInTotal ? (
                  <Text style={{ color: Colors.muted, fontSize: 10, marginRight: 8 }}>{t("groupNotCounted")}</Text>
                ) : null}
                {/* ⚠️ HAM BASILMIYOR. Puanlar da kesirli birikiyor — üretim
                    verisinde 5.717648576819556e-17 gibi artıklar ölçüldü ve
                    kullanıcı ekranda tam olarak onu görüyor (nöbetçi:
                    tests/lc-gosterim-bicimi). */}
                <Text style={{ color: Colors.accent, fontWeight: "800" }}>{puanYaz(s.points)}</Text>
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
        </>
      )}
    </ScrollView>
  );
}
