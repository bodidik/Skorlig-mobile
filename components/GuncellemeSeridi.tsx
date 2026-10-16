/**
 * GÜNCELLEME ŞERİDİ — ana ekranın tepesinde, yeni sürüm varken KALICI.
 *
 * Kullanıcı (2026-10-16): "ilk ekranda hemen güncelle seçeneği verilsin."
 * Açılış uyarısı (app/_layout.tsx) "Sonra" ile kapanabiliyor; şerit
 * kapanmaz, sürüm güncellenene kadar ilk ekranda durur. Durum tek kaynaktan
 * (lib/guncelleme.ts) — uyarı ile şerit aynı kararı okur.
 */
import React from "react";
import { Text, TouchableOpacity } from "react-native";
import { t, useLang } from "../lib/i18n";
import { guncellemeyiAc, useGuncelleme } from "../lib/guncelleme";

export default function GuncellemeSeridi() {
  useLang();
  const { karar } = useGuncelleme();
  if (karar === "yok") return null;
  return (
    <TouchableOpacity
      onPress={guncellemeyiAc}
      accessibilityRole="button"
      accessibilityLabel={t("updBanner")}
      style={{
        flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10,
        backgroundColor: "#052e16", borderWidth: 1, borderColor: "#22c55e",
        borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 48,
      }}
    >
      <Text style={{ fontSize: 18 }}>⬆️</Text>
      <Text style={{ flex: 1, color: "#bbf7d0", fontWeight: "700", fontSize: 13 }}>{t("updBanner")}</Text>
      <Text style={{ color: "#052e16", backgroundColor: "#22c55e", fontWeight: "900", fontSize: 13, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, overflow: "hidden" }}>
        {t("updNow")}
      </Text>
    </TouchableOpacity>
  );
}
