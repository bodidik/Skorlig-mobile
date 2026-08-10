/**
 * HAFTALIK KUPON ekranı.
 *
 * Oyun: haftanın maçları TEK kupon. Bedeli öde, hepsine tahmin gir, hafta
 * bitince başarına göre puan + LC kazan. Ödül havuzdan değil, başarıdan.
 *
 *   Ülke kuponu  → kendi ligin, hafta sonu
 *   Avrupa kuponu → kupa maçları, tüm ülkeler aynı tabloda
 *
 * ⚠️ KATILIM İLK MAÇTAN 1 SAAT ÖNCE KAPANIR. Tam kickoff'ta değil: fikstür
 * saatleri dış kaynaklardan geliyor ve gecikmeli olabiliyor, tampon olmadan
 * maç başlamışken katılmak mümkün olurdu (bkz. lib/kupon.cjs KILIT_ONCE_DK).
 * Kalan süre SUNUCUDAN geliyor (`kalanSaniye`); cihaz saatine güvenilmiyor —
 * kullanıcının saati yanlışsa ekran yalan söyler.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, Alert,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import Colors from "../constants/colors";
import { apiJson } from "../lib/apiFetch";
import hataMesaji from "../lib/hataMesaji";
import { t, useLang } from "../lib/i18n";
import { ulkeAdi } from "../lib/ulkeler";

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
  haftaKey: string;
  maclar: Mac[];
  fixtureIds: string[];
  girisBedeli: number;
  kilitISO: string;
  ilkKickoffISO?: string;
  durum: "open" | "locked" | "settled";
  katildiMi: boolean;
  tahminlerim: Record<string, "H" | "D" | "A"> | null;
  kalanSaniye: number;
};

/* Renkler uygulamanın geri kalanıyla BİREBİR: DailyMatchCard ve predict'te
 * 1=mavi (ev), X=kehribar (beraberlik), 2=turuncu (deplasman). Kuponda üçü de
 * tek `Colors.accent` idi — seçim yapılınca hangi sonucu işaretlediğin
 * kutunun renginden anlaşılmıyordu, "renkler kaymış" hissinin kaynağı buydu. */
const SECIM: Array<{ k: "H" | "D" | "A"; etiket: string; renk: string }> = [
  { k: "H", etiket: "1", renk: "#3b82f6" },
  { k: "D", etiket: "X", renk: "#f59e0b" },
  { k: "A", etiket: "2", renk: "#ef4444" },
];

function sureMetni(saniye: number): string {
  if (saniye <= 0) return t("closedLower");
  const g = Math.floor(saniye / 86400);
  const s = Math.floor((saniye % 86400) / 3600);
  const d = Math.floor((saniye % 3600) / 60);
  if (g > 0) return t("daysHours", { g, s });
  if (s > 0) return t("hoursMin", { s, d });
  return t("nMin", { n: d });
}

