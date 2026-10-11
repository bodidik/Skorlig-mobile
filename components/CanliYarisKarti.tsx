/**
 * CANLI YARIŞIN — ana ekranın en üstü: tahmin ettiğin maç oynanırken
 * yarıştaki yerin.
 *
 * ⚠️ KULLANICI KARARI (2026-10-11): "Yarışı ön planda oynatmamız lazım…
 * Tahmin et ve yarışı takip et." Yarış ekranı (`/match-race/[fixtureId]`)
 * vardı ama yalnızca maç kartından ya da tahmin ekranından açılıyordu; ana
 * ekranda yarışa giden kapı yoktu. Oyuncu tahmin ettiği maçın canlı
 * yarışını kendisi aramazsa hiç görmüyordu.
 *
 * Gösterim önceliği:
 *   1. Tahmin ettiğin maç CANLI → sıran, kaç kişi, hâlâ yarışta mısın.
 *   2. Canlı yok, 3 saat içinde başlayacak tahminin var → geri sayım.
 *   3. İkisi de yok → hiçbir şey çizilmez (ilk oyun kartı en üstte kalır).
 *
 * Tazeleme `usePolling` ile: ekran görünmezken / uygulama arka plandayken
 * istek atılmaz. Canlıda 30 sn, yaklaşırken 60 sn.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, Easing } from "react-native";
import { useRouter } from "expo-router";
import { apiJson } from "../lib/apiFetch";
import { t, useLang } from "../lib/i18n";
import { titret } from "../lib/hisler";
import { usePolling } from "../hooks/usePolling";
import Basinc from "./Basinc";
import { parca } from "./OyunKartParcalari";
import { DUGME_YAZISI, IC_YUZEY, METIN_ANA, METIN_IKINCIL, METIN_SOLUK } from "../lib/oyunMerkezi";

/* Yarış ekranıyla aynı küme (app/match-race/[fixtureId].tsx LIVE_STATUSES). */
const CANLI = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT"]);
const YAKIN_MS = 3 * 3600_000;
const KIRMIZI = "#ef4444";
const YESIL = "#22c55e";

type Tahmin = {
  fixtureId: string;
  home?: string | null;
  away?: string | null;
  kickoffISO?: string | null;
  status?: string | null;
  score?: { home: number; away: number } | null;
};
type Benim = { rank: number; inRace: boolean } | null;
type Yaris = {
  me?: Benim;
  totalPlayers?: number;
  state?: { minute?: number | null; score?: { home: number; away: number } | null; status?: string };
};

