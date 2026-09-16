/**
 * OYUN MODU ÇİZİMLERİ — emoji yerine, modun kimliğini taşıyan SVG sahneler.
 *
 * ⚠️ KULLANICI BİLDİRİMİ (2026-09-16): "Görseller yetersiz. Tek maç, haftalık,
 * mini turnuva vs yazıları ve görünümleri yetersiz. Basit görünüm devasa
 * uygulamayı temsil edemiyor." Mod kartlarının tek görseli 32px bir emojiydi;
 * emoji her platformda farklı çiziliyor (Android, iOS, web üç ayrı top) ve
 * renk kimliği taşımıyor.
 *
 * ⚠️ NEDEN SVG, GÖRSEL DOSYASI DEĞİL: react-native-svg zaten kurulu (yeni
 * yerel modül = yeni EAS derlemesi gerekmez), çizimler her yoğunlukta keskin,
 * paket boyutu birkaç KB. Metin TAŞIMIYORLAR — dil değişince yeniden çizim
 * gerekmez, kontrast eşiği de metne değil çizime uygulanmaz.
 *
 * ⚠️ BAHİS ÇAĞRIŞIMI YOK. Para yığını, jeton, zar, oran tablosu çizilmiyor
 * (IARC "simüle edilmiş şans oyunu" değerlendirmesi, bkz. OyunMerkezi başlığı).
 * Havuz bile jetonla değil "paylaşım" ağıyla anlatılıyor.
 *
 * ⚠️ GRADYAN KİMLİKLERİ ÖRNEK BAŞINA TEKİL. react-native-svg `id`leri belge
 * genelinde çözüyor; aynı ekranda iki kart aynı kimliği kullanırsa ikincisi
 * birincinin rengini alır (GradyanZemin'de yaşandı).
 */

import React, { useRef } from "react";
import Svg, {
  Circle, Defs, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop,
} from "react-native-svg";
import { MOD_RENGI } from "../lib/oyunMerkezi";

let sayac = 0;
function useKimlik(onek: string): (ad: string) => string {
  const kok = useRef(`${onek}${++sayac}`).current;
  return (ad: string) => `${kok}-${ad}`;
}

type Boyut = { boyut?: number };

/** Işıltı: çizimin arkasında modun renginden yumuşak hale. */
function Hale({ id, renk }: { id: string; renk: string }) {
  return (
    <>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={renk} stopOpacity={0.55} />
          <Stop offset="1" stopColor={renk} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx="60" cy="60" r="58" fill={`url(#${id})`} />
    </>
  );
}

/** Pırıltı yıldızı — dört uçlu. */
function Pirilti({ x, y, r, renk }: { x: number; y: number; r: number; renk: string }) {
  const d = `M${x} ${y - r} Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y} Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r} Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y} Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z`;
  return <Path d={d} fill={renk} />;
}

/**
 * HAFTALIK TAHMİN — sekiz yuvalı kupon. Yuvaların bir kısmı işaretli: kuponun
 * "maç maç doldurulan" bir oyun olduğunu yazısız anlatıyor.
 */
export function KuponSanati({ boyut = 112 }: Boyut) {
  const k = useKimlik("ks");
  const yuvalar = [0, 1, 2, 3, 4, 5, 6, 7];
  const dolu = new Set([0, 1, 3, 4, 6]);
  return (
    <Svg width={boyut} height={boyut} viewBox="0 0 120 120">
      <Hale id={k("hale")} renk={MOD_RENGI.kupon} />
      <Defs>
        <LinearGradient id={k("bilet")} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#d9f99d" />
          <Stop offset="1" stopColor="#65a30d" />
        </LinearGradient>
      </Defs>
      {/* Arkadaki ikinci kupon — derinlik */}
      <G transform="rotate(14 60 60)">
        <Rect x="36" y="16" width="52" height="86" rx="8" fill="#365314" opacity={0.85} />
      </G>
      <G transform="rotate(-10 60 60)">
        <Rect x="30" y="14" width="58" height="92" rx="9" fill={`url(#${k("bilet")})`} />
        {/* Yırtma çentikleri */}
        <Circle cx="30" cy="40" r="5" fill="#0f1a0a" />
        <Circle cx="88" cy="40" r="5" fill="#0f1a0a" />
        <Line x1="37" y1="40" x2="81" y2="40" stroke="#1a2e05" strokeWidth={1.4} strokeDasharray="3 3" />
        {/* Başlık şeridi: 1 X 2 */}
        <Rect x="38" y="22" width="11" height="9" rx="2.5" fill="#1a2e05" />
        <Rect x="53.5" y="22" width="11" height="9" rx="2.5" fill="#1a2e05" opacity={0.55} />
        <Rect x="69" y="22" width="11" height="9" rx="2.5" fill="#1a2e05" />
        {/* Sekiz maç yuvası, iki sütun */}
        {yuvalar.map((i) => {
          const sutun = i % 2;
          const satir = Math.floor(i / 2);
          const cx = 48 + sutun * 22;
          const cy = 53 + satir * 14;
          return dolu.has(i)
            ? <Circle key={i} cx={cx} cy={cy} r="4.6" fill="#1a2e05" />
            : <Circle key={i} cx={cx} cy={cy} r="4" fill="none" stroke="#1a2e05" strokeWidth={1.6} />;
        })}
      </G>
      <Pirilti x={96} y={22} r={7} renk="#ecfccb" />
      <Pirilti x={20} y={92} r={4.5} renk="#bef264" />
    </Svg>
  );
}

