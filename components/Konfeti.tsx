import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

/**
 * KONFETİ PATLAMASI — tahmin/kazanç anını kutlar.
 *
 * ⚠️ NEDEN VAR: tahmin gönderilince hiçbir şey olmuyordu; "kaydedildi" yazısı
 * bir banka dekontu kadar heyecanlıydı. Kütüphanesiz: 18 parça, her biri kendi
 * açı/hız/renk/dönüşüyle yukarı fırlayıp düşer, 1.4 sn'de biter.
 *
 * Kullanım: görünür olduğu sürece bir kez oynar; `anahtar` değişince yeniden.
 */
const RENKLER = ["#f59e0b", "#a3e635", "#38bdf8", "#f43f5e", "#fb923c", "#e2e8f0"];
const PARCA = 18;

type Props = { anahtar?: string | number };

export default function Konfeti({ anahtar = 0 }: Props) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    t.setValue(0);
    Animated.timing(t, {
      toValue: 1,
      duration: 1400,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [anahtar, t]);

  // Parça parametreleri sabit tohumla üretilir (render'lar arası titremesin).
  const parcalar = useRef(
    Array.from({ length: PARCA }, (_, i) => {
      const aci = (i / PARCA) * Math.PI * 2 + 0.4;
      const hiz = 60 + (i % 5) * 22;
      return {
        renk: RENKLER[i % RENKLER.length],
        dx: Math.cos(aci) * hiz,
        yukselis: -40 - (i % 4) * 25,
        dusus: 90 + (i % 3) * 40,
        don: (i % 2 ? 1 : -1) * (180 + i * 20),
        boy: 6 + (i % 3) * 3,
      };
    })
  ).current;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {parcalar.map((p, i) => {
        const tx = t.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] });
        const ty = t.interpolate({
          inputRange: [0, 0.35, 1],
          outputRange: [0, p.yukselis, p.dusus],
        });
        const rot = t.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${p.don}deg`] });
        const op = t.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] });
        return (
          <Animated.View
            key={i}
            style={[
              s.parca,
              {
                width: p.boy,
                height: p.boy * 1.6,
                backgroundColor: p.renk,
                opacity: op,
                transform: [{ translateX: tx }, { translateY: ty }, { rotate: rot }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  parca: {
    position: "absolute",
    top: "40%",
    left: "50%",
    borderRadius: 2,
  },
});
