import React, { useEffect, useRef } from "react";
import { View, Text, Pressable, Animated, StyleSheet } from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "../constants/colors";
import { titret } from "../lib/hisler";

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
        <Ionicons name={odakta ? ikon.aktif : ikon.pasif} size={22} color={renk} />
      </Animated.View>
      <Text style={[s.etiket, { color: renk }, odakta && s.etiketAktif]} numberOfLines={1}>
        {etiket}
      </Text>
    </Pressable>
  );
}

export default function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.cubuk, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {state.routes.map((route, i) => {
        const { options } = descriptors[route.key];
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
