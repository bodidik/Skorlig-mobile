/**
 * GÜNÜN MAÇI KARTI — ana ekranda tek kart; herkes (ülkeler üstü) aynı maçta.
 *
 * Kurallar sunucuda (api/lib/gunun-maci.cjs): seçim otomatik, yönetici
 * önizlemesi, 20:00 yayın, ilk tahminde kilit, puan ×2 + teselli kademesi.
 * Tahmin AYRI UÇ DEĞİL: POST /api/skor/tahmin (aynı bedel, aynı havuz).
 *
 * ⚠️ DİL: "tahmin / yarışma / topluluk" — oran, bahis, ödeme çağrışımı yok
 * (IARC). Takım LOGOSU/FORMASI YOK, yalnız ad (marka hakkı).
 *
 * Yayında maç yoksa ya da özellik kapalıysa kart HİÇ çizilmez.
 */

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { apiFetch, apiJson } from "../lib/apiFetch";
import { t, useLang } from "../lib/i18n";
import { macSaatiEtiketi } from "../lib/macSaati";
import hataMesaji from "../lib/hataMesaji";
import { titret } from "../lib/hisler";
import { useAuth } from "../contexts/AuthContext";
import { DUGME_YAZISI, IC_YUZEY, METIN_ANA, METIN_IKINCIL, METIN_SOLUK, MOD_RENGI } from "../lib/oyunMerkezi";
import { golAyarla } from "../lib/skorTahmini";
import Basinc from "./Basinc";
import { parca } from "./OyunKartParcalari";

const RENK = MOD_RENGI.skor;

type GununMaci = {
  fixtureId: string; home: string; away: string; league?: string | null;
  kickoffISO: string; gun: string; katilimci: number;
  benim: { home: number; away: number } | null;
};

