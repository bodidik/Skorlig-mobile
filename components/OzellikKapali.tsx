import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import Colors from "../constants/colors";
import { t, useLang } from "../lib/i18n";

/**
 * KAPALI ÖZELLİK EKRANI — düello ve havuz çıkış sürümünde gizli
 * (bkz. lib/ozellikler.ts).
 *
 * Sekme ve düğmeler gizli, ama ekrana başka yoldan gelinebilir: özellik
 * kapanmadan önce gelmiş bir bildirim, paylaşılmış bir bağlantı, eski bir
 * sürümden kalan geçmiş. Boş ekran ya da hata yerine NEDENİNİ ve dönüş
 * yolunu söylüyor; içeride parası olan kullanıcıya da o paranın akıbetini.
 *
 * Gövde rengi `Colors.muted` DEĞİL: o ton koyu zeminde eşiğin altında
 * ölçüldü (bkz. lib/oyunMerkezi.ts ACIKLAMA_RENGI notu).
 */
export default function OzellikKapali() {
  useLang();
  const router = useRouter();
  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center", padding: 24, gap: 10 }}>
      <Text accessibilityRole="header" style={{ color: Colors.text, fontSize: 18, fontWeight: "800", textAlign: "center" }}>
        {t("featureClosedTitle")}
      </Text>
      <Text style={{ color: "#cbd5e1", fontSize: 13.5, textAlign: "center", lineHeight: 20, maxWidth: 320 }}>
        {t("featureClosedBody")}
      </Text>
      <TouchableOpacity
        accessibilityRole="button"
        onPress={() => router.replace("/(tabs)/live" as any)}
        style={{ marginTop: 8, minHeight: 44, justifyContent: "center", paddingHorizontal: 20, borderRadius: 999, backgroundColor: Colors.primary }}
      >
        <Text style={{ color: Colors.onAccent, fontWeight: "800", fontSize: 14 }}>{t("featureClosedBack")}</Text>
      </TouchableOpacity>
    </View>
  );
}
