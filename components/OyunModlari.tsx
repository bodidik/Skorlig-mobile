/**
 * OYUN MODLARI ŞERİDİ — kullanıcı ne oynayabileceğini ilk bakışta görsün.
 *
 * ⚠️ NEDEN VAR: altı ayrı oyun modu farklı ekranlara dağılmış durumda. Yeni
 * kullanıcı maç listesini görüyor ve "tahmin gir"den ötesini keşfetmiyor —
 * düello, havuz, kupon hiç denenmeden kalıyor. Keşfedilmeyen özellik,
 * olmayan özelliktir.
 *
 * ⚠️ HER MODUN ERİŞİM YOLU FARKLI, HEPSİ ROTA DEĞİL. Kodu okumadan yazınca
 * üç kart ölü çıkmıştı; doğrulanmış hâli:
 *   tek maç   → /(tabs)/predict          (ayrı ekran)
 *   kupon     → /kupon                   (ayrı ekran)
 *   düello    → /(tabs)/arena            (açık düello lobisi)
 *   mini      → /mini/create             (ayrı ekran)
 *   havuz     → app/pool/[fixtureId]     ⚠️ MAÇA ÖZEL, tek başına açılamaz
 *   1987GS    → live.tsx içi mod         ⚠️ ROTA DEĞİL, ekran içi sekme
 *
 * ⚠️ EKRAN İÇİ MODLAR router.push İLE AÇILMAZ. live.tsx'te mod
 * `useState(initialMode)` ile kuruluyor; sekme ekranı monte kaldığı için
 * `?tab=` parametresiyle tekrar push etmek mod'u DEĞİŞTİRMEZ — düğme sessizce
 * ölür. Bu yüzden `onMod` geri çağrısı var.
 *
 * ⚠️ BEDELLER SUNUCUDAN. Ekrana "3 LC" gömülmüyor — bedel değişince metin
 * yalan söylerdi (premium ekranında aynı hata bulunmuştu). Bilinmiyorsa
 * hiç gösterilmiyor.
 *
 * ⚠️ ÜCRETLİ TURNUVA BİLEREK YOK. Delikleri kapatıldı ama dengesi çözülmedi:
 * kaybeden bahsinin %60'ını geri alıyor, ev payı yok, beraberlik kuralı yok.
 * En zayıf modu öne çıkarmak kullanıcıyı oraya yönlendirmek olurdu.
 */

import React from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import Colors from "../constants/colors";
import { t, useLang } from "../lib/i18n";

export type OyunModlariProps = {
  /** Maç girişi bedeli (LC) — cüzdan özetindeki `pricing.matchEntryCost`. */
  macBedeli?: number | null;
  /** Haftalık kupon bedeli (LC) — `/api/kupon/aktif` → `girisBedeli`. */
  kuponBedeli?: number | null;
  /** 1987 üyesi mi — üye değilse doğrulama ekranına gider. */
  is1987?: boolean;
  /** Ekran içi mod değiştirici (live.tsx'in setMode'u). Rota push'u işe yaramaz. */
  onMod?: (mod: "open" | "gs1987") => void;
};

type Mod = {
  key: string;
  ikon: string;
  ad: string;
  aciklama: string;
  bedel?: string | null;
  renk: string;
  bas: () => void;
};

