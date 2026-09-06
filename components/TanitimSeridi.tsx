import React, { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { t, useLang } from "../lib/i18n";
import Colors from "../constants/colors";
import { KARTLAR, kartSec } from "../lib/tanitimKart";

/**
 * TANITIM ŞERİDİ — yarış alanının altında, kendi özelliklerimizi tanıtan şerit.
 *
 * NEDEN VAR (kullanıcı kararı 2026-09-06): "Yarış alanı kullanıcının açıp
 * çekirdek çitleyerek zaman geçirdiği alan... Belki buraya rahatsız etmeyen
 * alt veya üst reklamlar alırız. Şimdilik kendi uygulamamızı tanıtan
 * reklamlar gireriz. Google reklamı vs sonraki karar."
 *
 * ⚠️ TASARIM KARARLARI, üçü de "rahatsız etmesin" kısıtından:
 *  • Tek satır, sabit yükseklik — maç tablosunu itmiyor, kayarken zıplamıyor.
 *  • Otomatik DÖNMÜYOR. Kendiliğinden değişen şerit, kullanıcı tabloyu
 *    izlerken gözü çeker; hedef tam tersi. Hangi kartın görüneceği maç
 *    kimliğinden türetiliyor: aynı maçta hep aynı, maçtan maça farklı.
 *  • Kapatılabilir. Kapatma o ekran oturumu boyunca geçerli (kalıcı değil):
 *    reklam kalıcı kapatılırsa gelir modeli anlamsızlaşır, ama o an rahatsız
 *    eden şey hemen kaybolmalı.
 *
 * ⚠️ HEDEFLER GERÇEK EKRANLAR OLMALI. Yol yanlışsa Expo Router "Unmatched
 * Route" basar — bu depoda ölçülmüş bir kusur (bkz. tests/rotaHedefleri).
 * Buradaki yolların hepsi o nöbetçinin taradığı kümede.
 *
 * Google/AdMob'a geçilirse bu bileşen yerinde kalır: yalnız içerik kaynağı
 * değişir, yerleşim ve "rahatsız etmeme" kısıtları korunur.
 */

/* ⚠️ Kart listesi ve seçim mantığı lib/tanitimKart.ts'te (JSX YOK): mobil
 * testler `--experimental-strip-types` ile koşuyor ve `.tsx` yükleyemiyor,
 * yani nöbetçi bu dosyayı import edemezdi. Çizim burada, mantık orada. */

type Props = {
  /** Hangi kartın görüneceği bundan türetilir — aynı maçta kart sabit kalır. */
  tohum?: string | null;
  /** Test/teşhis: kart seçimini dışarıdan sabitlemek için. */
  kartIndex?: number;
};

export default function TanitimSeridi({ tohum, kartIndex }: Props) {
  useLang();
  const router = useRouter();
  const [kapali, setKapali] = useState(false);

  const kart = useMemo(() => {
    const i = typeof kartIndex === "number" ? kartIndex : kartSec(tohum, KARTLAR.length);
    return KARTLAR[i % KARTLAR.length];
  }, [tohum, kartIndex]);

  if (kapali) return null;

  return (
    <View style={s.sarmal}>
      <Pressable
        style={s.govde}
        onPress={() => router.push(kart.yol as any)}
        accessibilityRole="button"
        accessibilityLabel={t(`tanitim_${kart.anahtar}` as any)}
      >
        <Text style={s.emoji}>{kart.emoji}</Text>
        <Text style={s.metin} numberOfLines={1}>
          {t(`tanitim_${kart.anahtar}` as any)}
        </Text>
        <Text style={s.ok}>›</Text>
      </Pressable>
      <Pressable
        onPress={() => setKapali(true)}
        hitSlop={10}
        style={s.kapat}
        accessibilityRole="button"
        accessibilityLabel={t("tanitim_kapat")}
      >
        <Text style={s.kapatMetin}>✕</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  sarmal: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card ?? "#15181d",
    borderRadius: 10,
    marginHorizontal: 12,
    marginVertical: 6,
    paddingLeft: 10,
    paddingRight: 4,
    height: 40,
  },
  govde: { flex: 1, flexDirection: "row", alignItems: "center", height: 40 },
  emoji: { fontSize: 15, marginRight: 8 },
  metin: { flex: 1, color: Colors.text ?? "#e6e9ef", fontSize: 12.5, fontWeight: "600" },
  ok: { color: Colors.muted ?? "#8b93a1", fontSize: 16, marginHorizontal: 6 },
  kapat: { paddingHorizontal: 8, paddingVertical: 8 },
  kapatMetin: { color: Colors.muted ?? "#8b93a1", fontSize: 12 },
});