/** TEK MAÇ — saha çizgileri üstünde hızla gelen top. */
export function TekMacSanati({ boyut = 88 }: Boyut) {
  const k = useKimlik("tm");
  return (
    <Svg width={boyut} height={boyut} viewBox="0 0 120 120">
      <Hale id={k("hale")} renk={MOD_RENGI.tek} />
      <Defs>
        <LinearGradient id={k("saha")} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#16a34a" />
          <Stop offset="1" stopColor="#14532d" />
        </LinearGradient>
        <RadialGradient id={k("top")} cx="38%" cy="32%" r="70%">
          <Stop offset="0" stopColor="#ffffff" />
          <Stop offset="1" stopColor="#cbd5e1" />
        </RadialGradient>
      </Defs>
      {/* Perspektif saha */}
      <Path d="M18 104 L38 70 L82 70 L102 104 Z" fill={`url(#${k("saha")})`} />
      <Path d="M28 87 L92 87" stroke="#bbf7d0" strokeWidth={1.2} opacity={0.7} />
      <Path d="M45 104 L50 92 L70 92 L75 104" stroke="#bbf7d0" strokeWidth={1.2} fill="none" opacity={0.7} />
      {/* Hız çizgileri */}
      <Line x1="14" y1="40" x2="34" y2="46" stroke="#86efac" strokeWidth={3} strokeLinecap="round" opacity={0.8} />
      <Line x1="10" y1="54" x2="32" y2="56" stroke="#86efac" strokeWidth={3} strokeLinecap="round" opacity={0.55} />
      <Line x1="18" y1="66" x2="36" y2="64" stroke="#86efac" strokeWidth={3} strokeLinecap="round" opacity={0.35} />
      {/* Top */}
      <Circle cx="64" cy="48" r="24" fill={`url(#${k("top")})`} />
      <Path d="M64 38 L73 44.5 L69.5 55 L58.5 55 L55 44.5 Z" fill="#0f172a" />
      <Path d="M64 38 L64 26.5 M73 44.5 L84 41 M69.5 55 L76 64.5 M58.5 55 L52 64.5 M55 44.5 L44 41"
        stroke="#0f172a" strokeWidth={1.8} />
      <Path d="M52 30 Q58 26 64 26.5 L58 30 Z" fill="#0f172a" opacity={0.9} />
      <Path d="M84 41 Q88 48 86 55 L80 50 Z" fill="#0f172a" opacity={0.9} />
      <Path d="M44 41 Q40 48 42 55 L47 50 Z" fill="#0f172a" opacity={0.9} />
      <Pirilti x={98} y={24} r={6} renk="#dcfce7" />
    </Svg>
  );
}

/** MİNİ TURNUVA — eleme ağacının tepesinde kupa. */
export function MiniSanati({ boyut = 84 }: Boyut) {
  const k = useKimlik("mn");
  return (
    <Svg width={boyut} height={boyut} viewBox="0 0 120 120">
      <Hale id={k("hale")} renk={MOD_RENGI.mini} />
      <Defs>
        <LinearGradient id={k("kupa")} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#fde68a" />
          <Stop offset="1" stopColor="#d97706" />
        </LinearGradient>
      </Defs>
      {/* Eleme ağacı */}
      <G stroke="#7dd3fc" strokeWidth={2.4} fill="none" strokeLinecap="round" opacity={0.85}>
        <Path d="M10 30 H22 V48 H32" />
        <Path d="M10 66 H22 V48" />
        <Path d="M110 30 H98 V48 H88" />
        <Path d="M110 66 H98 V48" />
      </G>
      <Circle cx="10" cy="30" r="3.5" fill="#bae6fd" />
      <Circle cx="10" cy="66" r="3.5" fill="#bae6fd" />
      <Circle cx="110" cy="30" r="3.5" fill="#bae6fd" />
      <Circle cx="110" cy="66" r="3.5" fill="#bae6fd" />
      {/* Kupa */}
      <Path d="M38 22 H82 V40 Q82 64 60 70 Q38 64 38 40 Z" fill={`url(#${k("kupa")})`} />
      <Path d="M38 28 Q24 28 26 42 Q28 54 42 56" stroke="#f59e0b" strokeWidth={4.5} fill="none" />
      <Path d="M82 28 Q96 28 94 42 Q92 54 78 56" stroke="#f59e0b" strokeWidth={4.5} fill="none" />
      <Path d="M46 28 V42 Q46 56 58 62" stroke="#fef3c7" strokeWidth={3} fill="none" opacity={0.7} strokeLinecap="round" />
      <Rect x="55" y="70" width="10" height="14" fill="#b45309" />
      <Rect x="42" y="84" width="36" height="9" rx="3" fill="#92400e" />
      <Rect x="36" y="93" width="48" height="10" rx="3" fill="#78350f" />
      <Pirilti x={60} y={12} r={6} renk="#fef9c3" />
      <Pirilti x={96} y={96} r={4.5} renk="#bae6fd" />
    </Svg>
  );
}

