import React, { useEffect, useRef, useState } from "react";
import { Animated, Text } from "react-native";
import { t } from "../lib/i18n";
import { golSesiCal, titret } from "../lib/hisler";

/**
 * GOL ANI — skor artınca üstte top + "GOL!" patlaması.
 *
 * Kendi kendine algılar: önceki skoru ref'te tutar, toplam gol ARTINCA
 * tetiklenir. Bilerek tetiklenmeyen durumlar:
 *  - İlk yükleme (önceki yok) — ekrana girer girmez patlama olmaz.
 *  - Skor DÜŞÜŞÜ (VAR iptali / veri düzeltmesi) — kutlanacak şey yok.
 *  - `canli` değilken (FT ekranı açılışı, geçmiş maç).
 *
 * Ses + titreşim kullanıcı tercihine bağlı (lib/hisler); `sessiz` prop'u
 * liste satırları için sesi tamamen kapatır (10 maçlık tabloda kakofoni
 * olmasın — büyük ekran çalar, satırlar yalnızca görsel oynar).
 *
 * Ebeveyn kapsayıcıya `position:"relative"` gerekmez (RN varsayılanı);
 * overlay dokunuşları yutmaz (pointerEvents="none").
 */
type Props = {
  home: number | string | null | undefined;
  away: number | string | null | undefined;
  canli: boolean;
  /** true → ses/titreşim çağrılmaz (liste satırları). */
  sessiz?: boolean;
  /** true → maç odası boyu (52px top); false → satır boyu (24px). */
  buyuk?: boolean;
  /**
   * Maç kimliği — LİSTELERDE ŞART. React, index anahtarlı listede bileşen
   * örneğini başka maça taşıyabilir; ref'teki önceki skor yanlış maçla
   * kıyaslanıp SAHTE gol patlatır. Kimlik değişince sayaç sıfırlanır.
   */
  kimlik?: string;
};

export default function GolAni({ home, away, canli, sessiz, buyuk, kimlik }: Props) {
  const onceki = useRef<{ h: number; a: number } | null>(null);
  const oncekiKimlik = useRef<string | undefined>(kimlik);
  const [gorunur, setGorunur] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (kimlik !== oncekiKimlik.current) {
      // Bileşen başka maça taşındı: geçmişi unut, bu turda tetikleme yok.
      oncekiKimlik.current = kimlik;
      onceki.current = null;
    }
    const h = Number(home);
    const a = Number(away);
    if (!Number.isFinite(h) || !Number.isFinite(a)) {
      onceki.current = null;
      return;
    }
    const o = onceki.current;
    onceki.current = { h, a };
    if (!o || !canli) return;
    if (h + a > o.h + o.a) {
      if (!sessiz) {
        golSesiCal();
        titret("gol");
      }
      setGorunur(true);
      anim.setValue(0);
      Animated.sequence([
        // 0→1: yaylı giriş (top büyüyerek döner), bekle, 1→2: sönüş
        Animated.spring(anim, { toValue: 1, speed: 14, bounciness: 14, useNativeDriver: true }),
        Animated.delay(buyuk ? 1500 : 900),
        Animated.timing(anim, { toValue: 2, duration: 320, useNativeDriver: true }),
      ]).start(() => setGorunur(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home, away, canli, kimlik]);

  if (!gorunur) return null;

  const scale = anim.interpolate({ inputRange: [0, 1, 2], outputRange: [0.2, 1, 1.15] });
  const opacity = anim.interpolate({ inputRange: [0, 0.15, 1, 2], outputRange: [0, 1, 1, 0] });
  const spin = anim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "720deg"], extrapolate: "clamp" });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
        alignItems: "center", justifyContent: "center",
        opacity, transform: [{ scale }],
      }}
    >
      <Animated.Text style={{ fontSize: buyuk ? 52 : 24, transform: [{ rotate: spin }] }}>
        ⚽
      </Animated.Text>
      <Text
        style={{
          color: "#a3e635", fontWeight: "900", letterSpacing: 3,
          fontSize: buyuk ? 22 : 11, marginTop: buyuk ? 2 : 0,
          textShadowColor: "#000", textShadowRadius: 6,
        }}
      >
        {t("golBang")}
      </Text>
    </Animated.View>
  );
}