export default function CanliYarisKarti({ userId }: { userId: string }) {
  useLang();
  const router = useRouter();
  const uid = String(userId || "").trim();
  const [mac, setMac] = useState<Tahmin | null>(null);
  const [canli, setCanli] = useState(false);
  const [yaris, setYaris] = useState<Yaris | null>(null);
  const [yukselis, setYukselis] = useState(0);
  const oncekiSira = useRef<{ fid: string; rank: number } | null>(null);

  const yukle = useCallback(async () => {
    if (!uid) { setMac(null); return; }
    const j = await apiJson(`/api/pred/my?userId=${encodeURIComponent(uid)}`).catch(() => null);
    if (!j?.ok || !Array.isArray(j.current)) return; // ağ hatası: eldekini koru
    const simdi = Date.now();
    const liste = j.current as Tahmin[];
    const canliMac = liste.find((m) => CANLI.has(String(m.status || "").toUpperCase()));
    const yakinMac = liste
      .filter((m) => {
        if (String(m.status || "NS").toUpperCase() !== "NS" || !m.kickoffISO) return false;
        const fark = new Date(m.kickoffISO).getTime() - simdi;
        return fark > 0 && fark <= YAKIN_MS;
      })
      .sort((a, b) => new Date(a.kickoffISO!).getTime() - new Date(b.kickoffISO!).getTime())[0];

    const secilen = canliMac || yakinMac || null;
    setMac(secilen);
    setCanli(!!canliMac);
    if (!canliMac) { setYaris(null); return; }

    const r = await apiJson(`/api/rt/match-race?fixtureId=${encodeURIComponent(canliMac.fixtureId)}`)
      .catch(() => null);
    if (!r?.ok) return;
    setYaris(r as Yaris);

    /* Sıra yükseldiyse rozet + titreşim — YALNIZ o turda. Rozet bir sonraki
     * tazelemede kalkar: 20 dk sonra hâlâ "↑2" yazması yanıltıcı olurdu.
     * Aynı maçta ölçülür; maç değişince karşılaştırma yok. */
    const sira = Number(r?.me?.rank);
    const once = oncekiSira.current;
    if (Number.isFinite(sira) && sira > 0) {
      const yukseldi = !!once && once.fid === canliMac.fixtureId && sira < once.rank;
      setYukselis(yukseldi ? once!.rank - sira : 0);
      if (yukseldi) titret("gol");
      oncekiSira.current = { fid: canliMac.fixtureId, rank: sira };
    }
  }, [uid]);

  usePolling(yukle, mac ? (canli ? 30_000 : 60_000) : 120_000);

  /* Canlı noktası: yumuşak nabız. */
  const nabiz = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!canli) return;
    const dongu = Animated.loop(Animated.sequence([
      Animated.timing(nabiz, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(nabiz, { toValue: 0, duration: 700, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]));
    dongu.start();
    return () => dongu.stop();
  }, [canli, nabiz]);

  if (!mac) return null;

  const git = () => router.push({ pathname: "/match-race/[fixtureId]", params: { fixtureId: mac.fixtureId, userId: uid } } as any);
  const skor = yaris?.state?.score || mac.score || null;
  const dakika = yaris?.state?.minute;
  const ben = yaris?.me || null;
  const toplam = Number(yaris?.totalPlayers) || 0;

  if (!canli) {
    const dk = mac.kickoffISO
      ? Math.max(1, Math.round((new Date(mac.kickoffISO).getTime() - Date.now()) / 60_000))
      : null;
    return (
      <Basinc onPress={git} scaleTo={0.98}>
        <View style={[parca.kart, s.kart]} accessibilityRole="button">
          <Text style={[s.etiket, { color: YESIL }]}>
            ⏱ {dk != null ? t("raceStartsIn", { m: dk }) : t("raceSoon")}
          </Text>
          <Text style={s.takimlar} numberOfLines={1}>{mac.home || "?"} – {mac.away || "?"}</Text>
          <Text style={[parca.baglanti, s.baglanti, { color: YESIL }]}>{t("raceSeeRivals")} ›</Text>
        </View>
      </Basinc>
    );
  }

  return (
    <Basinc onPress={git} scaleTo={0.98}>
      <View style={[parca.kart, s.kart, s.canliKart]} accessibilityRole="button">
        <View style={s.ustSatir}>
          <Animated.View style={[s.nokta, { opacity: nabiz.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }]} />
          <Text style={[s.etiket, { color: KIRMIZI }]}>
            {t("raceLiveTitle")}{typeof dakika === "number" ? ` · ${dakika}'` : ""}
          </Text>
        </View>

        <View style={s.skorSatiri}>
          <Text style={s.takim} numberOfLines={1}>{mac.home || "?"}</Text>
          <Text style={s.skor}>{skor ? `${skor.home} – ${skor.away}` : "– : –"}</Text>
          <Text style={[s.takim, { textAlign: "right" }]} numberOfLines={1}>{mac.away || "?"}</Text>
        </View>

        {ben && Number(ben.rank) > 0 ? (
          <View style={s.siraSatiri}>
            <Text style={s.sira}>
              {t("raceYourRank", { r: ben.rank, n: toplam || "?" })}
            </Text>
            {yukselis > 0 && <Text style={s.yukselis}>↑{yukselis}</Text>}
            <Text style={[s.durum, { color: ben.inRace ? YESIL : METIN_SOLUK }]}>
              {ben.inRace ? t("raceStillIn") : t("raceOut")}
            </Text>
          </View>
        ) : (
          <Text style={s.durum}>{t("raceLoading")}</Text>
        )}

        <View style={s.dugme}>
          <Text style={s.dugmeYazi}>{t("raceWatch")} ›</Text>
        </View>
      </View>
    </Basinc>
  );
}

const s = StyleSheet.create({
  kart: { gap: 8 },
  canliKart: { borderWidth: 1.5, borderColor: "#ef444466" },
  ustSatir: { flexDirection: "row", alignItems: "center", gap: 8 },
  nokta: { width: 10, height: 10, borderRadius: 5, backgroundColor: KIRMIZI },
  etiket: { fontSize: 13, fontWeight: "900", letterSpacing: 0.5 },
  takimlar: { color: METIN_ANA, fontSize: 18, fontWeight: "800" },
  skorSatiri: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2 },
  takim: { flex: 1, color: METIN_IKINCIL, fontSize: 15, fontWeight: "700" },
  skor: { color: METIN_ANA, fontSize: 30, fontWeight: "900", minWidth: 90, textAlign: "center" },
  siraSatiri: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  sira: { color: METIN_ANA, fontSize: 17, fontWeight: "900" },
  yukselis: {
    color: DUGME_YAZISI, backgroundColor: YESIL, fontSize: 13, fontWeight: "900",
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: "hidden",
  },
  durum: { color: METIN_IKINCIL, fontSize: 13, fontWeight: "700" },
  baglanti: { marginTop: 2 },
  dugme: {
    marginTop: 6, backgroundColor: IC_YUZEY, borderRadius: 999,
    paddingVertical: 12, alignItems: "center",
  },
  dugmeYazi: { color: METIN_ANA, fontSize: 15, fontWeight: "900" },
});
