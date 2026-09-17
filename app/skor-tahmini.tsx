/**
 * SKOR TAHMİNİ EKRANI — kurallar, haftanın maçları + maç sıralaması, haftalık tablo.
 *
 * ⚠️ KULLANICI KARARLARI (2026-09-17): herkes oynar, 1987 üyelerine ayrı tablo;
 * sıralama "maç + haftalık Skor tablosu". Kurallar ve puan SUNUCUDA
 * (api/lib/skor-tahmini.cjs) — buradaki örnek tablo da sunucudan geliyor,
 * formül burada yeniden yazılmıyor.
 *
 * ⚠️ BAŞKALARININ TAHMİNİ SONUÇTAN ÖNCE GÖRÜNMEZ — uç yalnız katılımcı sayısını
 * döner; ekran bunu söylüyor, boş liste gibi durmuyor.
 */

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import Colors from "../constants/colors";
import { apiJson } from "../lib/apiFetch";
import { t, useLang } from "../lib/i18n";
import { gorunenAd } from "../lib/gorunenAd";
import { macSaatiEtiketi } from "../lib/macSaati";
import { useOzellikler } from "../hooks/useOzellikler";
import { useAuth } from "../contexts/AuthContext";
import OzellikKapali from "../components/OzellikKapali";
import Basinc from "../components/Basinc";
import { KartBasi, parca } from "../components/OyunKartParcalari";
import { SkorSanati } from "../components/OyunSanati";
import {
  DUGME_YAZISI, IC_YUZEY, METIN_ANA, METIN_IKINCIL, METIN_SOLUK, MOD_RENGI,
} from "../lib/oyunMerkezi";
import { puanIsaretli, type SkorMaci } from "../lib/skorTahmini";

const RENK = MOD_RENGI.skor;

type Kural = {
  tamSkor: number; taban: number; mesafeCezasi: number; sonucBonusu: number; enDusuk: number;
  oduller: { enAzPuan: number; bedelKati: number }[];
  ornek: { gercek: { home: number; away: number }; satirlar: { home: number; away: number; puan: number }[] };
};
type TabloSatiri = { sira: number; userId: string; userIdLower: string; displayName?: string | null; puan: number; tamSkor: number; mac: number };
type SiraSatiri = { sira: number; userId: string; displayName?: string | null; home: number; away: number; puan: number };

export default function SkorTahminiEkrani() {
  const ozellik = useOzellikler();
  if (!ozellik.skor) return <OzellikKapali />;
  return <Icerik />;
}

