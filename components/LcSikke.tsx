/**
 * LC SİKKESİ — LC tutarlarının yanında duran altın sikke simgesi.
 *
 * KULLANICI KARARI (2026-09-30): "LC için bir para, altın vs resmi, imgesi
 * koyalım. Görsellik açısından." Seçenek: altın sikke.
 *
 * ⚠️ OyunSanati.tsx başlığındaki "para yığını/jeton çizilmiyor (IARC)" kararı
 * BİLİNEREK esnetildi: TEK sikke, yığın/pırıltı/oran yok; LC oyun içi puan
 * birimi olarak kalıyor (satın alınan değil kazanılan). Play IARC anketinde
 * "simüle kumar" sorusunun cevabı bu simgeyle değişmiyor — değişirse bu
 * bileşen tek yerden kaldırılır.
 *
 * ⚠️ DÜZ RENK + tekil gradyan kimliği (react-native-svg sekiz haneli rengin
 * saydamlığını atıyor; aynı kimlik iki örnekte çakışıyor — OyunSanati notları).
 * Erişilebilirlik: süs — yanındaki metin zaten "LC" diyor.
 */

import React, { useRef } from "react";
import Svg, { Circle, Defs, LinearGradient, Stop, Text as SvgText } from "react-native-svg";

let sayac = 0;

export default function LcSikke({ boyut = 16 }: { boyut?: number }) {
  const id = useRef(`lcSikke${++sayac}`).current;
  const yazi = boyut >= 14;
  return (
    <Svg
      width={boyut}
      height={boyut}
      viewBox="0 0 32 32"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#fde68a" />
          <Stop offset="0.55" stopColor="#f59e0b" />
          <Stop offset="1" stopColor="#b45309" />
        </LinearGradient>
      </Defs>
      <Circle cx="16" cy="16" r="15" fill="#92400e" />
      <Circle cx="16" cy="16" r="13.5" fill={`url(#${id})`} />
      {/* çentikli kenar */}
      <Circle cx="16" cy="16" r="12.2" fill="none" stroke="#fef3c7" strokeWidth="1" strokeDasharray="1.6 1.6" />
      <Circle cx="16" cy="16" r="9.8" fill="none" stroke="#b45309" strokeWidth="1" />
      {yazi && (
        <SvgText x="16" y="20.2" fontSize="10.5" fontWeight="900" fill="#78350f" textAnchor="middle">
          LC
        </SvgText>
      )}
    </Svg>
  );
}
