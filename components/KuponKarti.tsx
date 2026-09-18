/**
 * HAFTALIK KUPON KARTI — ana ekranın BİRİNCİL eylemi, Oyun Merkezi'nin ilk kartı.
 *
 * ⚠️ NEDEN EN ÜSTTE: kupon `OyunModlari` içinde altı moddan biriydi ve yatay
 * kaydırma şeridinde duruyordu. Ana ekranın ilk eylemi tek maçlık "günün maçı"
 * kartıydı — yani uygulama, haftanın 8 maçlık asıl oyununu keşfedilmesi
 * gereken bir yan özellik gibi sunuyordu.
 *
 * ⚠️ 2026-09-17 — v35 CİHAZDA OKUNMUYORDU. Kart zemini saydam renkli SVG
 * gradyandı; react-native-svg yerelde saydamlığı atıp düz limon blok çizdi,
 * açık renkli yazı üstünde kayboldu. Çizim `position: absolute` ile metnin
 * üstüne taşıyordu, rozet ve kenarlıklar kalabalık yapıyordu (kullanıcı:
 * "yazılar okunmuyor, çerçeveler basmakalıp, süperpozisyonlar"). Şimdi: düz
 * kart, kenarlık yok, çizim kendi kutusunda, tek dolu düğme. Kurallar:
 * components/OyunKartParcalari.tsx.
 *
 * ⚠️ KUPON YOKSA `bosken` ÇİZİLİR, NEDENİ AYRILARAK:
 *   "yok"        → sunucu cevap verdi, açık kupon YOK (sezon arası)
 *   "bilinmiyor" → sunucuya soramadık (misafir, ağ hatası)
 * Misafire "kupon hazırlanıyor" demek, kupon açıkken yalan olurdu.
 *
 * ⚠️ OTURUM HAZIR OLMADAN İSTEK ATILMIYOR (2026-09-17). `getAuthHeaders`
 * `auth.currentUser` boşsa başlıksız gönderiyor; uygulama açılışında Firebase
 * oturumu henüz yüklenmemişken kart bağlanınca `/api/kupon/aktif` 401
 * `AUTH_REQUIRED` dönüyor ve kart bir daha denemiyordu. Canlıda açık bir kupon
 * (W41) varken v35 cihazında "bilinmiyor" kartı görüldü. Artık yükleme
 * `useAuth().loading` bitince ve kullanıcı değişince yeniden yapılıyor.
 *
 * ⚠️ KALAN SÜRE SUNUCUDAN (`kalanSaniye`). Cihaz saatine güvenilmiyor —
 * kullanıcının saati yanlışsa geri sayım yalan söyler ve "daha var" derken
 * kilit kapanır. Aynı kural `app/kupon.tsx` içinde de yazılı.
 */