export default function OyunModlari({
  macBedeli,
  kuponBedeli,
  is1987,
  onMod,
}: OyunModlariProps) {
  useLang(); // dil değişince yeniden çizilsin
  const router = useRouter();

  const bedelMetni = (n?: number | null) =>
    typeof n === "number" && n > 0 ? `${n} LC` : null;

  /**
   * ⚠️ SIRA BİLİNÇLİ — BECERİ ODAKLI MODLAR ÖNDE, BAHİS BENZERİ MEKANİK ARKADA.
   *
   * Düello ve havuz, ürünün diğer modlarından yapısal olarak farklı: düelloda
   * potun bir kısmı kesiliyor (`api/lib/duello-kesinti.cjs`) ve havuz
   * pari-mutuel — yani ödül, diğer oyuncuların koyduğu LC'den geliyor. İkisi de
   * bir bahisçinin mekaniği; tek maç, haftalık tahmin ve mini turnuva ise
   * ödülü BAŞARIDAN üretiyor (bkz. api/lib/kupon.cjs başlığı).
   *
   * Bu ayrımın iki somut sonucu var:
   *   1. Google Play içerik derecelendirmesi (IARC) "simulated gambling"
   *      soruyor. Bahis benzeri yüzey ne kadar öndeyse, uygulama o kadar
   *      bahis simülatörü gibi görünür ve 18+ derecelendirme erişimi keser.
   *   2. Türkiye'de bahis çağrışımı kullanıcıda "dolandırılıyor muyum"
   *      hissi yaratıyor. Ürün ücretsiz ve sanal para ile çalışıyor; vitrinin
   *      bunu ilk bakışta anlatması gerekiyor.
   *
   * ⚠️ KALDIRILMADILAR, YALNIZCA GERİYE ALINDILAR. Erişilebilir kalıyorlar;
   * amaç ilk izlenimi değiştirmek, özelliği kısmak değil.
   */
  const modlar: Mod[] = [
    {
      key: "tek",
      ikon: "⚽",
      ad: t("modeSingle"),
      aciklama: t("modeSingleDesc"),
      bedel: bedelMetni(macBedeli),
      renk: "#22c55e",
      bas: () => router.push("/(tabs)/predict" as any),
    },
    {
      key: "kupon",
      ikon: "🎟️",
      ad: t("weeklyKupon"),
      aciklama: t("modeKuponDesc"),
      bedel: bedelMetni(kuponBedeli),
      renk: "#22d3ee",
      bas: () => router.push("/kupon" as any),
    },
    {
      key: "mini",
      ikon: "🏅",
      ad: t("modeMini"),
      aciklama: t("modeMiniDesc"),
      bedel: t("freeLbl"),
      renk: "#38bdf8",
      bas: () => router.push("/mini/create" as any),
    },
    {
      key: "gs1987",
      ikon: "🔴",
      ad: "1987GS",
      aciklama: t("modeGsDesc"),
      bedel: is1987 ? t("membersOpen") : t("codeNeeded"),
      renk: "#f87171",
      // Üye ise ekran içi mod; değilse doğrulama ekranı (o gerçek bir rota).
      bas: () => (is1987 ? onMod?.("gs1987") : router.push("/gs1987-verify" as any)),
    },
    /* ── Buradan sonrası: kesinti/havuz mekaniği taşıyan modlar ───────── */
    {
      key: "duello",
      ikon: "⚔️",
      ad: t("modeDuel"),
      aciklama: t("modeDuelDesc"),
      bedel: t("youPickStake"),
      renk: "#f59e0b",
      bas: () => router.push("/(tabs)/arena" as any),
    },
    {
      key: "havuz",
      ikon: "💰",
      ad: t("matchPool"),
      // ⚠️ Havuz maça özel: rota fixtureId istiyor. Kullanıcıyı maç listesine
      // yollayıp nereden açacağını SÖYLÜYORUZ — sessiz bir düğmeden iyidir.
      aciklama: t("modePoolDesc"),
      bedel: t("youPickStake"),
      renk: "#a78bfa",
      bas: () => onMod?.("open"),
    },
  ];

  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: Colors.text, fontSize: 14, fontWeight: "800", marginBottom: 2 }}>
        {t("whatToPlay")}
      </Text>
      <Text style={{ color: Colors.muted, fontSize: 11, marginBottom: 10 }}>
        {t("sixModes")}
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingRight: 8 }}
      >
        {modlar.map((m) => (
          <TouchableOpacity
            key={m.key}
            onPress={m.bas}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`${m.ad}: ${m.aciklama}`}
            style={{
              width: 138,
              padding: 12,
              borderRadius: 12,
              backgroundColor: Colors.card,
              borderWidth: 1,
              borderColor: `${m.renk}44`,
            }}
          >
            {/* Dilden bağımsız tanınırlık: büyük emoji + renkli rozet zemin.
                Kullanıcı isteği (2026-08-09): mod kartları yazı okumadan seçilebilsin. */}
            <View
              style={{
                alignSelf: "flex-start",
                backgroundColor: `${m.renk}22`,
                borderRadius: 10,
                paddingHorizontal: 8,
                paddingVertical: 4,
              }}
            >
              <Text style={{ fontSize: 26 }}>{m.ikon}</Text>
            </View>
            <Text style={{ color: Colors.text, fontSize: 13, fontWeight: "800", marginTop: 6 }}>
              {m.ad}
            </Text>
            <Text
              style={{ color: Colors.muted, fontSize: 10, marginTop: 3, lineHeight: 14, minHeight: 28 }}
              numberOfLines={2}
            >
              {m.aciklama}
            </Text>
            {m.bedel ? (
              <Text style={{ color: m.renk, fontSize: 10, fontWeight: "700", marginTop: 6 }}>
                {m.bedel}
              </Text>
            ) : null}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}
