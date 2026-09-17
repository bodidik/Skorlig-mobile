/**
 * OYUN MERKEZİ — ana ekranın ilk içerik bloğu: ne oynanır ve HEMEN oyna.
 *
 * ⚠️ KULLANICI BİLDİRİMİ (2026-09-16): "Kullanıcı o menüsel sayfada hemen işin
 * içine katılabilmeli. Görseller yetersiz. Tek maç, haftalık, mini turnuva vs
 * yazıları ve görünümleri yetersiz."
 *
 * ⚠️ KULLANICI BİLDİRİMİ (2026-09-17, v35 cihaz görüntüsüyle): "Şu gibi
 * keşmekeş bir yerde insanlar yolunu bulabilir mi? Yazılar okunmuyor,
 * çerçeveler basmakalıp, süperpozisyonlar."
 * İlk sürümün cihazda çökmesinin üç sebebi ölçüldü:
 *   1. Kart zeminleri saydam renkli SVG gradyandı. react-native-svg yerelde
 *      sekiz haneli rengin saydamlığını atıyor → düz limon/mavi/sarı bloklar,
 *      üstündeki açık yazı okunmaz. Web önizlemesi saydamlığı uyguladığı için
 *      görünmedi (bkz. lib/oyunMerkezi.ts başlığı).
 *   2. Çizimler `position: absolute` ile metnin üstüne, haleleri kart
 *      kenarına taşıyordu; her kartın renkli kenarlığı, rozeti, iç düğme
 *      çerçeveleri vardı — beş iç içe kutu.
 *   3. Dört mod dört ayrı çerçeveli karo olarak ızgaradaydı.
 * Şimdiki kurallar (components/OyunKartParcalari.tsx): düz zemin, kenarlık
 * yok, üst üste binme yok, kart başına tek dolu düğme; ikincil modlar TEK
 * liste kartında satır satır.
 *
 * Düzen:
 *   1. HAFTALIK TAHMİN — kuponun kendisi (KuponKarti).
 *   2. TEK MAÇ — günün maçı kartın İÇİNDE: 1-X-2 bu ekrandan gönderiliyor.
 *   3. DİĞER OYUNLAR — tek kart, satırlar: ikon, ad, açıklama, bedel, ›.
 *
 * ⚠️ HER MODUN ERİŞİM YOLU FARKLI, HEPSİ ROTA DEĞİL:
 *   tek maç   → /(tabs)/predict          (ayrı ekran)
 *   kupon     → /kupon                   (ayrı ekran)
 *   düello    → /(tabs)/arena            (açık düello lobisi)
 *   mini      → /mini/create             (ayrı ekran)
 *   havuz     → app/pool/[fixtureId]     ⚠️ MAÇA ÖZEL, tek başına açılamaz
 *   1987GS    → live.tsx içi mod         ⚠️ ROTA DEĞİL, ekran içi sekme
 * Ekran içi modlar `router.push` ile açılmaz: live.tsx monte kaldığı için
 * `?tab=` ile tekrar push etmek modu DEĞİŞTİRMEZ — `onMod` bu yüzden var.
 *
 * ⚠️ SIRA BİLİNÇLİ — BECERİ ODAKLI MODLAR ÖNDE, BAHİS BENZERİ MEKANİK ARKADA.
 * Düelloda potun bir kısmı kesiliyor (`api/lib/duello-kesinti.cjs`), havuz
 * pari-mutuel. Google Play IARC "simulated gambling" soruyor; 13 Eylül'den
 * beri çıkış sürümünde ikisi gizli — kartlar sunucu bayrağına bağlı
 * (`modAcikMi`). Çizimlerde de jeton/para yok.
 *
 * ⚠️ BEDELLER SUNUCUDAN. Ekrana "3 LC" gömülmüyor; bilinmiyorsa gösterilmiyor.
 */

import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { t, useLang } from "../lib/i18n";
import { modAcikMi } from "../lib/ozellikler";
import { useOzellikler } from "../hooks/useOzellikler";
import {
  DUGME_YAZISI, IC_YUZEY, KART_ZEMINI, METIN_ANA, METIN_IKINCIL, METIN_SOLUK, MOD_RENGI, MOD_SIRASI,
  digerModlar, type ModAnahtari,
} from "../lib/oyunMerkezi";
import Basinc from "./Basinc";
import KuponKarti from "./KuponKarti";
import DailyMatchCard from "./DailyMatchCard";
import { IkonKutusu, KartBasi, parca, type SanatBileseni } from "./OyunKartParcalari";
import {
  DuelloSanati, GsSanati, HavuzSanati, KuponSanati, MiniSanati, TekMacSanati,
} from "./OyunSanati";

