import React, { useEffect, useRef, useState } from "react";
import { View, Text, Animated, Easing, StyleSheet } from "react-native";
import { t, useLang } from "../lib/i18n";
import Colors from "../constants/colors";
import { puanYaz } from "../lib/lcBicim";
import { gorunenAd } from "../lib/gorunenAd";
import { podyumDegistiMi, sayacKaresi, girisGecikmesi } from "../lib/yarisHareketi";

/**
 * YARIŞ PODYUMU — maç ekranının kahramanı.
 *
 * ⚠️ KULLANICI İSTEĞİ (2026-09-13): "tahmin sıralama yarışının daha göze
 * çarpan şekilde sunulması ve sayfaya girince canlı değişimlerin göze hitap
 * eder değişimi... kişinin dakikalarca o sayfayı takip edeceğini unutmayalım."
 *
 * ⚠️ GİRİŞTEKİ HAREKET SAHTE DEĞİL, SAHNELENMİŞ. Ekranın kendi kuralı
 * "açılışta yapay hareket olmasın" diyor ve HAKLI: önceki anlık görüntü
 * yokken her satıra ▲▼ basmak olmayan bir yükselişi göstermek olurdu.
 * Buradaki hareket bir DEĞİŞİM iddiası taşımıyor — duran tabloyu açıyor:
 * basamaklar sırayla belirir, "yarışta kalan" sayacı 0'dan gerçek değere
 * sayar. Bilgi aynı; yalnızca göze görünür hale geliyor.
 *
 * ⚠️ SONRAKİ YOKLAMALARDA YALNIZCA GERÇEK DEVİR TESLİM PARLIYOR.
 * `podyumDegistiMi` ilk üçün KİMLİĞİNE bakıyor, puanına değil: sayı her 20
 * saniyede oynuyor ve her oynamada parlatmak ekranı yanıp sönen bir şeye
 * çevirir — o zaman gerçek devir teslim fark edilmez olur.
 *
 * ⚠️ SIRALAMA ANAHTARI YAZIYOR. Yarışın sırası puana DEĞİL, skor mesafesine
 * göre (sunucu: inRace → distance → points). Puanı yüksek biri daha altta
 * görünebiliyor; anahtarı yazmayan bir podyum "keyfî" görünür — bu depoda
 * aynı kusur `rating`/`ratingRaw` ile ölçülmüştü.
 */

export type PodyumSatiri = {
  userId: string;
  displayName?: string | null;
  rank: number;
  points: number;
  inRace: boolean;
  distance?: number | null;
};

type Props = {
  satirlar: readonly PodyumSatiri[];
  /** Yarışta kalan / toplam — sayaç bunları sayıyor. */
  yaristaKalan: number;
  toplam: number;
  /** Kendi kimliğim — podyumdaysam vurgulanıyor. */
  benimKimligim?: string;
  /** Maç canlı mı (bittiyse nabız atmaz). */
  canli?: boolean;
};

const MADALYA = ["🥇", "🥈", "🥉"];
const SAYAC_MS = 900;