function Icerik() {
  useLang();
  const router = useRouter();
  const { user, loading: oturumYukleniyor } = useAuth();
  const [kural, setKural] = useState<Kural | null>(null);
  const [bedel, setBedel] = useState(0);
  const [maclar, setMaclar] = useState<SkorMaci[]>([]);
  const [segment, setSegment] = useState<"genel" | "1987">("genel");
  const [tablo, setTablo] = useState<TabloSatiri[] | null>(null);
  const [acikMac, setAcikMac] = useState<string | null>(null);
  const [siralama, setSiralama] = useState<{ sonuclandi: boolean; katilimci: number; satirlar: SiraSatiri[] } | null>(null);
  const [yenileniyor, setYenileniyor] = useState(false);
  /* ⚠️ AĞ HATASI "BOŞ" DEĞİLDİR: hata ayrı tutulmazsa ekran "bu hafta maç yok"
   * / "sonuçlanan maç yok" yazıyordu (emülatörde ölçüldü, 2026-09-17). */
  const [maclarHata, setMaclarHata] = useState(false);
  const [tabloHata, setTabloHata] = useState(false);
  const [siralamaHata, setSiralamaHata] = useState(false);

  const yukle = useCallback(async () => {
    const j = await apiJson("/api/skor/maclar");
    setMaclarHata(!j?.ok);
    if (j?.ok) {
      setKural(j.kural as Kural);
      setBedel(Number(j.bedel) || 0);
      setMaclar(Array.isArray(j.maclar) ? j.maclar : []);
    }
  }, []);

  const tabloYukle = useCallback(async (seg: "genel" | "1987") => {
    setTablo(null);
    /* Sabit yollar: şablon içinde koşullu yolu istemci↔sunucu uç eşleşme
     * nöbetçisi (api tests/istemci-uc-eslesme) çözemiyor. */
    const j = await apiJson(seg === "1987" ? "/api/skor/haftalik?segment=1987" : "/api/skor/haftalik");
    setTabloHata(!j?.ok);
    setTablo(j?.ok && Array.isArray(j.satirlar) ? j.satirlar : []);
  }, []);

  useEffect(() => {
    if (oturumYukleniyor) return;
    yukle();
  }, [oturumYukleniyor, user?.uid, yukle]);
  useEffect(() => { tabloYukle(segment); }, [segment, tabloYukle]);

  async function siralamaAc(fid: string) {
    if (acikMac === fid) { setAcikMac(null); return; }
    setAcikMac(fid);
    setSiralama(null);
    setSiralamaHata(false);
    const j = await apiJson(`/api/skor/siralama/${encodeURIComponent(fid)}`);
    setSiralamaHata(!j?.ok);
    setSiralama(j?.ok ? { sonuclandi: !!j.sonuclandi, katilimci: Number(j.katilimci) || 0, satirlar: j.satirlar || [] } : null);
  }

  const benUid = String(user?.uid || "").toLowerCase();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={yenileniyor} onRefresh={async () => {
        setYenileniyor(true); await Promise.all([yukle(), tabloYukle(segment)]); setYenileniyor(false);
      }} />}
    >
      <Text style={s.baslik}>{t("skorTitle")}</Text>

      {/* Kurallar */}
      {kural && (
        <View style={parca.kart}>
          <KartBasi modu="skor" Sanat={SkorSanati} ad={t("skorRulesTitle")} alt={bedel > 0 ? t("skorSub", { n: bedel }) : null} />
          <View style={s.kurallar}>
            <Text style={s.kural}>• {t("skorRuleExact", { n: kural.tamSkor })}</Text>
            <Text style={s.kural}>• {t("skorRuleBase", { t: kural.taban, m: kural.mesafeCezasi })}</Text>
            <Text style={s.kural}>• {t("skorRuleResult", { n: kural.sonucBonusu })}</Text>
            <Text style={s.kural}>• {t("skorRuleMin", { n: puanIsaretli(kural.enDusuk) })}</Text>
          </View>

          <Text style={s.altBaslik}>{t("skorExampleTitle", { g: `${kural.ornek.gercek.home}-${kural.ornek.gercek.away}` })}</Text>
          <View style={s.ornekKutu}>
            {kural.ornek.satirlar.map((r) => (
              <View key={`${r.home}-${r.away}`} style={s.ornekSatir}>
                <Text style={s.ornekSkor}>{r.home}-{r.away}</Text>
                <Text style={[s.ornekPuan, { color: r.puan >= 7 ? RENK : r.puan < 0 ? METIN_SOLUK : METIN_ANA }]}>
                  {puanIsaretli(r.puan)}
                </Text>
              </View>
            ))}
          </View>

          {bedel > 0 && (
            <>
              <Text style={s.altBaslik}>{t("skorRewardsTitle")}</Text>
              {kural.oduller.map((o) => (
                <Text key={o.enAzPuan} style={s.kural}>
                  • {t("skorRewardRow", { p: o.enAzPuan, n: Math.round(bedel * o.bedelKati * 100) / 100 })}
                </Text>
              ))}
            </>
          )}
        </View>
      )}

      {/* Maçlar */}
      <Text style={s.bolum}>{t("skorMatchesTitle")}</Text>
      <View style={[parca.kart, { paddingVertical: 6 }]}>
        {maclar.length === 0 ? (
          <Text style={[parca.aciklama, { marginTop: 8, marginBottom: 8 }]}>{maclarHata ? t("netErr") : t("skorNoMatch")}</Text>
        ) : maclar.map((m, i) => (
          <View key={m.fixtureId} style={[s.macSatir, i > 0 && s.ayrac]}>
            <Basinc onPress={() => siralamaAc(m.fixtureId)} scaleTo={0.98}>
              <View style={s.macUst}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.macAd} numberOfLines={1}>{m.home} – {m.away}</Text>
                  <Text style={s.macAlt} numberOfLines={1}>
                    {macSaatiEtiketi(m.kickoffISO, { bugun: t("today"), yarin: t("tomorrow") })}
                    {m.benim ? ` · ${m.benim.home}-${m.benim.away}` : ""}
                    {typeof m.benim?.sonuc?.puan === "number" ? ` · ${puanIsaretli(m.benim.sonuc.puan)} p` : ""}
                  </Text>
                </View>
                <Text style={[parca.baglanti, { color: RENK }]}>{t("skorSeeRank")} {acikMac === m.fixtureId ? "▾" : "›"}</Text>
              </View>
            </Basinc>
            {acikMac === m.fixtureId && siralamaHata && (
              <Text style={[s.macAlt, { marginTop: 8 }]}>{t("netErr")}</Text>
            )}
            {acikMac === m.fixtureId && siralama && (
              siralama.sonuclandi ? (
                <View style={s.siraKutu}>
                  {siralama.satirlar.slice(0, 10).map((r) => (
                    <View key={`${r.sira}-${r.userId}`} style={s.siraSatir}>
                      <Text style={s.siraNo}>{r.sira}</Text>
                      <Text style={s.siraAd} numberOfLines={1}>{gorunenAd(r)}</Text>
                      <Text style={s.siraSkor}>{r.home}-{r.away}</Text>
                      <Text style={s.siraPuan}>{r.puan}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={[s.macAlt, { marginTop: 8 }]}>{t("skorRankHidden", { n: siralama.katilimci })}</Text>
              )
            )}
          </View>
        ))}
      </View>

      {/* Haftalık tablo */}
      <Text style={s.bolum}>{t("skorWeeklyTitle")}</Text>
      <View style={parca.kart}>
        <View style={s.sekmeler}>
          {(["genel", "1987"] as const).map((sg) => (
            <Basinc key={sg} onPress={() => setSegment(sg)} scaleTo={0.95}>
              <View style={[s.sekme, segment === sg && { backgroundColor: RENK }]}>
                <Text style={[s.sekmeYazi, segment === sg && { color: DUGME_YAZISI }]}>{sg === "genel" ? t("skorTabAll") : "1987GS"}</Text>
              </View>
            </Basinc>
          ))}
        </View>
        {tablo === null ? null : tablo.length === 0 ? (
          <Text style={parca.aciklama}>{tabloHata ? t("netErr") : t("skorEmptyTable")}</Text>
        ) : tablo.map((r) => (
          <Basinc key={r.userIdLower} scaleTo={0.98}
            onPress={() => router.push({ pathname: "/profile/[userId]", params: { userId: r.userId } } as any)}>
            <View style={[s.siraSatir, r.userIdLower === benUid && s.benSatir]}>
              <Text style={s.siraNo}>{r.sira}</Text>
              <Text style={s.siraAd} numberOfLines={1}>{gorunenAd(r)}</Text>
              <Text style={s.siraSkor}>{t("skorExactCount", { n: r.tamSkor })}</Text>
              <Text style={s.siraPuan}>{r.puan}</Text>
            </View>
          </Basinc>
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  baslik: { color: METIN_ANA, fontSize: 22, fontWeight: "800", marginBottom: 12 },
  bolum: { color: METIN_SOLUK, fontSize: 13, fontWeight: "800", marginBottom: 8, marginTop: 2 },
  kurallar: { marginTop: 12, gap: 4 },
  kural: { color: METIN_IKINCIL, fontSize: 14, lineHeight: 20 },
  altBaslik: { color: METIN_ANA, fontSize: 14, fontWeight: "800", marginTop: 14, marginBottom: 6 },
  ornekKutu: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  ornekSatir: { backgroundColor: IC_YUZEY, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, alignItems: "center", minWidth: 58 },
  ornekSkor: { color: METIN_ANA, fontSize: 14, fontWeight: "800" },
  ornekPuan: { fontSize: 13, fontWeight: "900", marginTop: 2 },
  macSatir: { paddingVertical: 10 },
  ayrac: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: IC_YUZEY },
  macUst: { flexDirection: "row", alignItems: "center", gap: 10 },
  macAd: { color: METIN_ANA, fontSize: 15, fontWeight: "800" },
  macAlt: { color: METIN_IKINCIL, fontSize: 13, marginTop: 2 },
  siraKutu: { marginTop: 8, gap: 2 },
  siraSatir: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7, paddingHorizontal: 8, borderRadius: 10 },
  benSatir: { backgroundColor: IC_YUZEY },
  siraNo: { color: METIN_SOLUK, fontSize: 13, fontWeight: "900", width: 22, textAlign: "center" },
  siraAd: { flex: 1, minWidth: 0, color: METIN_ANA, fontSize: 14, fontWeight: "700" },
  siraSkor: { color: METIN_IKINCIL, fontSize: 13, fontWeight: "700" },
  siraPuan: { color: RENK, fontSize: 15, fontWeight: "900", minWidth: 32, textAlign: "right" },
  sekmeler: { flexDirection: "row", gap: 8, marginBottom: 10 },
  sekme: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: IC_YUZEY },
  sekmeYazi: { color: METIN_IKINCIL, fontSize: 13, fontWeight: "800" },
});