export type OyunMerkeziProps = {
  /** Maç girişi bedeli (LC) — cüzdan özetindeki `pricing.matchEntryCost`. */
  macBedeli?: number | null;
  /** Haftalık kupon bedeli (LC) — kompakt satırda kullanılmaz, kupon kartı kendi verisini okur. */
  kuponBedeli?: number | null;
  /** 1987 üyesi mi — üye değilse doğrulama ekranına gider. */
  is1987?: boolean;
  /** Ekran içi mod değiştirici (live.tsx'in setMode'u). Rota push'u işe yaramaz. */
  onMod?: (mod: "open" | "gs1987") => void;
  /**
   * Maç listesi modunda mı. Evetse tam merkez; hayırsa (Benimkiler,
   * Turnuvalar, 1987) tek satırlık kompakt mod düğmeleri — o modlarda
   * kullanıcının kendi içeriği merkezin altında ve itilmemeli.
   */
  tam?: boolean;
  country?: string | null;
  userId?: string;
};

type Mod = {
  key: ModAnahtari;
  ad: string;
  aciklama: string;
  bedel: string | null;
  Sanat: SanatBileseni;
  bas: () => void;
};

export default function OyunMerkezi({
  macBedeli, kuponBedeli, is1987, onMod, tam = false, country, userId,
}: OyunMerkeziProps) {
  useLang(); // dil değişince yeniden çizilsin
  const router = useRouter();
  const ozellik = useOzellikler();

  const bedelMetni = (n?: number | null) => (typeof n === "number" && n > 0 ? `${n} LC` : null);
  const tahmineGit = () => router.push("/(tabs)/predict" as any);

  const tanim: Record<ModAnahtari, Omit<Mod, "key">> = {
    kupon: {
      ad: t("weeklyKupon"), aciklama: t("kuponHeroSub"), bedel: bedelMetni(kuponBedeli),
      Sanat: KuponSanati, bas: () => router.push("/kupon" as any),
    },
    tek: {
      ad: t("modeSingle"), aciklama: t("singleHeroSub"), bedel: bedelMetni(macBedeli),
      Sanat: TekMacSanati, bas: tahmineGit,
    },
    mini: {
      ad: t("modeMini"), aciklama: t("modeMiniDesc2"), bedel: t("freeLbl"),
      Sanat: MiniSanati, bas: () => router.push("/mini/create" as any),
    },
    gs1987: {
      ad: "1987GS", aciklama: t("modeGsDesc"), bedel: is1987 ? t("membersOpen") : t("codeNeeded"),
      Sanat: GsSanati,
      // Üye ise ekran içi mod; değilse doğrulama ekranı (o gerçek bir rota).
      bas: () => (is1987 ? onMod?.("gs1987") : router.push("/gs1987-verify" as any)),
    },
    duello: {
      ad: t("modeDuel"), aciklama: t("modeDuelDesc"), bedel: t("youPickStake"),
      Sanat: DuelloSanati, bas: () => router.push("/(tabs)/arena" as any),
    },
    havuz: {
      // ⚠️ Havuz maça özel: rota fixtureId istiyor. Kullanıcıyı maç listesine
      // yollayıp nereden açacağını SÖYLÜYORUZ — sessiz bir düğmeden iyidir.
      ad: t("matchPool"), aciklama: t("modePoolDesc"), bedel: t("youPickStake"),
      Sanat: HavuzSanati, bas: () => onMod?.("open"),
    },
  };

  const gorunenModlar: Mod[] = MOD_SIRASI
    .filter((key) => modAcikMi(key, ozellik))
    .map((key) => ({ key, ...tanim[key] }));

  /* ⚠️ TAM DEĞİLKEN KOMPAKT SATIR. Benimkiler/Turnuvalar/1987 modlarında
   * kullanıcının kendi içeriği merkezin ALTINDA; tam merkez o içeriği ilk
   * ekrandan itiyordu (önizlemede ~650 px ölçüldü). */
  if (!tam) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.kompaktKok}
        contentContainerStyle={{ gap: 8, paddingRight: 8 }}
      >
        {gorunenModlar.map((m) => <KompaktDugme key={m.key} m={m} />)}
      </ScrollView>
    );
  }

  const diger = digerModlar(gorunenModlar);
  const kuponVar = gorunenModlar.some((m) => m.key === "kupon");
  const tekVar = gorunenModlar.some((m) => m.key === "tek");

  return (
    <View style={s.kok}>
      <Text style={s.baslik}>{t("whatToPlay")}</Text>

      {/* 1 ─ HAFTALIK TAHMİN. Kupon yoksa mod kaybolmuyor. */}
      {kuponVar && (
        <KuponKarti
          bosken={(neden) => (
            /* "yok": sunucu açık kupon olmadığını SÖYLEDİ. "bilinmiyor": soramadık
             * (misafir, ağ) — o zaman "hazırlanıyor" yalan olabilir. */
            <Basinc onPress={tanim.kupon.bas} scaleTo={0.98}>
              <View accessibilityRole="button" accessibilityLabel={tanim.kupon.ad} style={parca.kart}>
                <KartBasi
                  modu="kupon"
                  Sanat={KuponSanati}
                  ad={tanim.kupon.ad}
                  alt={neden === "yok" ? t("kuponSoon") : null}
                />
                <Text style={parca.aciklama}>
                  {neden === "yok" ? t("kuponSoonSub") : tanim.kupon.aciklama}
                </Text>
                <Text style={[parca.baglanti, s.altBaglanti, { color: MOD_RENGI.kupon }]}>
                  {t("lookAround")} ›
                </Text>
              </View>
            </Basinc>
          )}
        />
      )}

      {/* 2 ─ TEK MAÇ: günün maçı kartın İÇİNDE, 1-X-2 buradan gönderiliyor. */}
      {tekVar && (
        <View style={parca.kart}>
          <KartBasi
            modu="tek"
            Sanat={TekMacSanati}
            ad={tanim.tek.ad}
            alt={[t("dailyMatchLbl"), tanim.tek.bedel].filter(Boolean).join(" · ")}
            sag={
              <Basinc onPress={tahmineGit} scaleTo={0.94}>
                <Text style={[parca.baglanti, { color: MOD_RENGI.tek }]}>{t("allMatchesLink")} ›</Text>
              </Basinc>
            }
          />
          <DailyMatchCard
            gomulu
            country={country || undefined}
            userId={userId}
            bosken={
              <Basinc onPress={tahmineGit} scaleTo={0.97}>
                <View style={[s.dolguEylem, { backgroundColor: MOD_RENGI.tek }]}>
                  <Text style={s.dolguEylemYazi}>{t("pickAMatch")}</Text>
                </View>
              </Basinc>
            }
          />
        </View>
      )}

      {/* 3 ─ DİĞER OYUNLAR: tek kart, satırlar. Dört ayrı çerçeveli karo
          "keşmekeş"in parçasıydı; liste taranabilir ve sırası belli. */}
      {diger.length > 0 && (
        <>
          <Text style={s.bolum}>{t("otherGames")}</Text>
          <View style={[parca.kart, s.liste]}>
            {diger.map((m, i) => <ModSatiri key={m.key} m={m} ilk={i === 0} />)}
          </View>
        </>
      )}
    </View>
  );
}

