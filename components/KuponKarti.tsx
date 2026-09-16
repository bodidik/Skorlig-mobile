/**
 * HAFTALIK KUPON KARTI — ana ekranın BİRİNCİL eylemi, Oyun Merkezi'nin ilk kartı.
 *
 * ⚠️ NEDEN EN ÜSTTE: kupon `OyunModlari` içinde altı moddan biriydi ve yatay
 * kaydırma şeridinde duruyordu. Ana ekranın ilk eylemi tek maçlık "günün maçı"
 * kartıydı — yani uygulama, haftanın 8 maçlık asıl oyununu keşfedilmesi
 * gereken bir yan özellik gibi sunuyordu.
 *
 * Ürün kararı: genişlik ligdeki maç sayısıyla verilir. Kupon 8 maç taşıyor;
 * günün maçı tek maç. Sıra buna göre: kupon birincil, günün maçı hemen altında
 * ikincil (o da 1987 grubunun tepki katmanını taşıyor).
 *
 * ⚠️ 2026-09-16: KART ARTIK OYUN MERKEZİ'NİN İÇİNDE (kullanıcı bildirimi:
 * "görseller yetersiz, basit görünüm uygulamayı temsil edemiyor"). Mod
 * menüsünde ayrı bir "Haftalık" düğmesi ve altında ayrı bir kupon kartı
 * vardı; ikisi aynı oyunu iki kez anlatıyordu. Şimdi menüdeki haftalık kart
 * kuponun kendisi: çizim, maç maç ilerleme çubuğu, geri sayım, tek eylem.
 *
 * ⚠️ KUPON YOKSA `bosken` ÇİZİLİR, NEDENİ AYRILARAK. Eskiden `null` dönüyordu
 * (ana ekranın tepesinde boş kutu durmasın). Menünün içinde null, modun
 * kendisini yok ediyordu. İki ayrı durum var ve karıştırılmamalı:
 *   "yok"        → sunucu cevap verdi, açık kupon YOK (sezon arası)
 *   "bilinmiyor" → sunucuya soramadık (misafir: AUTH_REQUIRED, ağ hatası)
 * Misafire "kupon hazırlanıyor" demek, kupon açıkken yalan olurdu.
 *
 * ⚠️ KALAN SÜRE SUNUCUDAN (`kalanSaniye`). Cihaz saatine güvenilmiyor —
 * kullanıcının saati yanlışsa geri sayım yalan söyler ve "daha var" derken
 * kilit kapanır. Aynı kural `app/kupon.tsx` içinde de yazılı.
 */

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { apiJson } from "../lib/apiFetch";
import { t, useLang } from "../lib/i18n";
import { ulkeAdi } from "../lib/ulkeler";
import { kuponBasligi, birincilKupon } from "../lib/kuponBaslik";
import {
  ACIKLAMA_RENGI, ILERLEME_BOS, KENARLIK_ALFA, MOD_RENGI, ROZET_ALFA, ROZET_YAZI_ACMA, ZEMIN_ALT_ALFA,
  ZEMIN_UST_ALFA, acikTon, alfa, kuponIlerlemesi,
} from "../lib/oyunMerkezi";
import Colors from "../constants/colors";
import Basinc from "./Basinc";
import GradyanZemin from "./GradyanZemin";
import IskeletBlok from "./Iskelet";
import { KuponSanati } from "./OyunSanati";

type Mac = {
  fixtureId: string;
  home: string;
  away: string;
  kickoffISO: string;
  league?: string | null;
};

type KuponT = {
  id: string;
  tur: "ulke" | "avrupa" | "ortak";
  ulke: string | null;
  maclar: Mac[];
  girisBedeli: number;
  durum: "open" | "locked" | "settled";
  katildiMi: boolean;
  tahminlerim: Record<string, "H" | "D" | "A"> | null;
  kalanSaniye: number;
};

export type KuponYokNedeni = "yok" | "bilinmiyor";

type Props = {
  /** Kupon gösterilemezken çizilecek kart. Verilmezse eski davranış: hiçbir şey. */
  bosken?: (neden: KuponYokNedeni) => React.ReactNode;
};

const RENK = MOD_RENGI.kupon;

/** Geri sayım metni — `app/kupon.tsx` ile AYNI kural. */
function sureMetni(saniye: number): string {
  if (saniye <= 0) return t("closedLower");
  const g = Math.floor(saniye / 86400);
  const s = Math.floor((saniye % 86400) / 3600);
  const d = Math.floor((saniye % 3600) / 60);
  if (g > 0) return t("daysHours", { g, s });
  if (s > 0) return t("hoursMin", { s, d });
  return t("nMin", { n: d });
}

