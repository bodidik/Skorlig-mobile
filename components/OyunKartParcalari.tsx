/**
 * OYUN MERKEZİ KART PARÇALARI — ikon kutusu, kart başlığı, ortak ölçüler.
 *
 * ⚠️ NEDEN AYRI DOSYA: `KuponKarti` ve `OyunMerkezi` aynı kart dilini
 * konuşmalı; parçalar OyunMerkezi içinde dursaydı KuponKarti onu, o da
 * KuponKarti'yi içe aktarırdı (döngü).
 *
 * ⚠️ KURALLAR (2026-09-17 kullanıcı bildirimi: "yazılar okunmuyor, çerçeveler
 * basmakalıp, süperpozisyonlar"):
 *   · Metin yalnız DÜZ zeminde (KART_ZEMINI / IC_YUZEY). Gradyan yok.
 *   · Kenarlık yok. Kartlar boşlukla ve yüzey tonuyla ayrılıyor.
 *   · Hiçbir şey `position: "absolute"` ile metnin üstüne binmiyor; çizim
 *     kendi kutusunda, düzen içinde yer kaplıyor.
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import {
  KART_ZEMINI, METIN_ANA, METIN_IKINCIL, MOD_RENGI, ikonKutusu, type ModAnahtari,
} from "../lib/oyunMerkezi";

export type SanatBileseni = React.ComponentType<{ boyut?: number }>;

/** Modun çizimi, düz renkli yuvarlak köşeli kutusunda. */
export function IkonKutusu({ modu, Sanat, boyut = 56 }: { modu: ModAnahtari; Sanat: SanatBileseni; boyut?: number }) {
  return (
    <View
      style={{
        width: boyut, height: boyut, borderRadius: Math.round(boyut * 0.28),
        backgroundColor: ikonKutusu(modu), alignItems: "center", justifyContent: "center",
      }}
    >
      <Sanat boyut={Math.round(boyut * 0.86)} />
    </View>
  );
}

/**
 * Kart başlığı: ikon kutusu + ad + vurgu renginde kısa alt satır, sağda
 * isteğe bağlı bir öğe (bağlantı). Alt satır tek satır — kartın NE olduğunu
 * söyler, nasıl oynandığını açıklama satırı söyler.
 */
export function KartBasi({
  modu, Sanat, ad, alt, sag,
}: {
  modu: ModAnahtari;
  Sanat: SanatBileseni;
  ad: string;
  alt?: string | null;
  sag?: React.ReactNode;
}) {
  return (
    <View style={parca.bas}>
      <IkonKutusu modu={modu} Sanat={Sanat} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={parca.ad} numberOfLines={1}>{ad}</Text>
        {alt ? (
          <Text style={[parca.alt, { color: MOD_RENGI[modu] }]} numberOfLines={1}>{alt}</Text>
        ) : null}
      </View>
      {sag}
    </View>
  );
}

export const parca = StyleSheet.create({
  kart: {
    backgroundColor: KART_ZEMINI,
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
  },
  bas: { flexDirection: "row", alignItems: "center", gap: 12 },
  ad: { color: METIN_ANA, fontSize: 19, fontWeight: "800" },
  alt: { fontSize: 13, fontWeight: "700", marginTop: 2 },
  aciklama: { color: METIN_IKINCIL, fontSize: 14, lineHeight: 20, marginTop: 12 },
  baglanti: { fontSize: 14, fontWeight: "800" },
});