/**
 * Liste satırı: ikon kutusu, ad + açıklama + bedel, sağda ›.
 *
 * ⚠️ BEDEL SAĞ SÜTUNDA DEĞİL (emülatörde ölçüldü): "miktarı sen seç" /
 * "you pick the amount" sağ sütunda "you pick the am…" diye kesiliyordu ve
 * açıklamayı daraltıyordu. Açıklamanın altında tam genişlikte.
 */
function ModSatiri({ m, ilk }: { m: Mod; ilk: boolean }) {
  return (
    <Basinc onPress={m.bas} scaleTo={0.98}>
      <View
        accessibilityRole="button"
        accessibilityLabel={`${m.ad}: ${m.aciklama}`}
        style={[s.satir, !ilk && s.satirAyrac]}
      >
        <IkonKutusu modu={m.key} Sanat={m.Sanat} boyut={48} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.satirAd} numberOfLines={1}>{m.ad}</Text>
          <Text style={s.satirAciklama} numberOfLines={2}>{m.aciklama}</Text>
          {m.bedel ? (
            <Text style={[s.satirBedel, { color: MOD_RENGI[m.key] }]} numberOfLines={1}>{m.bedel}</Text>
          ) : null}
        </View>
        <Text style={s.ok}>›</Text>
      </View>
    </Basinc>
  );
}

/** Kompakt satır düğmesi: küçük ikon kutusu + ad. */
function KompaktDugme({ m }: { m: Mod }) {
  return (
    <Basinc onPress={m.bas} scaleTo={0.95}>
      <View accessibilityRole="button" accessibilityLabel={`${m.ad}: ${m.aciklama}`} style={s.kompakt}>
        <IkonKutusu modu={m.key} Sanat={m.Sanat} boyut={30} />
        <Text style={s.kompaktAd} numberOfLines={1}>{m.ad}</Text>
      </View>
    </Basinc>
  );
}

const s = StyleSheet.create({
  kok: { marginBottom: 6 },
  baslik: { color: METIN_ANA, fontSize: 21, fontWeight: "800", marginBottom: 12 },
  bolum: { color: METIN_SOLUK, fontSize: 13, fontWeight: "800", marginBottom: 8, marginTop: 2 },

  altBaglanti: { marginTop: 12 },
  dolguEylem: { marginTop: 14, borderRadius: 999, paddingVertical: 13, alignItems: "center" },
  dolguEylemYazi: { color: DUGME_YAZISI, fontSize: 15, fontWeight: "900" },

  liste: { paddingVertical: 4, paddingHorizontal: 14 },
  satir: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  satirAyrac: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: IC_YUZEY },
  satirAd: { color: METIN_ANA, fontSize: 16, fontWeight: "800" },
  satirAciklama: { color: METIN_IKINCIL, fontSize: 13, lineHeight: 18, marginTop: 2 },
  satirBedel: { fontSize: 12, fontWeight: "800", marginTop: 4 },
  ok: { color: METIN_SOLUK, fontSize: 22, fontWeight: "400", marginTop: -2 },

  kompaktKok: { marginBottom: 12, flexGrow: 0 },
  kompakt: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingLeft: 5, paddingRight: 14, paddingVertical: 5,
    borderRadius: 999, backgroundColor: KART_ZEMINI,
  },
  kompaktAd: { color: METIN_ANA, fontSize: 14, fontWeight: "800" },
});
