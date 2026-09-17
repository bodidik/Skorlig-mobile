/**
 * KRALLAR ÖZETİ — ana ekranda sezonun ilk 5'i, "devamı" Krallar sekmesine.
 *
 * ⚠️ KULLANICI İSTEĞİ (2026-09-17): "Ana ekranda kralların ilk 5 sırasını
 * gösteren bir alan da yapalım. İsteyen listeyi devamına tıklayarak krallar
 * kısmından devam edebilsin."
 *
 * ⚠️ SIRA KRALLAR SEKMESİYLE AYNI (uç, bot kuralı, sıralama) — gerekçe
 * lib/krallarOzeti.ts başlığında. Ana ekranda "1. X" deyip Krallar'da 1.'nin
 * başkası olması, iki ayrı tablo varmış gibi görünür.
 *
 * Kart dili Oyun Merkezi ile aynı (components/OyunKartParcalari.tsx): düz
 * zemin, kenarlık yok, metnin üstüne binen öğe yok.
 *
 * ⚠️ HATADA KART YOK, BOŞ TABLODA AÇIKLAMA VAR. Uç düşerse ana ekranda boş bir
 * kutu durmaz; sunucu cevap verip tablo boşsa (ayın 1'i, sezon sıfırlandı)
 * bu SÖYLENİR — "kimse yok" sessizliği bozuk ekran sanılır.
 */

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { apiJson } from "../lib/apiFetch";
import { t, useLang } from "../lib/i18n";
import { gorunenAd } from "../lib/gorunenAd";
import { ilkBes, OZET_UCU, ozetPuani, siraRozeti, type KralSatiri, type OzetSatiri } from "../lib/krallarOzeti";
import { IC_YUZEY, METIN_ANA, METIN_IKINCIL, MOD_RENGI } from "../lib/oyunMerkezi";
import Basinc from "./Basinc";
import IskeletBlok from "./Iskelet";
import { KralSanati } from "./OyunSanati";
import { KartBasi, parca } from "./OyunKartParcalari";

/** Krallar vurgusu — taç altını (mini turnuva ile aynı ton, oyun modu değil). */
const KRAL_RENGI = MOD_RENGI.mini;

export default function KrallarOzeti({ userId }: { userId?: string }) {
  useLang();
  const router = useRouter();
  const [satirlar, setSatirlar] = useState<OzetSatiri[] | null>(null);
  const [sezon, setSezon] = useState<string | null>(null);
  const [hata, setHata] = useState(false);

  const yukle = useCallback(async () => {
    const j = await apiJson(OZET_UCU);
    if (!j?.ok || !Array.isArray(j.items)) {
      setHata(true);
      return;
    }
    setHata(false);
    setSatirlar(ilkBes(j.items as KralSatiri[], userId));
    setSezon(typeof j.seasonLabel === "string" ? j.seasonLabel : null);
  }, [userId]);

  useEffect(() => { yukle(); }, [yukle]);

  const kralliga = () => router.push("/(tabs)/kings" as any);

  if (hata) return null;

  if (!satirlar) {
    return (
      <View style={parca.kart}>
        <View style={{ gap: 10 }}>
          <IskeletBlok style={{ width: 140, height: 20 }} />
          {[0, 1, 2, 3, 4].map((i) => <IskeletBlok key={i} style={{ width: "100%", height: 16 }} />)}
        </View>
      </View>
    );
  }

  const alt = [t("kingsTop5Sub"), sezon].filter(Boolean).join(" · ");

  return (
    <View style={parca.kart}>
      <KartBasi
        renk={KRAL_RENGI}
        Sanat={KralSanati}
        ad={t("kingsTitle")}
        alt={alt}
      />

      {satirlar.length === 0 ? (
        <Text style={parca.aciklama}>{t("kingsEmpty")}</Text>
      ) : (
        <View style={s.liste}>
          {satirlar.map((r) => {
            const rozet = siraRozeti(r.sira);
            return (
              <Basinc
                key={`${r.sira}-${r.userId}`}
                onPress={() => router.push({ pathname: "/profile/[userId]", params: { userId: r.userId } } as any)}
                scaleTo={0.98}
              >
                <View
                  accessibilityRole="button"
                  accessibilityLabel={`${r.sira}. ${gorunenAd(r)} ${ozetPuani(r.totalPoints)} ${t("points")}`}
                  style={[s.satir, r.ben && s.benSatir]}
                >
                  <View style={[s.rozet, { backgroundColor: rozet.zemin }]}>
                    <Text style={[s.rozetYazi, { color: rozet.yazi }]}>{r.sira}</Text>
                  </View>
                  <Text style={[s.ad, r.ben && { color: KRAL_RENGI }]} numberOfLines={1}>
                    {gorunenAd(r)}{r.ben ? ` · ${t("you")}` : ""}
                  </Text>
                  <Text style={s.puan}>
                    {ozetPuani(r.totalPoints)} <Text style={s.puanBirim}>{t("points")}</Text>
                  </Text>
                </View>
              </Basinc>
            );
          })}
        </View>
      )}

      <Basinc onPress={kralliga} scaleTo={0.97}>
        <Text accessibilityRole="button" style={[parca.baglanti, s.devam, { color: KRAL_RENGI }]}>
          {t("kingsSeeMore")} ›
        </Text>
      </Basinc>
    </View>
  );
}

const s = StyleSheet.create({
  liste: { marginTop: 12, gap: 6 },
  satir: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12,
  },
  benSatir: { backgroundColor: IC_YUZEY },
  rozet: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  rozetYazi: { fontSize: 13, fontWeight: "900" },
  ad: { flex: 1, minWidth: 0, color: METIN_ANA, fontSize: 15, fontWeight: "700" },
  puan: { color: METIN_ANA, fontSize: 15, fontWeight: "900" },
  puanBirim: { color: METIN_IKINCIL, fontSize: 12, fontWeight: "600" },
  devam: { marginTop: 12, textAlign: "center" },
});