export default function GununMaciKarti() {
  useLang();
  const { user, loading: oturumYukleniyor, signInWithGoogle } = useAuth();
  const uid = user?.uid || null;
  const [mac, setMac] = useState<GununMaci | null>(null);
  const [bedel, setBedel] = useState(0);
  const [taslak, setTaslak] = useState({ home: 0, away: 0 });
  const [gonderiliyor, setGonderiliyor] = useState(false);

  const yukle = useCallback(async () => {
    const j = await apiJson("/api/gunun-maci");
    if (!j?.ok) return;                       // geçici hata/kapalı: kart görünmez
    setBedel(Number(j.bedel) || 0);
    const m = (j.mac || null) as GununMaci | null;
    setMac(m);
    if (m?.benim) setTaslak({ home: m.benim.home, away: m.benim.away });
  }, []);

  useEffect(() => {
    if (oturumYukleniyor) return;
    yukle();
  }, [oturumYukleniyor, uid, yukle]);

  if (!mac) return null;

  const degisti = !mac.benim || mac.benim.home !== taslak.home || mac.benim.away !== taslak.away;

  async function gonder() {
    if (!mac || gonderiliyor || !degisti) return;
    if (!uid) {
      Alert.alert(t("loginNeededTitle"), t("loginNeededMsg"), [
        { text: t("cancel"), style: "cancel" },
        { text: t("signInGoogle2"), onPress: () => { signInWithGoogle().catch(() => {}); } },
      ]);
      return;
    }
    setGonderiliyor(true);
    try {
      const r = await apiFetch("/api/skor/tahmin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixtureId: mac.fixtureId, home: taslak.home, away: taslak.away }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) Alert.alert(t("skorErr"), hataMesaji(j?.error));
      else titret("gol");
      await yukle();
    } catch {
      Alert.alert(t("skorErr"), t("netErr"));
    }
    setGonderiliyor(false);
  }

  const Taraf = ({ ad, taraf }: { ad: string; taraf: "home" | "away" }) => (
    <View style={s.takim}>
      <Text style={s.takimAd} numberOfLines={2}>{ad}</Text>
      <View style={s.sayac}>
        <Basinc onPress={() => setTaslak((x) => ({ ...x, [taraf]: golAyarla(x[taraf], -1) }))} scaleTo={0.9}>
          <View accessibilityRole="button" accessibilityLabel={`${ad} −1`} style={s.sayacDugme}><Text style={s.isaret}>−</Text></View>
        </Basinc>
        <Text style={s.gol}>{taslak[taraf]}</Text>
        <Basinc onPress={() => setTaslak((x) => ({ ...x, [taraf]: golAyarla(x[taraf], 1) }))} scaleTo={0.9}>
          <View accessibilityRole="button" accessibilityLabel={`${ad} +1`} style={s.sayacDugme}><Text style={s.isaret}>+</Text></View>
        </Basinc>
      </View>
    </View>
  );

  return (
    <View style={[parca.kart, s.kart]}>
      <Text style={s.baslik}>⭐ {t("gmTitle")}</Text>
      <Text style={s.alt}>{t("gmSub", { n: mac.katilimci })}</Text>
      <Text style={s.meta} numberOfLines={1}>
        {[mac.league, macSaatiEtiketi(mac.kickoffISO, { bugun: t("today"), yarin: t("tomorrow") })].filter(Boolean).join(" · ")}
      </Text>
      <View style={s.skorSatiri}>
        <Taraf ad={mac.home} taraf="home" />
        <Text style={s.ayrac}>:</Text>
        <Taraf ad={mac.away} taraf="away" />
      </View>
      {degisti ? (
        <Basinc onPress={gonder} scaleTo={0.97} disabled={gonderiliyor}>
          <View style={[s.dugme, gonderiliyor && { opacity: 0.7 }]}>
            {gonderiliyor
              ? <ActivityIndicator color={DUGME_YAZISI} />
              : <Text style={s.dugmeYazi}>{mac.benim ? t("skorUpdate") : t("skorSend", { n: bedel })}</Text>}
          </View>
        </Basinc>
      ) : (
        <Text style={s.durum}>✓ {t("skorSaved", { s: `${mac.benim!.home}-${mac.benim!.away}` })}</Text>
      )}
      <Text style={s.kural}>{t("gmRule")}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  kart: { borderWidth: 2, borderColor: RENK },
  baslik: { color: RENK, fontSize: 18, fontWeight: "900", textAlign: "center" },
  alt: { color: METIN_IKINCIL, fontSize: 13, fontWeight: "700", textAlign: "center", marginTop: 4 },
  meta: { color: METIN_SOLUK, fontSize: 12, fontWeight: "700", marginTop: 12, textAlign: "center" },
  skorSatiri: { flexDirection: "row", alignItems: "center", marginTop: 10, gap: 6 },
  ayrac: { color: METIN_SOLUK, fontSize: 28, fontWeight: "900", marginTop: 46 },
  takim: { flex: 1, alignItems: "center", gap: 8 },
  takimAd: { color: METIN_ANA, fontSize: 15, fontWeight: "800", textAlign: "center", minHeight: 38 },
  sayac: { flexDirection: "row", alignItems: "center", gap: 12 },
  sayacDugme: { width: 38, height: 38, borderRadius: 19, backgroundColor: IC_YUZEY, alignItems: "center", justifyContent: "center" },
  isaret: { color: METIN_ANA, fontSize: 22, fontWeight: "800", marginTop: -2 },
  gol: { color: METIN_ANA, fontSize: 34, fontWeight: "900", minWidth: 30, textAlign: "center" },
  dugme: { marginTop: 16, borderRadius: 999, paddingVertical: 13, alignItems: "center", backgroundColor: RENK },
  dugmeYazi: { color: DUGME_YAZISI, fontSize: 15, fontWeight: "900" },
  durum: { color: RENK, fontSize: 14, fontWeight: "700", marginTop: 16, textAlign: "center" },
  kural: { color: METIN_SOLUK, fontSize: 11, fontWeight: "600", marginTop: 12, textAlign: "center", lineHeight: 16 },
});
