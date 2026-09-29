import React, { useEffect, useRef } from "react";
import { View, Text, Pressable, Animated, StyleSheet } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Colors from "../constants/colors";
import { titret } from "../lib/hisler";
import { sekmeGizliMi } from "../lib/ozellikler";
/* ⚠️ `useLang` ŞART: `t()` basan her ekran dile abone olmalı, yoksa dil
 * değişince etiket eski dilde kalır (nöbetçi: api/tests/dil-degisimi). Bu
 * dosya `t()` kullanmaya 2026-09-30'da başladı ve abonelik atlanmıştı. */
import { t, useLang } from "../lib/i18n";

/**
 * ÖZEL ALT SEKME ÇUBUĞU.
 *
 * Varsayılan çubuk düz renk + soluk ikondu; oyun hissi vermiyordu. Burada:
 *  - aktif sekme altın tonlu bir "hap" içinde, ikon dolu varyanta geçer
 *  - seçimde yay animasyonu (ölçek + hafif yukarı itme)
 *  - dokunuşta hafif titreşim (kullanıcı tercihi lib/hisler'den; kapatılabilir)
 *
 * Reanimated YOK — çekirdek Animated yeter; bağımlılık eklemedik.
 * İkon çifti (dolu/çizgili) ekran adına göre buradan eşlenir; yeni sekme
 * eklerken bu tabloya bir satır eklemek yeterli.
 */
const IKONLAR: Record<string, { aktif: any; pasif: any }> = {
  live:    { aktif: "football",      pasif: "football-outline" },
  predict: { aktif: "create",        pasif: "create-outline" },
  arena:   { aktif: "flash",         pasif: "flash-outline" },
  stats:   { aktif: "podium",        pasif: "podium-outline" },
  me:      { aktif: "person-circle", pasif: "person-circle-outline" },
  kings:   { aktif: "trophy",        pasif: "trophy-outline" },
  /* Rota değil — `live` sekmesinin "Benimkiler" kipine giden kısayol
   * (bkz. TabBar gövdesindeki `tahminlerimeGit`). */
  tahminlerim: { aktif: "clipboard", pasif: "clipboard-outline" },
};

function Sekme({
  odakta,
  etiket,
  rota,
  onPress,
}: {
  odakta: boolean;
  etiket: string;
  rota: string;
  onPress: () => void;
}) {
  const olcek = useRef(new Animated.Value(odakta ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(olcek, {
      toValue: odakta ? 1 : 0,
      useNativeDriver: true,
      speed: 16,
      bounciness: 9,
    }).start();
  }, [odakta, olcek]);

  const ikon = IKONLAR[rota] || IKONLAR.live;
  const renk = odakta ? Colors.accent : "#7b8794";
  // Sıralama sekmesi = kral tacı. Ionicons'ta crown yok; MaterialCommunityIcons.
  const tacMi = rota === "stats";

  return (
    <Pressable
      onPress={onPress}
      style={s.sekme}
      android_ripple={{ color: "rgba(245,158,11,0.12)", borderless: true }}
      accessibilityRole="tab"
      accessibilityState={{ selected: odakta }}
      accessibilityLabel={etiket}
    >
      <Animated.View
        style={[
          s.hap,
          odakta && s.hapAktif,
          {
            transform: [
              { scale: olcek.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
              { translateY: olcek.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) },
            ],
          },
        ]}
      >
        {tacMi
          ? <MaterialCommunityIcons name={odakta ? "crown" : "crown-outline"} size={23} color={renk} />
          : <Ionicons name={odakta ? ikon.aktif : ikon.pasif} size={22} color={renk} />}
      </Animated.View>
      <Text style={[s.etiket, { color: renk }, odakta && s.etiketAktif]} numberOfLines={1}>
        {etiket}
      </Text>
    </Pressable>
  );
}

export default function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  useLang(); // dil değişince sekme etiketleri yenilensin
  const insets = useSafeAreaInsets();
  const router = useRouter();

  /**
   * TAHMİNLERİM — HER EKRANDAN TEK DOKUNUŞ (kullanıcı isteği 2026-09-29).
   *
   * *"Oynanmış tahminlere daha çabuk ulaşabilmeli kişi; menüler içinde aramak
   * yerine her an kuponlarına dönebilmeli."*
   *
   * ÖLÇÜLDÜ — eskiden iki yol vardı ve ikisi de en az iki dokunuş:
   *   • Maçlar sekmesi → üstteki mod şeridinden "Benimkiler",
   *   • Profil → "📋 Benimkiler" satırı.
   * Yani kullanıcı hangi sekmedeyse önce oradan ÇIKMAK zorundaydı.
   *
   * ⚠️ AYRI BİR ROTA DEĞİL, bilerek: Benimkiler `live` sekmesinin bir KİPİ
   * (`?tab=mine`). Yeni bir sekme dosyası açmak aynı listeyi iki yerde
   * tutmak olurdu (deponun kayıtlı "iki gerçeklik" sınıfı). Bu düğme o kipe
   * gidiyor, `ts` damgası sekme AÇIKKEN de kipin değişmesini sağlıyor —
   * damga olmadan aynı adrese gitmek hiçbir şey yapmıyordu.
   */
  const tahminlerimeGit = () => {
    titret("hafif");
    router.push({ pathname: "/(tabs)/live", params: { tab: "mine", ts: String(Date.now()) } } as any);
  };

  return (
    <View style={[s.cubuk, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route, i) => {
        const { options } = descriptors[route.key];
        // href: null verilmiş sekme — özel çubuk bunu kendisi atlamalı.
        if (sekmeGizliMi(options)) return null;
        const etiket = String(options.title ?? route.name);
        const odakta = state.index === i;

        const bas = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!odakta && !event.defaultPrevented) {
            titret("hafif");
            navigation.navigate(route.name as never);
          }
        };

        return (
          <Sekme key={route.key} odakta={odakta} etiket={etiket} rota={route.name} onPress={bas} />
        );
      })}

      {/* Tahminlerim — rota değil, `live` sekmesinin "mine" kipine kısayol.
          `odakta` HİÇ true olmuyor: bu düğmenin kendi rotası yok, altın hapı
          göstermek "buradasın" demek olurdu ve yanlış olurdu. */}
      <Sekme odakta={false} etiket={t("myBets")} rota="tahminlerim" onPress={tahminlerimeGit} />
    </View>
  );
}

const s = StyleSheet.create({
  cubuk: {
    flexDirection: "row",
    backgroundColor: "#0b1220",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#22304a",
    paddingTop: 8,
    paddingHorizontal: 6,
  },
  sekme: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  hap: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 14,
  },
  hapAktif: {
    backgroundColor: "rgba(245,158,11,0.14)",
  },
  etiket: {
    fontSize: 10.5,
    fontWeight: "600",
  },
  etiketAktif: {
    fontWeight: "800",
  },
});
