import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
import { durakRengi } from "../lib/oyunMerkezi";

/**
 * SVG tabanlı gradient arka plan — mutlak konumla ebeveynini doldurur.
 *
 * ⚠️ NEDEN SVG: expo-linear-gradient yerel modül ister ve yeni EAS build
 * gerektirir; react-native-svg zaten kurulu. Ebeveyne overflow:"hidden" ve
 * borderRadius ver, gradient köşelere taşmasın.
 *
 * ⚠️ SAYDAMLIK `stopOpacity` İLE (2026-09-17, v35 cihazda ölçüldü):
 * react-native-svg'nin yerel yolu `#rrggbbaa` rengin saydamlığını ATIYOR ve
 * yerine stopOpacity'yi (varsayılan 1) koyuyor — `#a3e6352a` telefonda düz
 * limon blok çizildi, web'de soluk ton. `durakRengi` sekiz haneli rengi
 * `stopColor` + `stopOpacity`ye ayırıyor; iki platform aynı çiziyor.
 * ⚠️ Yine de METİN TAŞIYAN zeminde saydam gradyan kullanma: bkz.
 * lib/oyunMerkezi.ts başlığı.
 *
 * ⚠️ BOYUT ÖLÇÜLEREK VERİLİYOR (2026-09-17, emülatörde ölçüldü). Svg'ye
 * `absoluteFill` + "%100" verilince Android'de gradyan kartı TAMAMEN
 * kaplamıyordu: marka bandında renk bandın ortasında keskin bir yatay
 * kenarla bitiyordu (v35 cihaz görüntüsünde kartlarda da). Kap önce ölçülüyor,
 * Svg ve dikdörtgen o sayılarla çiziliyor; kart büyüyünce onLayout yeniden
 * ölçüyor. Ölçü gelene kadar hiçbir şey çizilmiyor (yarım gradyan yerine
 * kartın düz zemini).
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
  const bas = durakRengi(renkler[0]);
  const son = durakRengi(renkler[1]);
  const [olcu, setOlcu] = useState<{ g: number; y: number } | null>(null);
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setOlcu((o) => (o && o.g === width && o.y === height ? o : { g: width, y: height }));
      }}
    >
      {olcu && olcu.g > 0 && olcu.y > 0 ? (
        <Svg width={olcu.g} height={olcu.y}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2={x2} y2={y2}>
              <Stop offset="0" stopColor={bas.renk} stopOpacity={bas.opaklik} />
              <Stop offset="1" stopColor={son.renk} stopOpacity={son.opaklik} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={olcu.g} height={olcu.y} fill={`url(#${id})`} />
        </Svg>
      ) : null}
    </View>
  );
}