export default function KuponEkrani() {
  useLang(); // dil değişince ekran yeniden çizilsin
  const router = useRouter();
  const [yukleniyor, setYukleniyor] = useState(true);
  const [yenileniyor, setYenileniyor] = useState(false);
  const [kuponlar, setKuponlar] = useState<KuponT[]>([]);
  const [hata, setHata] = useState<string | null>(null);
  // Yerel seçimler: sunucuya yazılmadan önce kullanıcı serbestçe değiştirsin.
  const [secimler, setSecimler] = useState<Record<string, Record<string, "H" | "D" | "A">>>({});
  const [islemde, setIslemde] = useState<string | null>(null);

  const yukle = useCallback(async () => {
    setHata(null);
    const j = await apiJson("/api/kupon/aktif");
    if (!j?.ok) {
      setHata(hataMesaji(j?.error));
      setKuponlar([]);
    } else {
      const liste: KuponT[] = j.kuponlar || [];
      setKuponlar(liste);
      // Sunucudaki tahminleri yerel duruma al (kullanıcı kaldığı yerden devam etsin)
      const bas: Record<string, Record<string, "H" | "D" | "A">> = {};
      for (const k of liste) bas[k.id] = { ...(k.tahminlerim || {}) };
      setSecimler(bas);
    }
    setYukleniyor(false);
    setYenileniyor(false);
  }, []);

  useEffect(() => { yukle(); }, [yukle]);

  async function katil(k: KuponT) {
    setIslemde(k.id);
    const j = await apiJson("/api/kupon/katil", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kuponId: k.id }),
    } as any);
    setIslemde(null);
    if (!j?.ok) {
      Alert.alert(t("joinFailedTitle"), hataMesaji(j?.error));
      return;
    }
    Alert.alert(t("kuponBought"), t("kuponPaid", { n: j.odenen }));
    yukle();
  }

  async function kaydet(k: KuponT) {
    const secim = secimler[k.id] || {};
    const eksik = k.fixtureIds.filter((f) => !secim[f]).length;
    setIslemde(k.id);
    const j = await apiJson("/api/kupon/tahmin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kuponId: k.id, tahminler: secim }),
    } as any);
    setIslemde(null);
    if (!j?.ok) {
      Alert.alert(t("saveFailedTitle"), hataMesaji(j?.error));
      return;
    }
    Alert.alert(
      t("savedTitle"),
      eksik > 0 ? t("kuponMissing", { n: eksik }) : t("kuponAllFilled")
    );
    yukle();
  }

  const sec = (kuponId: string, fid: string, deger: "H" | "D" | "A") =>
    setSecimler((o) => ({ ...o, [kuponId]: { ...(o[kuponId] || {}), [fid]: deger } }));

  if (yukleniyor) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl refreshing={yenileniyor} onRefresh={() => { setYenileniyor(true); yukle(); }} tintColor={Colors.accent} />
      }
    >
      <Text style={{ color: Colors.text, fontSize: 22, fontWeight: "800" }}>{t("weeklyKupon")}</Text>
      <Text style={{ color: Colors.muted, fontSize: 12, marginTop: 4, lineHeight: 18 }}>
        {t("kuponIntroA")}
        <Text style={{ color: Colors.accent }}>{t("kuponIntroB")}</Text>{t("kuponIntroC")}
      </Text>

      {hata ? (
        <View style={{ marginTop: 20, padding: 14, borderRadius: 12, backgroundColor: Colors.dark }}>
          <Text style={{ color: Colors.text, fontSize: 13 }}>{hata}</Text>
          <TouchableOpacity onPress={yukle} style={{ marginTop: 10 }}>
            <Text style={{ color: Colors.accent, fontWeight: "700" }}>Tekrar dene</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!hata && kuponlar.length === 0 ? (
        /* ⚠️ Boş durum sebebini söylüyor. "Kupon yok" demek kullanıcıya bir şey
           anlatmaz; ülkesi seçili değilse ülke kuponu hiç gelmez. */
        <View style={{ marginTop: 24, padding: 16, borderRadius: 12, backgroundColor: Colors.dark }}>
          <Text style={{ color: Colors.text, fontSize: 14, fontWeight: "700" }}>{t("noOpenKupon")}</Text>
          <Text style={{ color: Colors.muted, fontSize: 12, marginTop: 6, lineHeight: 18 }}>
            {t("noOpenKuponHelp")}
          </Text>
          <TouchableOpacity onPress={() => router.push("/(tabs)/me")} style={{ marginTop: 12 }}>
            <Text style={{ color: Colors.accent, fontWeight: "700" }}>Profilime git →</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {kuponlar.map((k) => {
        const secim = secimler[k.id] || {};
        const dolu = k.fixtureIds.filter((f) => secim[f]).length;
        const acik = k.durum === "open";
        const baslik = k.tur === "avrupa" ? t("kuponEurope") : t("kuponCountryLeague", { c: ulkeAdi(k.ulke) });

        return (
          <View key={k.id} style={{ marginTop: 20, borderRadius: 14, backgroundColor: Colors.dark, overflow: "hidden" }}>
            <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: "#1f2937" }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: Colors.text, fontSize: 16, fontWeight: "800" }}>{baslik}</Text>
                <Text style={{ color: acik ? Colors.accent : Colors.muted, fontSize: 11, fontWeight: "700" }}>
                  {acik ? sureMetni(k.kalanSaniye) : t("closedLower")}
                </Text>
              </View>
              <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 4 }}>
                {t("kuponHeaderRow", { n: k.maclar.length, g: k.girisBedeli })}
                {k.tur === "avrupa" ? t("allCountriesSame") : ""}
              </Text>
              {/* Kullanıcı "ilk maça kadar var" sanmasın: kilit 1 saat önce. */}
              <Text style={{ color: Colors.muted, fontSize: 10, marginTop: 2 }}>
                {acik ? t("joinCloses1h") : t("joinClosedLong")}
              </Text>
            </View>

            {!k.katildiMi ? (
              <View style={{ padding: 14 }}>
                <Text style={{ color: Colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 12 }}>
                  {t("kuponBuyHelp", { n: k.maclar.length })}
                </Text>
                <TouchableOpacity
                  disabled={!acik || islemde === k.id}
                  onPress={() => katil(k)}
                  style={{
                    backgroundColor: acik ? Colors.accent : "#374151",
                    paddingVertical: 13, borderRadius: 10, alignItems: "center",
                  }}
                >
                  <Text style={{ color: acik ? Colors.onAccent : Colors.muted, fontWeight: "800" }}>
                    {islemde === k.id ? "..." : acik ? t("buyKuponBtn", { g: k.girisBedeli }) : t("joinClosedShort")}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ padding: 14 }}>
                <Text style={{ color: Colors.muted, fontSize: 11, marginBottom: 10 }}>
                  {t("filledCount", { d: dolu, n: k.maclar.length })}
                  {dolu < k.maclar.length ? t("emptyCountsWrong") : ""}
                </Text>

                {k.maclar.map((m) => {
                  const bosMu = !secim[m.fixtureId];
                  return (
                  <View
                    key={m.fixtureId}
                    style={{
                      marginBottom: 10, padding: 10, borderRadius: 10,
                      backgroundColor: "#0f172a",
                      borderWidth: 1,
                      borderColor: bosMu && acik ? "#f59e0b44" : "#1f2937",
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                      <Text style={{ color: Colors.text, fontSize: 13, fontWeight: "600", flex: 1, textAlign: "right" }} numberOfLines={1}>
                        {m.home}
                      </Text>
                      <Text style={{ color: Colors.muted, fontSize: 12, marginHorizontal: 8 }}>vs</Text>
                      <Text style={{ color: Colors.text, fontSize: 13, fontWeight: "600", flex: 1 }} numberOfLines={1}>
                        {m.away}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {SECIM.map((s) => {
                        const secili = secim[m.fixtureId] === s.k;
                        return (
                          <TouchableOpacity
                            key={s.k}
                            disabled={!acik}
                            onPress={() => sec(k.id, m.fixtureId, s.k)}
                            style={{
                              flex: 1, paddingVertical: 11, borderRadius: 8, alignItems: "center",
                              backgroundColor: secili ? s.renk : "#111827",
                              borderWidth: 1.5, borderColor: secili ? s.renk : "#1f2937",
                              opacity: acik ? 1 : 0.6,
                              ...(secili ? { shadowColor: s.renk, shadowOpacity: 0.5, shadowRadius: 6, elevation: 4 } : {}),
                            }}
                          >
                            <Text style={{ color: secili ? "#ffffff" : s.renk, fontWeight: "800", fontSize: 15 }}>
                              {s.etiket}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                  );
                })}

                {acik ? (
                  <TouchableOpacity
                    disabled={islemde === k.id}
                    onPress={() => kaydet(k)}
                    style={{ backgroundColor: Colors.accent, paddingVertical: 13, borderRadius: 10, alignItems: "center", marginTop: 4 }}
                  >
                    <Text style={{ color: Colors.onAccent, fontWeight: "800" }}>
                      {islemde === k.id ? "..." : t("savePreds")}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={{ color: Colors.muted, fontSize: 12, textAlign: "center", marginTop: 6 }}>
                    {t("kuponClosedResult")}
                  </Text>
                )}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}
