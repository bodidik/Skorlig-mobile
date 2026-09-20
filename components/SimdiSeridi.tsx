import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { t, useLang } from "../lib/i18n";
import { MOD_RENGI } from "../lib/oyunMerkezi";
import type { Acil } from "../lib/acilDurum";
import Basinc from "./Basinc";

/**
 * "ŞİMDİ" ŞERİDİ — açılışta öne çıkan TEK acil durum.
 *
 * ⚠️ NEDEN VAR: ana ekranda her kart KENDİ durumunu gösteriyordu (kupon geri
 * sayımı, "oynadın" işareti, skor durumu) ama aralarında ÖNCELİK yoktu.
 * Kuponun 40 dakika sonra kilitlendiği, kartın kaçıncı sırada olduğuna göre
 * görünür ya da görünmez oluyordu; açılış herkese aynı sırayı veriyordu.
 *
 * ⚠️ KARTLAR YENİDEN SIRALANMIYOR — bilerek, ve bu kararın bedeli ölçülü:
 * üç kart veriyi AYRI AYRI ve FARKLI ZAMANLARDA çekiyor. Aciliyete göre
 * sıralasaydık, veri geldikçe kartlar kullanıcının parmağının altında yer
 * değiştirirdi. Şerit bunun yerine en üste, kartların ÜSTÜNE çıkıyor:
 * düzen sabit kalıyor, yalnız bir satır beliriyor.
 *
 * ⚠️ TEK SATIR, LİSTE DEĞİL. İki üç uyarıyı üst üste dizmek "her şey acil"
 * demek olurdu ve hiçbiri okunmazdı (seçim `enAcil`de).
 *
 * ⚠️ ACİL BİR ŞEY YOKSA HİÇBİR ŞEY ÇİZİLMİYOR. Boş bir kutu ya da "şu an
 * acil bir şey yok" satırı, ekranda kalıcı yer kaplayıp hiçbir iş
 * üretmezdi — üstelik şeridin belirmesini de sıradanlaştırırdı.
 */

type Props = {
  acil: Acil | null;
  /** Şeride dokununca çağrılır; hedefi çağıran biliyor (`acil.anahtar`). */
  onGit: (a: Acil) => void;
};

export default function SimdiSeridi({ acil, onGit }: Props) {
  useLang(); // dil değişince yeniden çizilsin
  if (!acil) return null;

  const renk = MOD_RENGI[acil.anahtar] || "#f59e0b";

  return (
    <Basinc onPress={() => onGit(acil)} scaleTo={0.98}>
      <View
        accessibilityRole="button"
        /* ⚠️ ERİŞİLEBİLİR AD METNİN TAMAMI: ekran okuyucu yalnız "Git"
         * duyarsa neye gideceğini bilmez. */
        accessibilityLabel={`${acil.metin} — ${t("simdiGit")}`}
        style={[s.kok, { borderLeftColor: renk }]}
      >
        <Text style={s.nokta} accessibilityElementsHidden importantForAccessibility="no">●</Text>
        <Text style={s.metin} numberOfLines={2}>{acil.metin}</Text>
        <Text style={[s.git, { color: renk }]}>{t("simdiGit")} ›</Text>
      </View>
    </Basinc>
  );
}

const s = StyleSheet.create({
  kok: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#132b36",
    borderRadius: 12,
    borderLeftWidth: 3,
    paddingHorizontal: 14,
    /* Dokunma hedefi: 44px'i yakalasın diye dikey dolgu 13. */
    paddingVertical: 13,
    minHeight: 44,
    marginBottom: 12,
  },
  nokta: { color: "#fbbf24", fontSize: 10 },
  /* ⚠️ `flex: 1` + `shrink` YOK: uzun metin "Git"i ezmesin diye metin esner,
   * bağlantı sabit kalır. Kapasite değil, okunurluk kararı. */
  metin: { flex: 1, color: "#e2e8f0", fontSize: 13, fontWeight: "600", lineHeight: 18 },
  git: { fontSize: 13, fontWeight: "800" },
});
