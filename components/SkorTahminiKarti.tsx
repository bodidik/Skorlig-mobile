/**
 * SKOR TAHMİNİ KARTI — ana ekranda, Oyun Merkezi'nin içinde.
 *
 * ⚠️ KULLANICI İSTEĞİ (2026-09-17): "Ayrı ama ana akımda bir maç skoru tahmini
 * alanı yazalım ve SkorLig ana ekranında verelim. Tek maç şeklinde olsun."
 * Kurallar, puan ve para sunucuda: api/lib/skor-tahmini.cjs.
 *
 * Kart dili Oyun Merkezi ile aynı (components/OyunKartParcalari.tsx): düz
 * zemin, kenarlık yok, metnin üstüne binen öğe yok, tek dolu düğme.
 *
 * ⚠️ OTURUM HAZIR OLMADAN İSTEK YOK — KuponKarti'nda ölçülen kusur: açılışta
 * token yokken istek 401 dönüyor ve kart bir daha denemiyordu.
 *
 * ⚠️ YALNIZ BAYRAK KAPALIYSA GİZLENİR (FEATURE_DISABLED). Ağ/zaman aşımı
 * gibi geçici hatada kart "Tekrar dene" gösterir — emülatörde ölçülen kusur
 * (2026-09-17): API ilk yüklemede yavaşken istek düştü ve kart iskeletten
 * sonra kalıcı olarak kayboldu. Sunucu cevap verip maç yoksa bu söylenir.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Alert, ActivityIndicator, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { apiFetch, apiJson } from "../lib/apiFetch";
import { t, useLang } from "../lib/i18n";
import { macSaatiEtiketi } from "../lib/macSaati";
import hataMesaji from "../lib/hataMesaji";
import { titret } from "../lib/hisler";
import { useAuth } from "../contexts/AuthContext";
import {
  DUGME_YAZISI, IC_YUZEY, METIN_ANA, METIN_IKINCIL, METIN_SOLUK, MOD_RENGI,
} from "../lib/oyunMerkezi";
import { eylemDurumu, golAyarla, ilkTaslak, oneCikanMac, puanIsaretli, type SkorMaci } from "../lib/skorTahmini";
import Basinc from "./Basinc";
import IskeletBlok from "./Iskelet";
import { SkorSanati } from "./OyunSanati";
import { KartBasi, parca } from "./OyunKartParcalari";

const RENK = MOD_RENGI.skor;

export default function SkorTahminiKarti() {
  useLang();
  const router = useRouter();
  const { user, loading: oturumYukleniyor } = useAuth();
  const uid = user?.uid || null;
  const [maclar, setMaclar] = useState<SkorMaci[] | null>(null);
  const [bedel, setBedel] = useState<number>(0);
  /* "kapali": özellik kapalı → kart yok. "gecici": tekrar denenebilir hata. */
  const [hata, setHata] = useState<null | "kapali" | "gecici">(null);
  const [seciliId, setSeciliId] = useState<string | null>(null);
  const [taslak, setTaslak] = useState({ home: 0, away: 0 });
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const yukle = useCallback(async () => {
    const j = await apiJson("/api/skor/maclar");
    if (!j?.ok || !Array.isArray(j.maclar)) {
      setHata(j?.error === "FEATURE_DISABLED" ? "kapali" : "gecici");
      return;
    }
    setHata(null);
    setBedel(Number(j.bedel) || 0);
    setMaclar(j.maclar as SkorMaci[]);
  }, []);

  useEffect(() => {
    if (oturumYukleniyor) return;
    yukle();
  }, [oturumYukleniyor, uid, yukle]);

  /* Seçili maç: kullanıcı seçmediyse öne çıkan. Liste tazelenince seçim korunur. */
  const secili = useMemo(() => {
    if (!maclar?.length) return null;
    return maclar.find((m) => m.fixtureId === seciliId) || oneCikanMac(maclar);
  }, [maclar, seciliId]);

  /* Seçili maç değişince taslak o maçın kayıtlı tahminine (yoksa 0-0) döner. */
  useEffect(() => {
    setTaslak(ilkTaslak(secili));
  }, [secili?.fixtureId, secili?.benim?.home, secili?.benim?.away]);

  if (hata === "kapali") return null;

  if (hata === "gecici" && !maclar) {
    return (
      <View style={parca.kart}>
        <KartBasi modu="skor" Sanat={SkorSanati} ad={t("skorTitle")} alt={null} />
        <Text style={parca.aciklama}>{t("netErr")}</Text>
        <Basinc onPress={() => { setHata(null); yukle(); }} scaleTo={0.97}>
          <Text accessibilityRole="button" style={[parca.baglanti, s.baglanti, { color: RENK }]}>
            {t("retry")}
          </Text>
        </Basinc>
      </View>
    );
  }

  if (!maclar) {
    return (
      <View style={parca.kart}>
        <View style={{ gap: 10 }}>
          <IskeletBlok style={{ width: 160, height: 20 }} />
          <IskeletBlok style={{ width: "100%", height: 60 }} />
        </View>
      </View>
    );
  }

  const durum = eylemDurumu(secili, taslak);
  const duzenlenebilir = durum === "gonder" || durum === "guncelle" || durum === "kayitli";
  /* Büyük rakamlar: sonuçlanmışsa GERÇEK skor (tahmin alt satırda yazıyor —
   * emülatörde görüldü: tahmin büyük yazılınca sonuç sanılıyordu). Kapanmış
   * maçta tahminim yoksa "0 : 0" da gerçek skor gibi okunur → tire. */
  const gercek = durum === "sonuclandi" ? secili?.benim?.sonuc?.gercek ?? null : null;
  const golGoster = (taraf: "home" | "away") =>
    gercek ? gercek[taraf] : duzenlenebilir || secili?.benim ? taslak[taraf] : null;
  const skorYaz = (s: { home: number; away: number }) => `${s.home}-${s.away}`;

  async function gonder() {
    if (!secili || gonderiliyor || (durum !== "gonder" && durum !== "guncelle")) return;
    setGonderiliyor(true);
    try {
      const r = await apiFetch("/api/skor/tahmin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixtureId: secili.fixtureId, home: taslak.home, away: taslak.away }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        Alert.alert(t("skorErr"), hataMesaji(j?.error));
      } else {
        titret("gol");
        await yukle();
      }
    } catch {
      Alert.alert(t("skorErr"), t("netErr"));
    }
    setGonderiliyor(false);
  }

  return (
    <View style={parca.kart}>
      <KartBasi
        modu="skor"
        Sanat={SkorSanati}
        ad={t("skorTitle")}
        alt={bedel > 0 ? t("skorSub", { n: bedel }) : null}
      />

      {!secili ? (
        <Text style={parca.aciklama}>{t("skorNoMatch")}</Text>
      ) : (
        <>
          {maclar.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.cipler}>
              {maclar.map((m) => {
                const aktif = m.fixtureId === secili.fixtureId;
                return (
                  <Basinc key={m.fixtureId} onPress={() => setSeciliId(m.fixtureId)} scaleTo={0.95}>
                    <View style={[s.cip, aktif && { backgroundColor: RENK }]}>
                      <Text style={[s.cipYazi, aktif && { color: DUGME_YAZISI }]} numberOfLines={1}>
                        {m.home} – {m.away}
                      </Text>
                    </View>
                  </Basinc>
                );
              })}
            </ScrollView>
          )}

          <Text style={s.meta} numberOfLines={1}>
            {[secili.league, macSaatiEtiketi(secili.kickoffISO, { bugun: t("today"), yarin: t("tomorrow") })].filter(Boolean).join(" · ")}
          </Text>

          <View style={s.skorSatiri}>
            <Takim ad={secili.home} gol={golGoster("home")} aktif={duzenlenebilir}
              degistir={(d) => setTaslak((x) => ({ ...x, home: golAyarla(x.home, d) }))} />
            <Text style={s.ayrac}>:</Text>
            <Takim ad={secili.away} gol={golGoster("away")} aktif={duzenlenebilir}
              degistir={(d) => setTaslak((x) => ({ ...x, away: golAyarla(x.away, d) }))} />
          </View>

          {durum === "gonder" || durum === "guncelle" ? (
            <Basinc onPress={gonder} scaleTo={0.97} disabled={gonderiliyor}>
              <View style={[s.dugme, { backgroundColor: RENK }, gonderiliyor && { opacity: 0.7 }]}>
                {gonderiliyor
                  ? <ActivityIndicator color={DUGME_YAZISI} />
                  : <Text style={s.dugmeYazi}>{durum === "gonder" ? t("skorSend", { n: bedel }) : t("skorUpdate")}</Text>}
              </View>
            </Basinc>
          ) : (
            <Text style={[s.durum, durum === "kayitli" && { color: RENK }]}>
              {durum === "kayitli" && secili.benim ? `✓ ${t("skorSaved", { s: skorYaz(secili.benim) })}` : null}
              {durum === "kilitli" ? (secili.benim ? t("skorLocked", { s: skorYaz(secili.benim) }) : t("skorLockedNone")) : null}
              {durum === "sonuclandi" && secili.benim?.sonuc ? (
                secili.benim.sonuc.iade
                  ? t("skorRefund", { n: secili.benim.sonuc.iadeLc ?? 0 })
                  : `${t("skorResult", {
                    g: secili.benim.sonuc.gercek ? skorYaz(secili.benim.sonuc.gercek) : "-",
                    s: skorYaz(secili.benim),
                    p: puanIsaretli(secili.benim.sonuc.puan),
                  })}${(secili.benim.sonuc.odulLc ?? 0) > 0 ? ` · ${t("skorReward", { n: secili.benim.sonuc.odulLc ?? 0 })}` : ""}`
              ) : null}
            </Text>
          )}
        </>
      )}

      <Basinc onPress={() => router.push("/skor-tahmini" as any)} scaleTo={0.97}>
        <Text accessibilityRole="button" style={[parca.baglanti, s.baglanti, { color: RENK }]}>
          {t("skorRulesLink")} ›
        </Text>
      </Basinc>
    </View>
  );
}

