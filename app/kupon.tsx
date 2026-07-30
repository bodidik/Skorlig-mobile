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

const SECIM: Array<{ k: "H" | "D" | "A"; etiket: string }> = [
  { k: "H", etiket: "1" },
  { k: "D", etiket: "X" },
  { k: "A", etiket: "2" },
];

function sureMetni(saniye: number): string {
  if (saniye <= 0) return "kapandı";
  const g = Math.floor(saniye / 86400);
  const s = Math.floor((saniye % 86400) / 3600);
  const d = Math.floor((saniye % 3600) / 60);
  if (g > 0) return `${g} gün ${s} saat`;
  if (s > 0) return `${s} saat ${d} dk`;
  return `${d} dk`;
}

export default function KuponEkrani() {
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
      Alert.alert("Katılamadın", hataMesaji(j?.error));
      return;
    }
    Alert.alert("Kupon alındı", `${j.odenen} LC ödendi. Şimdi tüm maçlara tahmin gir.`);
    yukle();
  }

  async function kaydet(k: KuponT) {
    const t = secimler[k.id] || {};
    const eksik = k.fixtureIds.filter((f) => !t[f]).length;
    setIslemde(k.id);
    const j = await apiJson("/api/kupon/tahmin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kuponId: k.id, tahminler: t }),
    } as any);
    setIslemde(null);
    if (!j?.ok) {
      Alert.alert("Kaydedilemedi", hataMesaji(j?.error));
      return;
    }
    Alert.alert(
      "Kaydedildi",
      eksik > 0
        ? `${eksik} maç boş kaldı. Boş bırakılan maç yanlış sayılır — kilit kapanmadan tamamla.`
        : "Tüm maçlar dolu. Bol şans!"
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
      <Text style={{ color: Colors.text, fontSize: 22, fontWeight: "800" }}>Haftalık Kupon</Text>
      <Text style={{ color: Colors.muted, fontSize: 12, marginTop: 4, lineHeight: 18 }}>
        Haftanın maçları tek kuponda. Hepsine tahmin gir — ödül havuzdan değil,
        <Text style={{ color: Colors.accent }}> senin başarından</Text>. Doğru oranın düşükse puanının bir kısmı geri alınır.
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
          <Text style={{ color: Colors.text, fontSize: 14, fontWeight: "700" }}>Şu an açık kupon yok</Text>
          <Text style={{ color: Colors.muted, fontSize: 12, marginTop: 6, lineHeight: 18 }}>
            Kuponlar hafta başında kurulur ve ilk maçtan 1 saat önce kapanır. Ülken
            seçili değilse kendi ligindeki kupon görünmez.
          </Text>
          <TouchableOpacity onPress={() => router.push("/(tabs)/me")} style={{ marginTop: 12 }}>
            <Text style={{ color: Colors.accent, fontWeight: "700" }}>Profilime git →</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {kuponlar.map((k) => {
        const t = secimler[k.id] || {};
        const dolu = k.fixtureIds.filter((f) => t[f]).length;
        const acik = k.durum === "open";
        const baslik = k.tur === "avrupa" ? "🏆 Avrupa Kuponu" : `⚽ ${k.ulke} Ligi`;

        return (
          <View key={k.id} style={{ marginTop: 20, borderRadius: 14, backgroundColor: Colors.dark, overflow: "hidden" }}>
            <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: "#1f2937" }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: Colors.text, fontSize: 16, fontWeight: "800" }}>{baslik}</Text>
                <Text style={{ color: acik ? Colors.accent : Colors.muted, fontSize: 11, fontWeight: "700" }}>
                  {acik ? sureMetni(k.kalanSaniye) : "kapandı"}
                </Text>
              </View>
              <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 4 }}>
                {k.maclar.length} maç · Giriş {k.girisBedeli} LC
                {k.tur === "avrupa" ? " · tüm ülkeler aynı tabloda" : ""}
              </Text>
              {/* Kullanıcı "ilk maça kadar var" sanmasın: kilit 1 saat önce. */}
              <Text style={{ color: Colors.muted, fontSize: 10, marginTop: 2 }}>
                {acik
                  ? "Katılım ilk maçtan 1 saat önce kapanır"
                  : "Katılım kapandı — maçlar bitince sonucun görünecek"}
              </Text>
            </View>

            {!k.katildiMi ? (
              <View style={{ padding: 14 }}>
                <Text style={{ color: Colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 12 }}>
                  Kuponu al, {k.maclar.length} maçın hepsine tahmin gir. Tek tek
                  oynamaktan ucuz ve doğru oranın yükseldikçe ödül büyür.
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
                    {islemde === k.id ? "..." : acik ? `Kuponu al — ${k.girisBedeli} LC` : "Katılım kapandı"}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ padding: 14 }}>
                <Text style={{ color: Colors.muted, fontSize: 11, marginBottom: 10 }}>
                  {dolu}/{k.maclar.length} maç dolduruldu
                  {dolu < k.maclar.length ? " — boş bırakılan maç yanlış sayılır" : ""}
                </Text>

                {k.maclar.map((m) => (
                  <View key={m.fixtureId} style={{ marginBottom: 12 }}>
                    <Text style={{ color: Colors.text, fontSize: 13, marginBottom: 6 }}>
                      {m.home} <Text style={{ color: Colors.muted }}>–</Text> {m.away}
                    </Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {SECIM.map((s) => {
                        const secili = t[m.fixtureId] === s.k;
                        return (
                          <TouchableOpacity
                            key={s.k}
                            disabled={!acik}
                            onPress={() => sec(k.id, m.fixtureId, s.k)}
                            style={{
                              flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center",
                              backgroundColor: secili ? Colors.accent : "#111827",
                              borderWidth: 1, borderColor: secili ? Colors.accent : "#1f2937",
                              opacity: acik ? 1 : 0.6,
                            }}
                          >
                            <Text style={{ color: secili ? Colors.onAccent : Colors.text, fontWeight: "700" }}>
                              {s.etiket}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}

                {acik ? (
                  <TouchableOpacity
                    disabled={islemde === k.id}
                    onPress={() => kaydet(k)}
                    style={{ backgroundColor: Colors.accent, paddingVertical: 13, borderRadius: 10, alignItems: "center", marginTop: 4 }}
                  >
                    <Text style={{ color: Colors.onAccent, fontWeight: "800" }}>
                      {islemde === k.id ? "..." : "Tahminleri kaydet"}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={{ color: Colors.muted, fontSize: 12, textAlign: "center", marginTop: 6 }}>
                    Kupon kapandı. Maçlar bitince sonucun burada görünecek.
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
