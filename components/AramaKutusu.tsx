import React from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from "react-native";
import { t, useLang } from "../lib/i18n";
import Colors from "../constants/colors";
import { EN_AZ_HARF, type AramaDurumu } from "../lib/aramaSuzgeci";

/**
 * ARAMA KUTUSU — üç yüzeyin ortak parçası (canlı maçlar · tahmin · sıralama).
 *
 * ⚠️ TEK BİLEŞEN, ÇÜNKÜ KURAL TEK. Üç ekrana ayrı ayrı yazılsaydı eşik, boş
 * durum metni ve temizleme düğmesi er geç ayrışırdı — bu deponun "iki
 * gerçeklik" sınıfı. Karar `lib/aramaSuzgeci.ts`te, çizim burada.
 *
 * ⚠️ DURUM BİLDİRİMİ SESSİZ KALMIYOR. Üç ayrı durum var ve üçü ayrı cümle:
 *   kisa        → "en az 3 harf"  (kullanıcı yazmaya devam etsin)
 *   bulunamadi  → "sonuç yok"     (gerçekten yok)
 *   sonuc       → "N sonuç"       (kaç tane bulundu)
 * "kisa" ile "bulunamadi"yı aynı göstermek kullanıcıyı iki harfte vazgeçirir.
 *
 * ⚠️ DURUM SATIRI `role="alert"` DEĞİL, `polite`: her tuş vuruşunda ekran
 * okuyucuyu kesmek yazmayı imkânsız hale getirir. `accessibilityLiveRegion`
 * Android'de çalışıyor; iOS'ta sayının yanındaki metin zaten okunuyor.
 *
 * ⚠️ TEMİZLEME DÜĞMESİ DOKUNMA HEDEFİ: görsel 18px ama `hitSlop` ile 34px'e
 * çıkıyor — asgari 24'ün üstünde (bu depoda ölçülmüş erişilebilirlik tabanı).
 */

export type AramaKutusuProps = {
  deger: string;
  onDegisti: (s: string) => void;
  /** Süzgeçten dönen durum — metni bu belirliyor. */
  durum: AramaDurumu;
  /** Kaç sonuç bulundu (durum "sonuc" iken gösterilir). */
  sayi: number;
  /** Yazarken çıkan öneriler; boşsa çizilmez. */
  oneriler?: string[];
  /** Öneriye dokununca — genelde terimi o değere sabitler. */
  onOneri?: (s: string) => void;
  placeholder?: string;
  /** Ekran okuyucuya kutunun ne aradığını söyler. */
  etiket?: string;
};

export default function AramaKutusu({
  deger, onDegisti, durum, sayi, oneriler = [], onOneri,
  placeholder, etiket,
}: AramaKutusuProps) {
  useLang();

  const durumMetni =
    durum === "kisa" ? t("searchMinChars", { n: String(EN_AZ_HARF) })
    : durum === "bulunamadi" ? t("searchNoResult")
    : durum === "sonuc" ? t("searchCount", { n: String(sayi) })
    : "";

  return (
    <View style={s.kok}>
      <View style={s.satir}>
        <Text style={s.ikon} accessibilityElementsHidden importantForAccessibility="no">🔍</Text>
        <TextInput
          value={deger}
          onChangeText={onDegisti}
          placeholder={placeholder || t("searchPlaceholder")}
          placeholderTextColor="#64748b"
          style={s.girdi}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel={etiket || t("searchPlaceholder")}
        />
        {deger.length > 0 && (
          <Pressable
            onPress={() => onDegisti("")}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t("searchClear")}
          >
            <Text style={s.temizle}>✕</Text>
          </Pressable>
        )}
      </View>

      {!!durumMetni && (
        <Text style={s.durum} accessibilityLiveRegion="polite">{durumMetni}</Text>
      )}

      {oneriler.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.oneriSeridi}
          keyboardShouldPersistTaps="handled"
        >
          {oneriler.map((o) => (
            <Pressable
              key={o}
              onPress={() => onOneri?.(o)}
              style={s.oneri}
              accessibilityRole="button"
              accessibilityLabel={o}
            >
              <Text style={s.oneriTxt} numberOfLines={1}>{o}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  kok:        { gap: 6, marginBottom: 10 },
  satir:      { flexDirection: "row", alignItems: "center", gap: 8,
                backgroundColor: Colors.card, borderRadius: 12, borderWidth: 1,
                borderColor: Colors.cardInner, paddingHorizontal: 12, height: 42 },
  ikon:       { fontSize: 14 },
  /* ⚠️ `minWidth: 0` ŞART: `flex:1` kardeşi `shrink-0` olan bir kapta
   * sıfıra iner ve girdi görünmez olur (bu depoda kayıtlı `flex-1` kusuru). */
  girdi:      { flex: 1, minWidth: 0, color: "#e5e7eb", fontSize: 14, paddingVertical: 0 },
  temizle:    { fontSize: 18, color: Colors.mutedOnCard, paddingHorizontal: 2 },
  durum:      { fontSize: 11, color: Colors.mutedOnCard, paddingHorizontal: 4 },
  oneriSeridi:{ gap: 8, paddingHorizontal: 2, paddingVertical: 2 },
  oneri:      { backgroundColor: Colors.cardInner, borderRadius: 999, paddingHorizontal: 12,
                paddingVertical: 7, borderWidth: 1, borderColor: Colors.cardInner },
  oneriTxt:   { fontSize: 12, color: "#cbd5e1", fontWeight: "600" },
});
