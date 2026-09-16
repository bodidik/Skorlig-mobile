/**
 * OYUN MERKEZİ — ana ekranın ilk içerik bloğu: ne oynanır, NASIL oynanır,
 * ve HEMEN oyna.
 *
 * ⚠️ KULLANICI BİLDİRİMİ (2026-09-16): "Kullanıcı o menüsel sayfada hemen işin
 * içine katılabilmeli. Görseller yetersiz. Tek maç, haftalık, mini turnuva vs
 * yazıları ve görünümleri yetersiz. Basit görünüm devasa uygulamayı temsil
 * edemiyor."
 *
 * Eski hâl (`components/OyunModlari.tsx`) ölçüldü — 375 px ekranda:
 *   · 148 px'lik kartlar YATAY kayıyordu; aynı anda yalnız 2 mod görünüyordu.
 *   · Her modun tek görseli 32 px emojiydi; açıklama iki satır, 10.5 px.
 *   · Kartlar yalnız BAŞKA EKRANA götürüyordu. Oyunun kendisi — haftalık
 *     kupon ve günün maçının 1-X-2'si — şeridin altında ayrı bloklardaydı;
 *     şerit, oynanacak şeyin ÖNÜNDE duran bir içindekiler tablosuydu.
 *
 * Yeni düzen üç katman:
 *   1. HAFTALIK TAHMİN — geniş kart, kuponun kendisi: geri sayım, maç maç
 *      ilerleme, ilk maçlar ve duruma göre tek eylem (katıl / tamamla / gör).
 *   2. TEK MAÇ — geniş kart, günün maçı İÇİNDE: 1-X-2 seçimi ve gönderim bu
 *      ekrandan çıkmadan yapılıyor.
 *   3. Diğer modlar — iki sütunlu ızgara, her biri çizim + ne olduğu + eylem.
 * Kupon ya da günün maçı yoksa o mod kaybolmuyor, ızgara kartı gibi duruyor.
 *
 * ⚠️ HER MODUN ERİŞİM YOLU FARKLI, HEPSİ ROTA DEĞİL (eski şeridin doğrulanmış
 * notu aynen geçerli):
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
 * pari-mutuel; ikisi de bir bahisçinin mekaniği. Google Play IARC "simulated
 * gambling" soruyor ve Türkiye'de bahis çağrışımı "dolandırılıyor muyum"
 * hissi yaratıyor. 13 Eylül 2026'dan beri çıkış sürümünde ikisi de gizli —
 * kartlar sunucu bayrağına bağlı (`modAcikMi`). Çizimlerde de jeton/para yok.
 *
 * ⚠️ BEDELLER SUNUCUDAN. Ekrana "3 LC" gömülmüyor; bilinmiyorsa gösterilmiyor.
 *
 * ⚠️ ÜCRETLİ TURNUVA BİLEREK YOK: dengesi çözülmedi (kaybeden bahsinin %60'ını
 * geri alıyor, ev payı yok, beraberlik kuralı yok).
 */

import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import Colors from "../constants/colors";
import { t, useLang } from "../lib/i18n";
import { modAcikMi } from "../lib/ozellikler";
import { useOzellikler } from "../hooks/useOzellikler";
import {
  ACIKLAMA_RENGI, KENARLIK_ALFA, MOD_RENGI, MOD_SIRASI, ROZET_ALFA, ROZET_YAZI_ACMA, ZEMIN_ALT_ALFA,
  ZEMIN_UST_ALFA, acikTon, alfa, izgaraModlari, type ModAnahtari,
} from "../lib/oyunMerkezi";
import Basinc from "./Basinc";
import GradyanZemin from "./GradyanZemin";
import KuponKarti from "./KuponKarti";
import DailyMatchCard from "./DailyMatchCard";
import {
  DuelloSanati, GsSanati, HavuzSanati, KuponSanati, MiniSanati, TekMacSanati,
} from "./OyunSanati";

