/**
 * HAFTALIK KUPON KARTI — ana ekranın BİRİNCİL eylemi.
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
 * ⚠️ KART KENDİNİ GİZLER. Kupon yoksa `null` döner — boş bir "kupon yok"
 * kutusu ana ekranın en üstünde durmaz. Sezon arası ya da yeni ülke
 * eklendiğinde bu gerçekten oluyor.
 *
 * ⚠️ KALAN SÜRE SUNUCUDAN (`kalanSaniye`). Cihaz saatine güvenilmiyor —
 * kullanıcının saati yanlışsa geri sayım yalan söyler ve "daha var" derken
 * kilit kapanır. Aynı kural `app/kupon.tsx` içinde de yazılı.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, TouchableOpacity, ActivityIndicator, StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { apiJson } from "../lib/apiFetch";
import { t, useLang } from "../lib/i18n";
import { ulkeAdi } from "../lib/ulkeler";
import GradyanZemin from "./GradyanZemin";
import IskeletBlok from "./Iskelet";
import { Gradyan } from "../constants/colors";

type Mac = {
  fixtureId: string;
  home: string;
  away: string;
  kickoffISO: string;
  league?: string | null;
};

type KuponT = {
  id: string;
  tur: "ulke" | "avrupa";
  ulke: string | null;
  maclar: Mac[];
  girisBedeli: number;
  durum: "open" | "locked" | "settled";
  katildiMi: boolean;
  tahminlerim: Record<string, "H" | "D" | "A"> | null;
  kalanSaniye: number;
};

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

export default function KuponKarti() {
  useLang();
  const router = useRouter();
  const [kupon, setKupon] = useState<KuponT | null>(null);
  const [loading, setLoading] = useState(true);

  const yukle = useCallback(async () => {
    try {
      const j = await apiJson("/api/kupon/aktif");
      const liste: KuponT[] = j?.ok && Array.isArray(j.kuponlar) ? j.kuponlar : [];
      /* ⚠️ ÜLKE KUPONU ÖNCELİKLİ. Uç ülke + Avrupa kuponunu birlikte
       * döndürüyor; ana ekranda kullanıcının KENDİ ligi birincil olmalı.
       * Ülke kuponu yoksa (ülkesi seçili değil ya da o hafta yeterli maç
       * yok) Avrupa kuponu gösteriliyor — boş kart göstermekten iyi. */
      const acik = liste.filter((k) => k.durum === "open");
      setKupon(acik.find((k) => k.tur === "ulke") || acik[0] || null);
    } catch {
      setKupon(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { yukle(); }, [yukle]);

  if (loading) {
    return (
      <View style={s.card}>
        <View style={{ gap: 8 }}>
          <IskeletBlok style={{ width: 130, height: 14 }} />
          <IskeletBlok style={{ width: "80%", height: 12 }} />
          <IskeletBlok style={{ width: "65%", height: 12 }} />
        </View>
      </View>
    );
  }

  // Kupon yoksa kart HİÇ görünmez — bkz. başlıktaki not.
  if (!kupon) return null;

  const macSayisi = Array.isArray(kupon.maclar) ? kupon.maclar.length : 0;
  const girilen = kupon.tahminlerim ? Object.keys(kupon.tahminlerim).length : 0;
  const eksik = Math.max(0, macSayisi - girilen);

  /* Başlık `app/kupon.tsx` ile AYNI anahtardan — iki yüzey aynı kuponu farklı
   * adlandırırsa kullanıcı iki ayrı oyun sanır. */
  const baslik =
    kupon.tur === "avrupa"
      ? t("kuponEurope")
      : t("kuponCountryLeague", { c: ulkeAdi(kupon.ulke) });

  /* İlk iki maç önizleme olarak gösteriliyor: "8 maç" soyut, "Galatasaray -
   * Fenerbahçe" somut. Kartın tıklanma sebebi bu satır. */
  const onizleme = (kupon.maclar || []).slice(0, 2);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => router.push("/kupon")}
      style={s.card}
    >
      <GradyanZemin renkler={Gradyan.pitch} yon="capraz" />
      <View style={s.ustSatir}>
        <View style={s.rozet}>
          <Text style={s.rozetYazi}>🎟️ {baslik}</Text>
        </View>
        <Text style={s.sure}>⏳ {sureMetni(kupon.kalanSaniye)}</Text>
      </View>

      <View style={s.onizleme}>
        {onizleme.map((m) => (
          <Text key={m.fixtureId} style={s.macSatiri} numberOfLines={1}>
            {m.home} <Text style={s.vs}>-</Text> {m.away}
          </Text>
        ))}
        {macSayisi > onizleme.length && (
          <Text style={s.kalanMac}>
            {t("kuponMoreMatches", { n: macSayisi - onizleme.length })}
          </Text>
        )}
      </View>

      {/**
       * ⚠️ ÜÇ AYRI DURUM, ÜÇ AYRI ÇAĞRI. Tek bir "Kupona git" düğmesi
       * kullanıcıya sıradaki adımı söylemezdi:
       *   - katılmadı            → bedeli gör, satın al
       *   - katıldı ama eksik    → kaç maç boş kaldığını gör  (BOŞ MAÇ YANLIŞ SAYILIR)
       *   - katıldı ve tamamladı → onay
       */}
      {!kupon.katildiMi ? (
        <View style={s.altSatir}>
          <Text style={s.macAdet}>{t("kuponMatchCount", { n: macSayisi })}</Text>
          <View style={s.cta}>
            <Text style={s.ctaYazi}>{t("kuponJoinFor", { n: kupon.girisBedeli })}</Text>
          </View>
        </View>
      ) : eksik > 0 ? (
        <View style={s.altSatir}>
          <Text style={s.uyari}>{t("kuponMissingShort", { n: eksik })}</Text>
          <View style={[s.cta, s.ctaUyari]}>
            <Text style={s.ctaYazi}>{t("kuponFill")}</Text>
          </View>
        </View>
      ) : (
        <View style={s.altSatir}>
          <Text style={s.tamam}>{t("kuponAllFilled")}</Text>
          <Text style={s.gorLink}>{t("kuponView")}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: "#0f172a",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#a3e63544",
    overflow: "hidden",
    padding: 16,
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
  },
  ustSatir: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  rozet: {
    backgroundColor: "#a3e63518",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  rozetYazi: { color: "#a3e635", fontSize: 12, fontWeight: "800" },
  sure: { color: "#64748b", fontSize: 11, fontWeight: "600" },
  onizleme: { marginBottom: 12, gap: 3 },
  macSatiri: { color: "#f1f5f9", fontSize: 13, fontWeight: "700" },
  vs: { color: "#475569", fontWeight: "400" },
  kalanMac: { color: "#64748b", fontSize: 11, marginTop: 2 },
  altSatir: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  macAdet: { color: "#94a3b8", fontSize: 12, fontWeight: "600" },
  uyari: { color: "#f59e0b", fontSize: 12, fontWeight: "700", flex: 1 },
  tamam: { color: "#a3e635", fontSize: 12, fontWeight: "700", flex: 1 },
  cta: {
    backgroundColor: "#a3e635",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  ctaUyari: { backgroundColor: "#f59e0b" },
  ctaYazi: { color: "#0f172a", fontWeight: "900", fontSize: 12 },
  gorLink: { color: "#475569", fontSize: 11 },
});