import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { apiJson } from "../lib/apiFetch";
import { getLang, t, useLang } from "../lib/i18n";
import { tarihAraligiEtiketi } from "../lib/macSaati";
import { ulkeAdi } from "../lib/ulkeler";
import { kuponBasligi, birincilKupon } from "../lib/kuponBaslik";
import {
  DUGME_YAZISI, IC_YUZEY, ILERLEME_BOS, METIN_ANA, METIN_IKINCIL, METIN_SOLUK, MOD_RENGI,
  kuponIlerlemesi,
} from "../lib/oyunMerkezi";
import Colors from "../constants/colors";
import { useAuth } from "../contexts/AuthContext";
import Basinc from "./Basinc";
import IskeletBlok from "./Iskelet";
import { KuponSanati } from "./OyunSanati";
import { KartBasi, parca } from "./OyunKartParcalari";

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
  const { user, loading: oturumYukleniyor } = useAuth();
  const uid = user?.uid || null;
  const [kupon, setKupon] = useState<KuponT | null>(null);
  const [liste, setListe] = useState<KuponT[]>([]);
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
      setListe(liste);
      /* Yalnız sunucu GERÇEKTEN cevap verdiyse "yok" — bkz. başlık. */
      setNeden(j?.ok ? "yok" : "bilinmiyor");
    } catch {
      setKupon(null);
      setNeden("bilinmiyor");
    }
    setLoading(false);
  }, []);

  /* Oturum yüklenmeden istek yok; kullanıcı değişince (misafir → Google
   * girişi) yeniden. bkz. başlık "OTURUM HAZIR OLMADAN".
   *
   * ⚠️ EKRANA HER DÖNÜŞTE YENİLENİR (2026-09-18, kullanıcı: "kupon oynayınca
   * ana sayfada o kupon seçenek olarak hâlâ sıfırdan sunuluyor"). Eskiden
   * yalnız ilk açılışta yükleniyordu: kupon ekranında katılıp geri dönen
   * oyuncu kartı "Katıl" ile görüyordu. */
  useFocusEffect(useCallback(() => {
    if (oturumYukleniyor) return;
    yukle();
  }, [oturumYukleniyor, uid, yukle]));

  if (loading) {
    return (
      <View style={parca.kart}>
        <View style={{ gap: 10 }}>
          <IskeletBlok style={{ width: 170, height: 20 }} />
          <IskeletBlok style={{ width: "80%", height: 14 }} />
          <IskeletBlok style={{ width: "100%", height: 8 }} />
          <IskeletBlok style={{ width: "60%", height: 14 }} />
        </View>
      </View>
    );
  }

  if (!kupon) return bosken ? <>{bosken(neden)}</> : null;

  const ilerleme = kuponIlerlemesi(kupon);

  /* Başlık `app/kupon.tsx` ile AYNI anahtardan — iki yüzey aynı kuponu farklı
   * adlandırırsa kullanıcı iki ayrı oyun sanır. Tek kaynak: lib/kuponBaslik.ts. */
  const baslik = kuponBasligi(kupon, t, ulkeAdi);
  /* Hangi haftanın kuponu — planlayıcı 4 hafta ileri kuruyor; tarih yazmayan
   * kart W41'e katılan oyuncuya W39'u "aynı kupon sıfırlanmış" gibi gösterdi. */
  const yerel = getLang() === "en" ? "en-US" : "tr-TR";
  const tarihi = (k: KuponT) => tarihAraligiEtiketi((k.maclar || []).map((m) => m.kickoffISO), { yerel });
  const digerKatilinan = liste.filter((k) => k.katildiMi && k.id !== kupon.id && k.durum === "open");

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
   * 360 px ekranda kesiliyordu ve geri sayımı iki satıra itiyordu. Sayı
   * kaybolmuyor: çubuğun yanında, uyarı renginde.
   */
  const eylem =
    ilerleme.asama === "katil" ? { yazi: t("kuponJoinFor", { n: kupon.girisBedeli }), zemin: RENK }
    : ilerleme.asama === "eksik" ? { yazi: t("kuponFill"), zemin: Colors.accent }
    : { yazi: t("kuponView"), zemin: null };
  const eksikMi = ilerleme.asama === "eksik";

  return (
    <Basinc onPress={() => router.push("/kupon")} scaleTo={0.98}>
      <View accessibilityRole="button" accessibilityLabel={`${t("weeklyKupon")}: ${baslik}`} style={parca.kart}>
        <KartBasi
          modu="kupon"
          Sanat={KuponSanati}
          ad={t("weeklyKupon")}
          alt={[baslik, tarihi(kupon)].filter(Boolean).join(" · ")}
        />
        <Text style={parca.aciklama}>{t("kuponHeroSub")}</Text>

        {/* Maç maç ilerleme: sekiz parça, dolu olan kupon renginde. */}
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

        {digerKatilinan.length > 0 && (
          <Text style={[s.digerKatilinan, { color: RENK }]} numberOfLines={1}>
            {t("homeOtherJoined", { d: digerKatilinan.map(tarihi).filter(Boolean).join(", ") })}
          </Text>
        )}

        <View style={s.altSatir}>
          <Text style={s.sure} numberOfLines={1}>⏳ {t("kuponClosesIn", { s: sureMetni(kupon.kalanSaniye) })}</Text>
          {eylem.zemin ? (
            <View style={[s.eylem, { backgroundColor: eylem.zemin }]}>
              <Text style={s.eylemYazi} numberOfLines={1}>{eylem.yazi}</Text>
            </View>
          ) : (
            <Text style={[parca.baglanti, { color: RENK }]}>✓ {eylem.yazi} ›</Text>
          )}
        </View>
      </View>
    </Basinc>
  );
}

const s = StyleSheet.create({
  ilerlemeSatiri: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  cubuk: { flex: 1, flexDirection: "row", gap: 4 },
  parca: { flex: 1, height: 6, borderRadius: 3 },
  ilerlemeYazi: { color: METIN_ANA, fontSize: 13, fontWeight: "800" },

  onizleme: { marginTop: 14, padding: 12, borderRadius: 14, backgroundColor: IC_YUZEY, gap: 4 },
  macSatiri: { color: METIN_ANA, fontSize: 14, fontWeight: "700" },
  vs: { color: METIN_SOLUK, fontWeight: "400" },
  kalanMac: { color: METIN_IKINCIL, fontSize: 13, marginTop: 2 },
  digerKatilinan: { fontSize: 13, fontWeight: "800", marginTop: 12 },

  altSatir: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    gap: 12, marginTop: 14,
  },
  sure: { color: METIN_IKINCIL, fontSize: 13, fontWeight: "700", flexShrink: 1 },
  eylem: { borderRadius: 999, paddingHorizontal: 18, paddingVertical: 11 },
  eylemYazi: { color: DUGME_YAZISI, fontWeight: "900", fontSize: 14 },
});
