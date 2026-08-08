import React, { useEffect, useRef, useState } from "react";
import { Animated } from "react-native";
import { titret } from "../lib/hisler";

/**
 * SIRALAMA HAREKETİ ÇİPİ — canlı yarış tablosunda ▲2 / ▼1.
 *
 * `delta` işareti: pozitif = YÜKSELDİ (yeşil ▲), negatif = düştü (kırmızı ▼).
 * Yeni delta gelince kayarak girer, kısa süre görünür kalır, kendiliğinden
 * söner — hareket bilgisi geçicidir, tabloyu kalıcı rozetle kirletmez.
 * `benim` satırında yükselince hafif titreşim (tercihe bağlı) — kendi
 * sıçramanı cebinde hissedersin, başkalarınınkini yalnızca görürsün.
 */
type Props = { delta: number | undefined; benim?: boolean };

const GORUNUR_MS = 6000;

export default function SiralamaCipi({ delta, benim }: Props) {
  const anim = useRef(new Animated.Value(0)).current;
  const [aktif, setAktif] = useState<number | null>(null);

  useEffect(() => {
    if (!delta) return;
    setAktif(delta);
    if (benim && delta > 0) titret("hafif");
    anim.setValue(0);
    Animated.sequence([
      Animated.spring(anim, { toValue: 1, speed: 16, bounciness: 10, useNativeDriver: true }),
      Animated.delay(GORUNUR_MS),
      Animated.timing(anim, { toValue: 2, duration: 400, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) setAktif(null); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delta]);

  if (!aktif) return null;
  const yukari = aktif > 0;

  const opacity = anim.interpolate({ inputRange: [0, 0.2, 1, 2], outputRange: [0, 1, 1, 0] });
  const translateY = anim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [yukari ? 8 : -8, 0, yukari ? -4 : 4],
  });

  return (
    <Animated.Text
      style={{
        opacity,
        transform: [{ translateY }],
        color: yukari ? "#22c55e" : "#ef4444",
        fontWeight: "900",
        fontSize: 11,
        marginRight: 6,
      }}
    >
      {yukari ? "▲" : "▼"}{Math.abs(aktif)}
    </Animated.Text>
  );
}