/** 1987GS — iki renkli arma kalkanı ve yıldız (topluluk kimliği, kulüp logosu DEĞİL). */
export function GsSanati({ boyut = 84 }: Boyut) {
  const k = useKimlik("gs");
  return (
    <Svg width={boyut} height={boyut} viewBox="0 0 120 120">
      <Hale id={k("hale")} renk={MOD_RENGI.gs1987} />
      <Defs>
        <LinearGradient id={k("sol")} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#ef4444" />
          <Stop offset="1" stopColor="#991b1b" />
        </LinearGradient>
        <LinearGradient id={k("sag")} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#fde047" />
          <Stop offset="1" stopColor="#ca8a04" />
        </LinearGradient>
      </Defs>
      <Path d="M60 12 L96 24 V56 Q96 88 60 108 Z" fill={`url(#${k("sag")})`} />
      <Path d="M60 12 L24 24 V56 Q24 88 60 108 Z" fill={`url(#${k("sol")})`} />
      <Path d="M60 12 L96 24 V56 Q96 88 60 108 Q24 88 24 56 V24 Z" fill="none" stroke="#fff7ed" strokeWidth={3} />
      <Path d="M60 38 L65.5 50 L78 51 L68.5 59 L71.5 72 L60 65 L48.5 72 L51.5 59 L42 51 L54.5 50 Z"
        fill="#fff7ed" />
      <Pirilti x={100} y={14} r={6} renk="#fef08a" />
    </Svg>
  );
}

/** DÜELLO — karşı karşıya iki şimşek, ortada çarpışma. */
export function DuelloSanati({ boyut = 84 }: Boyut) {
  const k = useKimlik("dl");
  return (
    <Svg width={boyut} height={boyut} viewBox="0 0 120 120">
      <Hale id={k("hale")} renk={MOD_RENGI.duello} />
      <Circle cx="36" cy="60" r="22" fill="#1d4ed8" />
      <Circle cx="84" cy="60" r="22" fill="#b91c1c" />
      <Circle cx="36" cy="60" r="22" fill="none" stroke="#bfdbfe" strokeWidth={2.5} />
      <Circle cx="84" cy="60" r="22" fill="none" stroke="#fecaca" strokeWidth={2.5} />
      <Path d="M62 30 L50 62 H62 L56 92 L74 54 H62 L70 30 Z" fill="#fbbf24" stroke="#fef3c7" strokeWidth={2} />
    </Svg>
  );
}

/** MAÇ HAVUZU — doğru bilenlerin paylaştığı ortak merkez (jeton çizilmez). */
export function HavuzSanati({ boyut = 84 }: Boyut) {
  const k = useKimlik("hv");
  const uclar: Array<[number, number]> = [[20, 34], [100, 34], [20, 86], [100, 86], [60, 12]];
  return (
    <Svg width={boyut} height={boyut} viewBox="0 0 120 120">
      <Hale id={k("hale")} renk={MOD_RENGI.havuz} />
      {uclar.map(([x, y], i) => (
        <Line key={`c${i}`} x1="60" y1="62" x2={x} y2={y} stroke="#c4b5fd" strokeWidth={2.4} opacity={0.8} />
      ))}
      {uclar.map(([x, y], i) => (
        <Circle key={`u${i}`} cx={x} cy={y} r="8" fill="#6d28d9" stroke="#ede9fe" strokeWidth={2} />
      ))}
      <Circle cx="60" cy="62" r="20" fill="#7c3aed" stroke="#ede9fe" strokeWidth={3} />
      <Path d="M51 62 L58 69 L70 55" stroke="#f5f3ff" strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