export default function KuponKarti({ bosken }: Props) {
  useLang();
  const router = useRouter();
  const [kupon, setKupon] = useState<KuponT | null>(null);
  const [neden, setNeden] = useState<KuponYokNedeni>("bilinmiyor");
  const [loading, setLoading] = useState(true);

  const yukle = useCallback(async () => {
    try {
      const j = await apiJson("/api/kupon/aktif");
      const liste: KuponT[] = j?.ok && Array.isArray(j.kuponlar) ? j.kuponlar : [];
      /* ⚠️ SIRA ARTIK AÇIK YAZILI (lib/kuponBaslik.ts birincilKupon).
       * Eski kural "ülke kuponu, yoksa ilki" idi ve ORTAK kupon yalnızca
       * YEDEK dala düşerek görünüyordu: TR40'ta liste tek elemanlı olduğu
       * için sonuç tesadüfen doğruydu. İki tür birlikte dönseydi ülke
       * kuponu ORTAK'ı gizlerdi. */
      setKupon(birincilKupon(liste));
      /* Yalnız sunucu GERÇEKTEN cevap verdiyse "yok" — bkz. başlık. */
      setNeden(j?.ok ? "yok" : "bilinmiyor");
    } catch {
      setKupon(null);
      setNeden("bilinmiyor");
    }
    setLoading(false);
  }, []);

  useEffect(() => { yukle(); }, [yukle]);

  if (loading) {
    return (
      <View style={[s.kart, { borderColor: RENK + alfa(KENARLIK_ALFA) }]}>
        <View style={{ gap: 10 }}>
          <IskeletBlok style={{ width: 150, height: 20 }} />
          <IskeletBlok style={{ width: "70%", height: 12 }} />
          <IskeletBlok style={{ width: "100%", height: 8 }} />
          <IskeletBlok style={{ width: "55%", height: 12 }} />
        </View>
      </View>
    );
  }

  if (!kupon) return bosken ? <>{bosken(neden)}</> : null;

  const ilerleme = kuponIlerlemesi(kupon);

  /* Başlık `app/kupon.tsx` ile AYNI anahtardan — iki yüzey aynı kuponu farklı
   * adlandırırsa kullanıcı iki ayrı oyun sanır.
   *
   * ⚠️ NİYET TEK KAYNAKTI, GERÇEK KOPYAYDI: aynı üçlü ifade iki dosyada ayrı
   * ayrı duruyordu ve ikisi birlikte bozuldu (ORTAK kupon "⚽  Ligi"). Artık
   * gerçekten tek kaynak: lib/kuponBaslik.ts. */
  const baslik = kuponBasligi(kupon, t, ulkeAdi);

  /* İlk iki maç önizleme olarak gösteriliyor: "8 maç" soyut, "Galatasaray -
   * Fenerbahçe" somut. Kartın tıklanma sebebi bu satır. */
  const onizleme = (kupon.maclar || []).slice(0, 2);

  /**
   * ⚠️ ÜÇ AYRI DURUM, ÜÇ AYRI ÇAĞRI. Tek bir "Kupona git" düğmesi
   * kullanıcıya sıradaki adımı söylemezdi:
   *   - katılmadı            → bedeli gör, satın al
   *   - katıldı ama eksik    → kaç maç boş kaldığını gör  (BOŞ MAÇ YANLIŞ SAYILIR)
   *   - katıldı ve tamamladı → onay
   *
   * ⚠️ BOŞ MAÇ SAYISI DÜĞMEDE DEĞİL, İLERLEME SATIRINDA. "Tamamla · 3 maç boş"
   * 360 px ekranda kesiliyordu ve geri sayımı iki satıra itiyordu (önizlemede
   * ölçüldü). Sayı kaybolmuyor: çubuğun yanında, uyarı renginde.
   */
  const eylem =
    ilerleme.asama === "katil" ? { yazi: t("kuponJoinFor", { n: kupon.girisBedeli }), zemin: RENK }
    : ilerleme.asama === "eksik" ? { yazi: t("kuponFill"), zemin: Colors.accent }
    : { yazi: t("kuponView"), zemin: null };
  const eksikMi = ilerleme.asama === "eksik";

  return (
    <Basinc onPress={() => router.push("/kupon")} scaleTo={0.97}>
      <View
        accessibilityRole="button"
        accessibilityLabel={`${t("weeklyKupon")}: ${baslik}`}
        style={[s.kart, { borderColor: RENK + alfa(KENARLIK_ALFA) }]}
      >
        <GradyanZemin renkler={[RENK + alfa(ZEMIN_UST_ALFA), RENK + alfa(ZEMIN_ALT_ALFA)]} yon="capraz" />
        <View style={s.sanat} pointerEvents="none">
          <KuponSanati boyut={124} />
        </View>

        <View style={{ paddingRight: 108 }}>
          <View style={[s.rozet, { backgroundColor: RENK + alfa(ROZET_ALFA) }]}>
            <Text style={[s.rozetYazi, { color: acikTon(RENK, ROZET_YAZI_ACMA) }]} numberOfLines={1}>{baslik}</Text>
          </View>
          <Text style={s.ad}>{t("weeklyKupon")}</Text>
          <Text style={s.aciklama}>{t("kuponHeroSub")}</Text>
        </View>

        {/* Maç maç ilerleme: sekiz parça, dolu olan kupon renginde. "3/8"
            sayısından hızlı okunuyor ve kuponun MAÇ MAÇ doldurulduğunu
            yazısız anlatıyor. */}
        <View style={s.ilerlemeSatiri}>
          <View style={s.cubuk}>
            {ilerleme.dolular.map((dolu, i) => (
              <View key={i} style={[s.parca, { backgroundColor: dolu ? RENK : ILERLEME_BOS }]} />
            ))}
          </View>
          <Text style={[s.ilerlemeYazi, eksikMi && { color: Colors.accent }]}>
            {eksikMi
              ? t("kuponMissingShort", { n: ilerleme.eksik })
              : t("kuponFilledOf", { a: ilerleme.girilen, n: ilerleme.macSayisi })}
          </Text>
        </View>

        <View style={s.onizleme}>
          {onizleme.map((m) => (
            <Text key={m.fixtureId} style={s.macSatiri} numberOfLines={1}>
              {m.home} <Text style={s.vs}>–</Text> {m.away}
            </Text>
          ))}
          {ilerleme.macSayisi > onizleme.length && (
            <Text style={s.kalanMac}>
              {t("kuponMoreMatches", { n: ilerleme.macSayisi - onizleme.length })}
            </Text>
          )}
        </View>

        <View style={s.altSatir}>
          <Text style={s.sure}>⏳ {t("kuponClosesIn", { s: sureMetni(kupon.kalanSaniye) })}</Text>
          {eylem.zemin ? (
            <View style={[s.eylem, { backgroundColor: eylem.zemin }]}>
              <Text style={s.eylemYazi} numberOfLines={1}>{eylem.yazi} →</Text>
            </View>
          ) : (
            <View style={[s.eylem, s.eylemCizgi, { borderColor: RENK + alfa(KENARLIK_ALFA) }]}>
              <Text style={[s.eylemYazi, { color: RENK }]}>✓ {eylem.yazi} →</Text>
            </View>
          )}
        </View>
      </View>
    </Basinc>
  );
}