export type OyunMerkeziProps = {
  /** Maç girişi bedeli (LC) — cüzdan özetindeki `pricing.matchEntryCost`. */
  macBedeli?: number | null;
  /** Haftalık kupon bedeli (LC) — yalnız ızgara kartında (kupon geniş kartı kendi verisini okur). */
  kuponBedeli?: number | null;
  /** 1987 üyesi mi — üye değilse doğrulama ekranına gider. */
  is1987?: boolean;
  /** Ekran içi mod değiştirici (live.tsx'in setMode'u). Rota push'u işe yaramaz. */
  onMod?: (mod: "open" | "gs1987") => void;
  /**
   * Maç listesi modunda mı. Evetse kupon ve günün maçı canlı içerikli geniş
   * kartlar olarak çiziliyor; hayırsa (Benimkiler, Turnuvalar, 1987) bütün
   * modlar ızgarada — o modların ekranı kendi içeriğine odaklı.
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
  eylem: string;
  Sanat: React.ComponentType<{ boyut?: number }>;
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
      eylem: t("ctaKupon"), Sanat: KuponSanati, bas: () => router.push("/kupon" as any),
    },
    tek: {
      ad: t("modeSingle"), aciklama: t("singleHeroSub"), bedel: bedelMetni(macBedeli),
      eylem: t("ctaPlay"), Sanat: TekMacSanati, bas: tahmineGit,
    },
    mini: {
      ad: t("modeMini"), aciklama: t("modeMiniDesc2"), bedel: t("freeLbl"),
      eylem: t("ctaMini"), Sanat: MiniSanati, bas: () => router.push("/mini/create" as any),
    },
    gs1987: {
      ad: "1987GS", aciklama: t("modeGsDesc"), bedel: is1987 ? t("membersOpen") : t("codeNeeded"),
      eylem: is1987 ? t("ctaGsMember") : t("ctaGsCode"), Sanat: GsSanati,
      // Üye ise ekran içi mod; değilse doğrulama ekranı (o gerçek bir rota).
      bas: () => (is1987 ? onMod?.("gs1987") : router.push("/gs1987-verify" as any)),
    },
    duello: {
      ad: t("modeDuel"), aciklama: t("modeDuelDesc"), bedel: t("youPickStake"),
      eylem: t("ctaDuel"), Sanat: DuelloSanati, bas: () => router.push("/(tabs)/arena" as any),
    },
    havuz: {
      // ⚠️ Havuz maça özel: rota fixtureId istiyor. Kullanıcıyı maç listesine
      // yollayıp nereden açacağını SÖYLÜYORUZ — sessiz bir düğmeden iyidir.
      ad: t("matchPool"), aciklama: t("modePoolDesc"), bedel: t("youPickStake"),
      eylem: t("ctaPool"), Sanat: HavuzSanati, bas: () => onMod?.("open"),
    },
  };

  const gorunenModlar: Mod[] = MOD_SIRASI
    .filter((key) => modAcikMi(key, ozellik))
    .map((key) => ({ key, ...tanim[key] }));
  /* ⚠️ TAM DEĞİLKEN KOMPAKT SATIR. Benimkiler/Turnuvalar/1987 modlarında
   * kullanıcının kendi içeriği merkezin ALTINDA. Tam ızgara (3 satır × ~200 px)
   * o içeriği ilk ekrandan itiyordu — önizlemede ölçüldü, "Benimkiler" listesi
   * ~650 px aşağıya düştü. Orada mod keşfi ikincil: tek satır, küçük çizim. */
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

  const izgara = izgaraModlari(gorunenModlar, true);
  const kuponVar = gorunenModlar.some((m) => m.key === "kupon");
  const tekVar = gorunenModlar.some((m) => m.key === "tek");

  return (
    <View style={s.kok}>
      <Text style={s.ustBaslik}>{t("gameHub")}</Text>
      <Text style={s.baslik}>{t("whatToPlay")}</Text>
      {/* Sayı SAYILIYOR: gizli modlar varken sabit "6 mod" metni yalan olurdu. */}
      <Text style={s.altBaslik}>{t("modesCount", { n: gorunenModlar.length })}</Text>

      {/* 1 ─ HAFTALIK TAHMİN: kuponun kendisi. Kupon yoksa (sezon arası,
          misafir) mod kaybolmuyor — geniş bir tanıtım kartı duruyor. */}
      {kuponVar && (
        <KuponKarti
          bosken={(neden) => (
            /* "yok": sunucu açık kupon olmadığını SÖYLEDİ. "bilinmiyor": soramadık
             * (misafir, ağ) — o zaman "hazırlanıyor" yalan olabilir, genel tanıtım. */
            <GenisModKarti
              m={{
                key: "kupon", ...tanim.kupon,
                aciklama: neden === "yok" ? t("kuponSoonSub") : tanim.kupon.aciklama,
                eylem: t("lookAround"),
              }}
              ust={neden === "yok" ? t("kuponSoon") : null}
            />
          )}
        />
      )}

      {/* 2 ─ TEK MAÇ: günün maçı kartın İÇİNDE, 1-X-2 buradan gönderiliyor. */}
      {tekVar && (
        <View style={[s.genisKart, { borderColor: MOD_RENGI.tek + alfa(KENARLIK_ALFA) }]}>
          <GradyanZemin
            renkler={[MOD_RENGI.tek + alfa(ZEMIN_UST_ALFA), MOD_RENGI.tek + alfa(ZEMIN_ALT_ALFA)]}
            yon="dikey"
          />
          <View style={s.tekBas}>
            <TekMacSanati boyut={76} />
            <View style={{ flex: 1 }}>
              <Text style={s.genisAd}>{tanim.tek.ad}</Text>
              <Text style={s.aciklama} numberOfLines={2}>{tanim.tek.aciklama}</Text>
            </View>
            <Basinc onPress={tahmineGit} scaleTo={0.94}>
              <View style={[s.bagCip, { backgroundColor: MOD_RENGI.tek + alfa(ROZET_ALFA) }]}>
                <Text style={[s.bagCipYazi, { color: acikTon(MOD_RENGI.tek, ROZET_YAZI_ACMA) }]}>{t("allMatchesLink")} ›</Text>
              </View>
            </Basinc>
          </View>
          <DailyMatchCard
            gomulu
            country={country || undefined}
            userId={userId}
            bosken={
              <Basinc onPress={tahmineGit} scaleTo={0.96}>
                <View style={[s.dolguEylem, { backgroundColor: MOD_RENGI.tek }]}>
                  <Text style={s.dolguEylemYazi}>{t("pickAMatch")} →</Text>
                </View>
              </Basinc>
            }
          />
        </View>
      )}

      {/* 3 ─ Diğer modlar: iki sütun, tek kalan kart tüm satırı kaplar. */}
      <View style={s.izgara}>
        {izgara.map((m) => <IzgaraKarti key={m.key} m={m} />)}
      </View>
    </View>
  );
}