/** Takım adı + artı/eksi ile gol sayısı. */
function Takim({ ad, gol, aktif, degistir }: { ad: string; gol: number | null; aktif: boolean; degistir: (d: number) => void }) {
  return (
    <View style={s.takim}>
      <Text style={s.takimAd} numberOfLines={2}>{ad}</Text>
      <View style={s.sayac}>
        {aktif && (
          <Basinc onPress={() => degistir(-1)} scaleTo={0.9}>
            <View accessibilityRole="button" accessibilityLabel={`${ad} −1`} style={s.sayacDugme}>
              <Text style={s.sayacIsaret}>−</Text>
            </View>
          </Basinc>
        )}
        <Text style={s.gol}>{gol ?? "–"}</Text>
        {aktif && (
          <Basinc onPress={() => degistir(1)} scaleTo={0.9}>
            <View accessibilityRole="button" accessibilityLabel={`${ad} +1`} style={s.sayacDugme}>
              <Text style={s.sayacIsaret}>+</Text>
            </View>
          </Basinc>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  cipler: { gap: 8, paddingTop: 14 },
  cip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: IC_YUZEY, maxWidth: 220 },
  cipYazi: { color: METIN_IKINCIL, fontSize: 12, fontWeight: "800" },
  meta: { color: METIN_SOLUK, fontSize: 12, fontWeight: "700", marginTop: 14, textAlign: "center" },
  skorSatiri: { flexDirection: "row", alignItems: "center", marginTop: 10, gap: 6 },
  /* Sayaç satırının ortasına hizalı: ad (minHeight 38) + gap 8 + sayaç 38 → merkez +23; alignItems center içinde marginTop yarı etkili. */
  ayrac: { color: METIN_SOLUK, fontSize: 28, fontWeight: "900", marginTop: 46 },
  takim: { flex: 1, alignItems: "center", gap: 8 },
  takimAd: { color: METIN_ANA, fontSize: 15, fontWeight: "800", textAlign: "center", minHeight: 38 },
  sayac: { flexDirection: "row", alignItems: "center", gap: 12 },
  sayacDugme: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: IC_YUZEY,
    alignItems: "center", justifyContent: "center",
  },
  sayacIsaret: { color: METIN_ANA, fontSize: 22, fontWeight: "800", marginTop: -2 },
  gol: { color: METIN_ANA, fontSize: 34, fontWeight: "900", minWidth: 30, textAlign: "center" },
  dugme: { marginTop: 16, borderRadius: 999, paddingVertical: 13, alignItems: "center" },
  dugmeYazi: { color: DUGME_YAZISI, fontSize: 15, fontWeight: "900" },
  durum: { color: METIN_IKINCIL, fontSize: 14, fontWeight: "700", marginTop: 16, textAlign: "center", lineHeight: 20 },
  baglanti: { marginTop: 12, textAlign: "center" },
});