const s = StyleSheet.create({
  kart: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    padding: 16,
    marginBottom: 12,
  },
  sanat: { position: "absolute", right: -8, top: -8 },
  rozet: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  rozetYazi: { fontSize: 11, fontWeight: "900" },
  ad: { color: Colors.text, fontSize: 22, fontWeight: "900", marginTop: 8 },
  aciklama: { color: ACIKLAMA_RENGI, fontSize: 12.5, lineHeight: 17, marginTop: 3 },

  ilerlemeSatiri: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  cubuk: { flex: 1, flexDirection: "row", gap: 4 },
  parca: { flex: 1, height: 7, borderRadius: 4 },
  ilerlemeYazi: { color: Colors.text, fontSize: 12, fontWeight: "800" },

  onizleme: { marginTop: 12, gap: 3 },
  macSatiri: { color: Colors.text, fontSize: 13.5, fontWeight: "700" },
  vs: { color: ACIKLAMA_RENGI, fontWeight: "400" },
  kalanMac: { color: ACIKLAMA_RENGI, fontSize: 12, marginTop: 1 },

  altSatir: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    gap: 10, marginTop: 14,
  },
  sure: { color: ACIKLAMA_RENGI, fontSize: 12, fontWeight: "700", flexShrink: 1 },
  eylem: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, flexShrink: 1 },
  eylemCizgi: { borderWidth: 1, backgroundColor: "transparent" },
  eylemYazi: { color: Colors.onAccent, fontWeight: "900", fontSize: 13 },
});
