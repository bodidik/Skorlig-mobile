import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t, useLang } from "../lib/i18n";

/**
 * KALICI GERİ + ANA SAYFA — yığın (stack) ekranları için.
 *
 * ⚠️ NEDEN VAR: kök layout tüm başlıkları kapatıyor
 * (`headerShown: false`), yani düello / yarış panosu / kupon / premium gibi
 * sekme DIŞI ekranlarda geri dönmenin tek yolu sistem geri hareketiydi.
 * iOS'ta kenardan kaydırmayı bilmeyen ya da Android'de üst üste üç ekran
 * gezmiş kullanıcı kayboluyordu — "sayfalarda kaybolmamak zor" şikayeti.
 *
 * Sekme ekranlarında GÖRÜNMEZ: orada alt sekme çubuğu zaten her an duruyor;
 * ikinci bir gezinme katmanı gürültü olur.
 */

/** Alt sekme çubuğu olan (ya da kendi akışını yöneten) yollar — pill gizli. */
const GIZLI = new Set(["/", "/login", "/live", "/predict", "/arena", "/stats", "/me"]);

export default function GeriEv() {
  useLang(); // dil değişince erişilebilirlik etiketleri tazelensin
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  if (GIZLI.has(pathname)) return null;

  return (
    <View style={[s.kap, { top: insets.top + 8 }]} pointerEvents="box-none">
      <TouchableOpacity
        accessibilityLabel={t("goBack")}
        onPress={() => {
          // Bildirimden/derin bağlantıdan gelindiyse yığında geri yoktur —
          // o durumda "geri" de ana sayfaya çıkar, kullanıcı asla kilitlenmez.
          if (router.canGoBack()) router.back();
          else router.replace("/(tabs)/live");
        }}
        style={s.dugme}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={s.yazi}>←</Text>
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityLabel={t("goHome")}
        onPress={() => router.replace("/(tabs)/live")}
        style={s.dugme}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={s.yazi}>🏠</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  kap: {
    position: "absolute",
    left: 12,
    flexDirection: "row",
    gap: 8,
    zIndex: 50,
  },
  dugme: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172aee",
    borderWidth: 1,
    borderColor: "#334155",
  },
  yazi: { color: "#e2e8f0", fontSize: 16, fontWeight: "800" },
});
