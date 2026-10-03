/**
 * BİRİKİM KARTI — Benimkiler'in tepesi (2026-10-03).
 *
 * Kullanıcı: "10 puan varsa alınan 0.7 puanı önce 0.7 olarak, sonra üzerine
 * ekleyip 11.7'yi görselli ekleyelim... birikim gözle görünsün."
 *
 * Akış (yalnız GERÇEK artışta, mantık lib/birikim.ts):
 *   1. eski toplam yazılı, yanında "+0.7" rozeti belirir
 *   2. sayaç eski → yeni sayar, rozet sayının içine akıp söner
 *   3. LC kazancında TEK sikke zıplayıp döner (yığın YOK — IARC kararı,
 *      bkz. LcSikke.tsx başlığı; kullanıcı 2026-10-03'te bu seçeneği seçti)
 *   4. bitince "son görülen" cihaza yazılır (bir daha oynamaz)
 * İlk açılış, harcama ve "hareketi azalt" ayarı → sessiz güncelleme.
 *
 * ⚠️ Kütüphane yok, RN `Animated` yeterli (reanimated kurulu değil).
 */
import React, { useEffect, useRef, useState } from "react";
import { View, Text, Animated, Easing, AccessibilityInfo, type ViewStyle } from "react-native";

type AnimStil = Animated.WithAnimatedObject<ViewStyle>;
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import Colors from "../constants/colors";
import LcSikke from "./LcSikke";
import { lcYaz, puanYaz } from "../lib/lcBicim";
import { farkHesapla, birikimCoz, birikimAnahtari, type Fark } from "../lib/birikim";
import { t, useLang } from "../lib/i18n";

const ALTIN = "#f59e0b";

