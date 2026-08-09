import React, { useEffect, useRef } from "react";
import { Animated, View, ViewStyle, StyleProp } from "react-native";

/**
 * İSKELET YÜKLEME — içerik gelene kadar nabız atan gri bloklar.
 *
 * ⚠️ NEDEN VAR: her yükleme ham ActivityIndicator idi. Spinner "bekle" der;
 * iskelet "geliyor" der ve gelecek içeriğin şeklini önceden gösterir —
 * algılanan hız farkı büyüktür. Kütüphanesiz: opaklık nabzı yeterli.
 */
export function IskeletBlok({ style }: { style?: StyleProp<ViewStyle> }) {
  const op = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const dongu = Animated.loop(
      Animated.sequence([
        Animated.timing(op, { toValue: 0.7, duration: 700, useNativeDriver: true }),
        Animated.timing(op, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ])
    );
    dongu.start();
    return () => dongu.stop();
  }, [op]);
  return (
    <Animated.View
      style={[{ backgroundColor: "#334155", borderRadius: 6, opacity: op }, style]}
    />
  );
}

/** Maç kartı biçiminde hazır iskelet: üst satır + iki takım + üç buton. */
export function MacKartiIskeleti() {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <IskeletBlok style={{ width: 90, height: 12 }} />
        <IskeletBlok style={{ width: 48, height: 12 }} />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <IskeletBlok style={{ flex: 1, height: 16 }} />
        <IskeletBlok style={{ width: 20, height: 16 }} />
        <IskeletBlok style={{ flex: 1, height: 16 }} />
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <IskeletBlok style={{ flex: 1, height: 40, borderRadius: 10 }} />
        <IskeletBlok style={{ flex: 1, height: 40, borderRadius: 10 }} />
        <IskeletBlok style={{ flex: 1, height: 40, borderRadius: 10 }} />
      </View>
    </View>
  );
}

export default IskeletBlok;