export default function YarisPodyumu({
  satirlar, yaristaKalan, toplam, benimKimligim, canli,
}: Props) {
  useLang();
  const ilkUc = satirlar.slice(0, 3);

  /* ---- Giriş sahnesi: bir kez, ilk veri geldiğinde ---- */
  const [acildi, setAcildi] = useState(false);
  const giris = useRef(new Animated.Value(0)).current;
  const sayacAnim = useRef(new Animated.Value(0)).current;
  const [sayac, setSayac] = useState(0);

  /* Sayaç animasyonu bittikten sonra gelen güncellemeler doğrudan yazılır —
   * her yoklamada yeniden saymak gözü yorar ve sayıyı okunmaz kılar. */
  const sayacBitti = useRef(false);
  const hedefRef = useRef(yaristaKalan);
  hedefRef.current = yaristaKalan;


  useEffect(() => {
    if (acildi || ilkUc.length === 0) return;
    setAcildi(true);
    Animated.timing(giris, {
      toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
    /* ⚠️ SAYAÇ `useNativeDriver` KULLANAMAZ: yerel sürücü yalnızca dönüşüm ve
     * opaklık taşıyor, METİN değerini değiştiremiyor. Dinleyiciyle JS
     * tarafında sürülüyor ve bitişte tam değere oturuyor (bkz. sayacKaresi). */
    sayacAnim.setValue(0);
    Animated.timing(sayacAnim, {
      toValue: 1, duration: SAYAC_MS, easing: Easing.out(Easing.quad), useNativeDriver: false,
    }).start(() => {
      /* ⚠️ BİTİŞ ZAMANLAYICIYA BIRAKILMIYOR. Önce `setTimeout(SAYAC_MS + 60)`
       * ile yazılmıştı: son kare 1'e tam oturmazsa sayaç gerçek değerin bir
       * eksiğinde DONAR ve sonraki yoklamaya kadar (canlıda 20 sn) orada
       * kalırdı — "24 / 25" diye duran bir sayaç veriyi yanlış söyler.
       * Animasyonun kendi bitişi tek doğru an; değer de ref'ten okunuyor
       * ki bu 900 ms içinde bir yoklama düşerse bayat değere oturmasın. */
      sayacBitti.current = true;
      setSayac(hedefRef.current);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ilkUc.length]);

  useEffect(() => {
    const id = sayacAnim.addListener(({ value }) => {
      if (sayacBitti.current) return;
      setSayac(sayacKaresi(hedefRef.current, value));
    });
    return () => sayacAnim.removeListener(id);
  }, [sayacAnim]);

  const gosterilenSayac = sayacBitti.current ? yaristaKalan : sayac;

  /* ---- Devir teslim parıltısı ---- */
  const oncekiPodyum = useRef<PodyumSatiri[] | null>(null);
  const parilti = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (ilkUc.length === 0) return;
    const onceki = oncekiPodyum.current;
    oncekiPodyum.current = ilkUc.slice();
    if (!podyumDegistiMi(onceki, ilkUc)) return;
    Animated.sequence([
      Animated.timing(parilti, { toValue: 1, duration: 180, useNativeDriver: false }),
      Animated.timing(parilti, { toValue: 0, duration: 700, useNativeDriver: false }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satirlar]);

  /* ---- Canlı nabız: iki yoklama arası ekran ölü görünmesin ---- */
  const nabiz = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!canli) return;
    const dongu = Animated.loop(
      Animated.sequence([
        Animated.timing(nabiz, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(nabiz, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    dongu.start();
    return () => dongu.stop();
  }, [canli, nabiz]);

  if (ilkUc.length === 0) return null;

  const oran = toplam > 0 ? Math.round((yaristaKalan / toplam) * 100) : 0;
  const kenarRengi = parilti.interpolate({
    inputRange: [0, 1], outputRange: [Colors.border, "#f59e0b"],
  });

  return (
    <Animated.View style={[s.kok, { borderColor: kenarRengi }]}>
      <View style={s.ustSatir}>
        <View style={s.baslikKutu}>
          {canli && (
            <Animated.View style={[s.nokta, { opacity: nabiz.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }]} />
          )}
          <Text style={s.baslik}>{t("raceBoardTitle")}</Text>
        </View>
        <Text style={s.sayac}>
          <Text style={s.sayacBuyuk}>{gosterilenSayac}</Text>
          <Text style={s.sayacKucuk}> / {toplam}</Text>
        </Text>
      </View>

      <Text style={s.altBaslik}>{t("raceStillIn")}</Text>

      <View style={s.cubukZemin}>
        <View style={[s.cubuk, { width: `${oran}%` }]} />
      </View>

      {ilkUc.map((r, i) => {
        const benim = !!benimKimligim && r.userId.toLowerCase() === benimKimligim.toLowerCase();
        return (
          <PodyumSatir
            key={r.userId}
            satir={r}
            madalya={MADALYA[i] || `${r.rank}.`}
            benim={benim}
            giris={giris}
            gecikme={girisGecikmesi(i)}
          />
        );
      })}

      {/* ⚠️ SIRALAMA ANAHTARI YAZILI: sıra puana değil skor mesafesine göre.
          Yazmayan bir tablo keyfî görünür. */}
      <Text style={s.ipucu}>{t("raceOrderHint")}</Text>
    </Animated.View>
  );
}

/** Tek podyum basamağı — kademeli girişle belirir. */
function PodyumSatir({
  satir, madalya, benim, giris, gecikme,
}: {
  satir: PodyumSatiri; madalya: string; benim: boolean;
  giris: Animated.Value; gecikme: number;
}) {
  const kendi = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const zaman = setTimeout(() => {
      Animated.spring(kendi, { toValue: 1, speed: 14, bounciness: 6, useNativeDriver: true }).start();
    }, gecikme);
    return () => clearTimeout(zaman);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      style={[
        s.satir,
        benim && s.satirBenim,
        {
          opacity: kendi,
          transform: [{ translateY: kendi.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
        },
      ]}
    >
      <Text style={s.madalya}>{madalya}</Text>
      <Text style={[s.ad, benim && s.adBenim]} numberOfLines={1}>
        {gorunenAd(satir)}{benim ? t("me2") : ""}
      </Text>
      {satir.distance != null && satir.distance < 999 && (
        <Text style={s.mesafe}>Δ{satir.distance}</Text>
      )}
      <Text style={s.durum}>{satir.inRace ? "🟢" : "🔴"}</Text>
      <Text style={s.puan}>{puanYaz(satir.points)}p</Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  kok:        { padding: 14, borderRadius: 16, backgroundColor: "#0b1220",
                borderWidth: 2, gap: 8 },
  ustSatir:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  baslikKutu: { flexDirection: "row", alignItems: "center", gap: 7 },
  nokta:      { width: 8, height: 8, borderRadius: 4, backgroundColor: "#22c55e" },
  baslik:     { color: "#e2e8f0", fontSize: 14, fontWeight: "900", letterSpacing: 0.3 },
  sayac:      { textAlign: "right" },
  sayacBuyuk: { color: "#22c55e", fontSize: 24, fontWeight: "900" },
  sayacKucuk: { color: Colors.muted, fontSize: 13, fontWeight: "700" },
  altBaslik:  { color: Colors.muted, fontSize: 11, marginTop: -4 },
  cubukZemin: { height: 8, borderRadius: 999, backgroundColor: "#1e293b", overflow: "hidden" },
  cubuk:      { height: 8, borderRadius: 999, backgroundColor: "#22c55e" },
  satir:      { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 7,
                paddingHorizontal: 10, borderRadius: 10, backgroundColor: "#020617" },
  satirBenim: { backgroundColor: "#052e16", borderWidth: 1, borderColor: "#22c55e" },
  madalya:    { fontSize: 16, width: 26 },
  /* `minWidth: 0` — kardeşleri sabit genişlikte; olmazsa esnek sütun sıfıra
   * iner ve ad tümüyle kaybolur (bu depoda kayıtlı `flex-1` kusuru). */
  ad:         { flex: 1, minWidth: 0, color: "#fff", fontSize: 13, fontWeight: "700" },
  adBenim:    { fontWeight: "900" },
  mesafe:     { color: "#60a5fa", fontSize: 11, fontWeight: "700" },
  durum:      { fontSize: 11 },
  puan:       { color: "#a3e635", fontSize: 13, fontWeight: "900", minWidth: 46, textAlign: "right" },
  ipucu:      { color: Colors.muted, fontSize: 10, lineHeight: 14 },
});