/** Kompakt satır düğmesi: küçük çizim + ad. */
function KompaktDugme({ m }: { m: Mod }) {
  const renk = MOD_RENGI[m.key];
  const { Sanat } = m;
  return (
    <Basinc onPress={m.bas} scaleTo={0.95}>
      <View
        accessibilityRole="button"
        accessibilityLabel={`${m.ad}: ${m.aciklama}`}
        style={[s.kompakt, { borderColor: renk + alfa(KENARLIK_ALFA) }]}
      >
        <GradyanZemin renkler={[renk + alfa(ZEMIN_UST_ALFA), renk + alfa(ZEMIN_ALT_ALFA)]} yon="yatay" />
        <Sanat boyut={34} />
        <Text style={s.kompaktAd} numberOfLines={1}>{m.ad}</Text>
      </View>
    </Basinc>
  );
}

/** Izgara kartı: çizim sağ üstte, altında ad + açıklama + eylem. */
function IzgaraKarti({ m }: { m: Mod }) {
  const renk = MOD_RENGI[m.key];
  const { Sanat } = m;
  return (
    <Basinc onPress={m.bas} scaleTo={0.95} style={s.izgaraHucre}>
      <View
        accessibilityRole="button"
        accessibilityLabel={`${m.ad}: ${m.aciklama}`}
        style={[s.izgaraKart, { borderColor: renk + alfa(KENARLIK_ALFA) }]}
      >
        <GradyanZemin renkler={[renk + alfa(ZEMIN_UST_ALFA), renk + alfa(ZEMIN_ALT_ALFA)]} yon="dikey" />
        <View style={s.izgaraSanat} pointerEvents="none">
          <Sanat boyut={88} />
        </View>
        <Text style={s.izgaraAd} numberOfLines={1}>{m.ad}</Text>
        <Text style={s.izgaraAciklama} numberOfLines={3}>{m.aciklama}</Text>
        {/* ⚠️ YÜKSEKLİK SABİT — bedel VERİYE bağlı, düzen olmamalı. Bedeller
            sunucudan sonra doluyor; koşullu render ilk boyamada kartları
            tırtıklı bırakıyordu (2026-08-31 "oturmamış" bildirimi).
            ⚠️ Rozet çizimin ALTINDA: sağ üstteki çizimin halesi yarı saydam;
            rozet oraya binseydi yazının zemini ölçülenden farklı olurdu. */}
        <View style={s.rozetKabi}>
          {m.bedel ? (
            <View style={[s.rozet, { backgroundColor: renk + alfa(ROZET_ALFA) }]}>
              <Text style={[s.rozetYazi, { color: acikTon(renk, ROZET_YAZI_ACMA) }]} numberOfLines={1}>{m.bedel}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[s.eylemYazi, { color: renk }]}>{m.eylem} →</Text>
      </View>
    </Basinc>
  );
}

/** Canlı içeriği olmayan geniş kart (kupon henüz yokken). */
function GenisModKarti({ m, ust }: { m: Mod; ust: string | null }) {
  const renk = MOD_RENGI[m.key];
  const { Sanat } = m;
  return (
    <Basinc onPress={m.bas} scaleTo={0.97}>
      <View
        accessibilityRole="button"
        accessibilityLabel={`${m.ad}: ${ust || m.aciklama}`}
        style={[s.genisKart, s.genisDolgu, { borderColor: renk + alfa(KENARLIK_ALFA) }]}
      >
        <GradyanZemin renkler={[renk + alfa(ZEMIN_UST_ALFA), renk + alfa(ZEMIN_ALT_ALFA)]} yon="capraz" />
        <View style={s.genisSanat} pointerEvents="none">
          <Sanat boyut={118} />
        </View>
        <View style={{ paddingRight: 104 }}>
          <Text style={s.genisAd}>{m.ad}</Text>
          {ust ? <Text style={[s.genisUst, { color: renk }]}>{ust}</Text> : null}
          <Text style={s.aciklama}>{m.aciklama}</Text>
        </View>
        <View style={[s.cizgiEylem, { borderColor: renk + alfa(KENARLIK_ALFA) }]}>
          <Text style={[s.eylemYazi, { color: renk, marginTop: 0 }]}>{m.eylem} →</Text>
        </View>
      </View>
    </Basinc>
  );
}

const s = StyleSheet.create({
  kok: { marginBottom: 16 },
  kompaktKok: { marginBottom: 12, flexGrow: 0 },
  kompakt: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingLeft: 6, paddingRight: 12, paddingVertical: 4,
    borderRadius: 999, borderWidth: 1, backgroundColor: Colors.card, overflow: "hidden",
  },
  kompaktAd: { color: Colors.text, fontSize: 13, fontWeight: "800" },
  ustBaslik: { color: MOD_RENGI.kupon, fontSize: 11, fontWeight: "900", letterSpacing: 1.6 },
  baslik: { color: Colors.text, fontSize: 22, fontWeight: "900", marginTop: 2 },
  altBaslik: { color: ACIKLAMA_RENGI, fontSize: 12.5, marginTop: 2, marginBottom: 12 },

  genisKart: {
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: Colors.card,
    overflow: "hidden",
    marginBottom: 12,
  },
  genisDolgu: { padding: 16 },
  genisSanat: { position: "absolute", right: -4, top: -6 },
  genisAd: { color: Colors.text, fontSize: 20, fontWeight: "900" },
  genisUst: { fontSize: 13, fontWeight: "800", marginTop: 4 },
  aciklama: { color: ACIKLAMA_RENGI, fontSize: 12.5, lineHeight: 17, marginTop: 4 },

  tekBas: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingTop: 12 },
  bagCip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  bagCipYazi: { fontSize: 12, fontWeight: "900" },

  dolguEylem: {
    marginHorizontal: 16, marginBottom: 16, marginTop: 6,
    borderRadius: 999, paddingVertical: 13, alignItems: "center",
  },
  dolguEylemYazi: { color: Colors.onAccent, fontSize: 14, fontWeight: "900" },
  cizgiEylem: {
    marginTop: 14, alignSelf: "flex-start", borderWidth: 1, borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 8,
  },

  izgara: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  izgaraHucre: { flexGrow: 1, flexBasis: "46%" },
  izgaraKart: {
    minHeight: 196,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: Colors.card,
    overflow: "hidden",
  },
  izgaraSanat: { position: "absolute", right: -2, top: 0 },
  rozetKabi: { height: 22, marginTop: 6, justifyContent: "center", alignItems: "flex-start" },
  rozet: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, maxWidth: "100%" },
  rozetYazi: { fontSize: 10.5, fontWeight: "900" },
  izgaraAd: { color: Colors.text, fontSize: 17, fontWeight: "900", marginTop: 62 },
  izgaraAciklama: { color: ACIKLAMA_RENGI, fontSize: 12, lineHeight: 16, marginTop: 4, minHeight: 48 },
  eylemYazi: { fontSize: 13, fontWeight: "900", marginTop: 6 },
});