export default function BirikimKarti({ userId, puan, lc }: {
  userId: string; puan: number | null; lc: number | null;
}) {
  useLang();
  const [gPuan, setGPuan] = useState<number | null>(null);
  const [gLc, setGLc] = useState<number | null>(null);
  const [fark, setFark] = useState<Fark | null>(null);
  const [oynuyor, setOynuyor] = useState(false);

  const sayac = useRef(new Animated.Value(0)).current;
  const rozet = useRef(new Animated.Value(0)).current;
  const sikke = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!userId || puan == null || lc == null) return;
    let alive = true;
    const anahtar = birikimAnahtari(userId);
    (async () => {
      let ham: string | null = null;
      try { ham = await AsyncStorage.getItem(anahtar); } catch { /* depo yoksa ilk açılış */ }
      let azalt = false;
      try { azalt = await AccessibilityInfo.isReduceMotionEnabled(); } catch {}
      if (!alive) return;
      const onceki = birikimCoz(ham);
      const f = farkHesapla(onceki, puan, lc);
      const kaydet = () => { AsyncStorage.setItem(anahtar, JSON.stringify(f.yeni)).catch(() => {}); };

      if (!f.canlandir || azalt || !onceki) {
        setFark(f); setGPuan(f.yeni.puan); setGLc(f.yeni.lc); setOynuyor(false);
        kaydet();
        return;
      }

      /* 1 — eski değer + rozet */
      setFark(f); setGPuan(onceki.puan); setGLc(onceki.lc); setOynuyor(true);
      sayac.setValue(0); rozet.setValue(0); sikke.setValue(0);
      const id = sayac.addListener(({ value }) => {
        setGPuan(onceki.puan + (f.yeni.puan - onceki.puan) * value);
        setGLc(onceki.lc + (f.yeni.lc - onceki.lc) * value);
      });

      Animated.sequence([
        Animated.spring(rozet, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
        Animated.delay(450),
        /* 2-3 — sayaç, rozetin sayıya akışı, sikkenin zıplaması birlikte */
        Animated.parallel([
          Animated.timing(sayac, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
          Animated.timing(rozet, { toValue: 2, duration: 1100, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.timing(sikke, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]),
      ]).start(({ finished }) => {
        sayac.removeListener(id);
        if (!alive) return;
        setGPuan(f.yeni.puan); setGLc(f.yeni.lc); setOynuyor(false);
        if (finished) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          kaydet();
        }
      });
    })();
    return () => { alive = false; sayac.stopAnimation(); rozet.stopAnimation(); sikke.stopAnimation(); };
  }, [userId, puan, lc, sayac, rozet, sikke]);

  if (!userId || gPuan == null || gLc == null || !fark) return null;

  /* rozet: 0 görünmez → 1 yerinde → 2 sayıya akıp söner */
  const rozetStil: AnimStil = {
    opacity: rozet.interpolate({ inputRange: [0, 0.3, 1, 1.7, 2], outputRange: [0, 1, 1, 0.6, 0] }),
    transform: [
      { scale: rozet.interpolate({ inputRange: [0, 1, 2], outputRange: [0.4, 1, 0.5] }) },
      { translateX: rozet.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 0, -30] }) },
    ],
  };
  /* tek sikke: yukarı zıplar, bir tur döner, yerine oturur */
  const sikkeStil: AnimStil | null = fark.lcArti > 0 ? {
    transform: [
      { translateY: sikke.interpolate({ inputRange: [0, 0.35, 0.7, 0.85, 1], outputRange: [0, -14, 0, -4, 0] }) },
      { rotateY: sikke.interpolate({ inputRange: [0, 0.7, 1], outputRange: ["0deg", "360deg", "360deg"] }) },
      { scale: sikke.interpolate({ inputRange: [0, 0.35, 1], outputRange: [1, 1.25, 1] }) },
    ],
  } : null;

  return (
    <View
      accessible
      accessibilityLabel={t("birikimA11y", { puan: puanYaz(fark.yeni.puan), lc: lcYaz(fark.yeni.lc) })}
      style={{
        flexDirection: "row", gap: 12, backgroundColor: Colors.card, borderRadius: 16,
        borderWidth: 1, borderColor: oynuyor ? "#f59e0b88" : Colors.cardBorder,
        paddingVertical: 12, paddingHorizontal: 14,
      }}
    >
      {/* PUAN */}
      <View style={{ flex: 1 }}>
        <Text style={{ color: Colors.mutedOnCard, fontSize: 11, fontWeight: "800", letterSpacing: 0.6 }}>
          ⭐ {t("birikimPuan")}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
          <Text style={{ color: oynuyor ? Colors.win : Colors.text, fontSize: 30, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
            {puanYaz(gPuan)}
          </Text>
          {oynuyor && fark.puanArti > 0 && (
            <Animated.View style={[{
              paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
              backgroundColor: "#14532d", borderWidth: 1, borderColor: "#22c55e",
            }, rozetStil]}>
              <Text style={{ color: "#4ade80", fontWeight: "900", fontSize: 14 }}>+{puanYaz(fark.puanArti)}</Text>
            </Animated.View>
          )}
        </View>
      </View>

      <View style={{ width: 1, backgroundColor: Colors.cardInner }} />

      {/* LC — tek sikke + sayaç */}
      <View style={{ flex: 1 }}>
        <Text style={{ color: Colors.mutedOnCard, fontSize: 11, fontWeight: "800", letterSpacing: 0.6 }}>
          {t("birikimLc")}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
          <Animated.View style={sikkeStil}>
            <LcSikke boyut={26} />
          </Animated.View>
          <Text style={{ color: oynuyor && fark.lcArti > 0 ? ALTIN : Colors.text, fontSize: 26, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
            {lcYaz(gLc)}
          </Text>
          {oynuyor && fark.lcArti > 0 && (
            <Animated.View style={rozetStil}>
              <Text style={{ color: ALTIN, fontWeight: "900", fontSize: 13 }}>+{lcYaz(fark.lcArti)}</Text>
            </Animated.View>
          )}
        </View>
      </View>
    </View>
  );
}
