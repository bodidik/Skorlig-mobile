import React from "react";
import { StyleSheet } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";

/**
 * SVG tabanlı gradient arka plan — mutlak konumla ebeveynini doldurur.
 *
 * ⚠️ NEDEN SVG: expo-linear-gradient yerel modül ister ve yeni EAS build
 * gerektirir; react-native-svg zaten kurulu. Ebeveyne overflow:"hidden" ve
 * borderRadius ver, gradient köşelere taşmasın.
 */
type Props = {
  renkler: readonly [string, string];
  yon?: "dikey" | "yatay" | "capraz";
};

let sayac = 0;

export default function GradyanZemin({ renkler, yon = "capraz" }: Props) {
  // Aynı ekranda birden çok örnek olunca id çakışması yanlış rengi
  // gösterebiliyor (react-native-svg id'leri global çözüyor) — benzersiz id.
  const id = React.useRef(`gz${++sayac}`).current;
  const [x2, y2] = yon === "dikey" ? ["0", "1"] : yon === "yatay" ? ["1", "0"] : ["1", "1"];
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2={x2} y2={y2}>
          <Stop offset="0" stopColor={renkler[0]} />
          <Stop offset="1" stopColor={renkler[1]} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}
