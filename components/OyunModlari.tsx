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
import { View, Text, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import Colors from "../constants/colors";
import { t, useLang } from "../lib/i18n";
import Basinc from "./Basinc";
import GradyanZemin from "./GradyanZemin";

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

/**
 * ⚠️ AÇIKLAMA RENGİ ÖLÇÜLDÜ — `Colors.muted` DEĞİL.
 *
 * Kullanıcı bildirimi (2026-08-31): "Renkler ve yazılar sönük ve oturmamış."
 * Ölçüm bunu doğruladı ve YERİNİ gösterdi — kart zeminleri gradyan yüzünden
 * mod rengine kayıyor ve `Colors.muted` (#64748b) o zeminlerde:
 *
 *   tek 2.69 · kupon 2.53 · mini 2.62 · gs 2.86 · düello 2.71 · havuz 2.76
 *
 * WCAG AA eşiği 4.5. Kartın NE OLDUĞUNU anlatan tek satır okunmuyordu.
 * Bu ton altı zeminin altısında da 4.69+ veriyor (sayfa zemininde 7.62).
 *
 * ⚠️ RENGİ ZEMİNE KOYARAK CANLANDIRMA — ölçüldü, ters teper. Gradyan üst
 * alfası %19→%27 yapılınca açıklama 3.77, bedel 4.12 oluyor: ikisi de eşiğin
 * altına düşüyor. Renk kimliği METİN TAŞIMAYAN kanallardan gelmeli — sol
 * kenar şeridi, kenarlık ve emoji rozeti. Onlarda metin eşiği yok.
 */
const ACIKLAMA_RENGI = "#94a3b8";

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
      {/* ⚠️ BU ŞERİT ARTIK EKRANIN İLK İÇERİK BLOĞU (bkz. live.tsx). Başlık
          14px ve alt yazı `Colors.muted` idi; ikincil bir bölüm başlığı gibi
          duruyordu. Alt yazının sayfa zemininde ölçülen kontrastı 4.11 —
          eşiğin altı. */}
      <Text style={{ color: Colors.text, fontSize: 16, fontWeight: "900", letterSpacing: 0.2 }}>
        {t("whatToPlay")}
      </Text>
      <Text style={{ color: ACIKLAMA_RENGI, fontSize: 11.5, marginTop: 2, marginBottom: 10 }}>
        {t("sixModes")}
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingRight: 8 }}
      >
        {modlar.map((m) => (
          <Basinc
            key={m.key}
            onPress={m.bas}
            scaleTo={0.94}
          >
            <View
              accessibilityRole="button"
              accessibilityLabel={`${m.ad}: ${m.aciklama}`}
              style={{
                width: 148,
                padding: 12,
                borderRadius: 14,
                backgroundColor: Colors.card,
                borderWidth: 1,
                borderColor: `${m.renk}99`,
                overflow: "hidden",
              }}
            >
              {/* Mod renginden karta akan gradyan — düz kart "ayarlar menüsü"
                  gibi duruyordu; renk kimliği karta yayılınca oyun rafı oldu. */}
              <GradyanZemin renkler={[`${m.renk}30`, `${m.renk}05`]} yon="dikey" />
              {/* ⚠️ RENK KİMLİĞİ BURADAN GELİYOR, ZEMİNDEN DEĞİL. Gradyanı
                  koyulaştırmak kartın kendi yazısını okunmaz yapıyor (ölçüm
                  ACIKLAMA_RENGI başlığında). Şerit metin taşımadığı için
                  eşiğe takılmaz; `position: absolute` ana kabın padding'ini
                  yok sayar, yani içerik hizası değişmez. */}
              <View
                style={{
                  position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
                  backgroundColor: m.renk,
                }}
              />
              {/* Dilden bağımsız tanınırlık: büyük emoji + renkli rozet zemin.
                  Kullanıcı isteği (2026-08-09): mod kartları yazı okumadan seçilebilsin. */}
              <View
                style={{
                  alignSelf: "flex-start",
                  backgroundColor: `${m.renk}33`,
                  borderRadius: 12,
                  paddingHorizontal: 9,
                  paddingVertical: 5,
                }}
              >
                <Text style={{ fontSize: 32 }}>{m.ikon}</Text>
              </View>
              <Text style={{ color: Colors.text, fontSize: 13.5, fontWeight: "800", marginTop: 7 }}>
                {m.ad}
              </Text>
              <Text
                style={{ color: ACIKLAMA_RENGI, fontSize: 10.5, marginTop: 3, lineHeight: 14, minHeight: 28 }}
                numberOfLines={2}
              >
                {m.aciklama}
              </Text>
              {/* ⚠️ YÜKSEKLİK SABİT — bedel VERİYE bağlı, düzen olmamalı.
                  `macBedeli` ve `kuponBedeli` live.tsx'te `null` başlıyor ve
                  sunucudan sonra doluyor; koşullu render ilk boyamada iki
                  kartı ötekilerden ~20px kısa bırakıyordu — kullanıcının
                  "oturmamış" dediği tırtıklı şerit tam olarak buydu. */}
              <View style={{ height: 20, justifyContent: "flex-end" }}>
                {m.bedel ? (
                  <Text
                    style={{ color: m.renk, fontSize: 10.5, fontWeight: "800" }}
                    numberOfLines={1}
                  >
                    {m.bedel}
                  </Text>
                ) : null}
              </View>
            </View>
          </Basinc>
        ))}
      </ScrollView>
    </View>
  );
}
