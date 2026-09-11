import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter, usePathname, useSegments } from "expo-router";
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

/**
 * Sekme grubu DIŞINDA, kendi akışını yöneten yollar — pill burada da gizli.
 *
 * ⚠️ SEKME YOLLARI BU LİSTEDE TUTULMAZ. Eskiden tutuluyordu
 * (`"/live", "/predict", "/arena", "/stats", "/me"`) ve liste dosya
 * sisteminden SAPTI: `kings` sekmesi sonradan eklendi, listeye girmedi ve o
 * sekmede alt sekme çubuğunun üstüne ikinci bir gezinme katmanı — üstelik
 * yığında geri gidecek bir şey olmayan bir "geri" oku — basılıyordu.
 * Elle tutulan liste, içerik büyürken sessizce yalana dönüşür; sekme olup
 * olmadığı artık rotanın KENDİSİNDEN okunuyor.
 */
export const GIZLI_YOL = new Set(["/", "/login"]);

/** Düğme çapı. */
const DUGME = 38;
/** Güvenli alandan sonra bırakılan üst boşluk. */
const UST = 8;

/**
 * ÇUBUĞUN KAPLADIĞI ALAN — ekranların içeriği bu kadar aşağıdan başlamalı.
 *
 * ⚠️ ÖLÇÜLEN KUSUR (2026-09-11, önizlemede görüldü): bu çubuk mutlak
 * konumlu ve HER yığın ekranının üstüne biniyor. Ekranlar kendi
 * içeriklerine `padding: 16` ile başladığı için başlık çubuğun ALTINDA
 * kalıyordu — grup panosunda "Mahalle Ligi", kupon ekranında "Haftalık
 * Tahmin" yarı yarıya örtülüydü.
 *
 * ÖLÇÜLDÜ: sekme dışı 32 ekranın HİÇBİRİ üst boşluk telafisi yapmıyordu.
 * Yani kusur tek bir ekranın değil, ortak çerçevenin.
 *
 * ⚠️ ÇARE 32 EKRANA DEĞİL TEK YERE: her ekrana `paddingTop` eklemek, bu
 * deponun sürekli düzelttiği kopya sorununun kendisi olurdu — biri
 * unutulur ve sessizce örtülü kalır. Alan kök yığında `contentStyle` ile
 * bir kez ayrılıyor (app/_layout.tsx).
 *
 * ⚠️ `insets.top` BURAYA EKLENMİYOR: çubuk pencereye göre konumlanırken
 * onu kendisi ekliyor, ekran içeriği ise gezgin tarafından zaten güvenli
 * alanın altından başlatılıyor. İkisini de eklemek boşluğu ikiye katlardı.
 */
export const GERIEV_ALANI = UST + DUGME + UST;

export default function GeriEv() {
  useLang(); // dil değişince erişilebilirlik etiketleri tazelensin
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();
  const insets = useSafeAreaInsets();

  // Sekme grubundaki her ekran: alt sekme çubuğu zaten her an duruyor.
  if (segments[0] === "(tabs)") return null;
  if (GIZLI_YOL.has(pathname)) return null;

  return (
    <View style={[s.kap, { top: insets.top + UST }]} pointerEvents="box-none">
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
    width: DUGME,
    height: DUGME,
    borderRadius: DUGME / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172aee",
    borderWidth: 1,
    borderColor: "#334155",
  },
  yazi: { color: "#e2e8f0", fontSize: 16, fontWeight: "800" },
});
