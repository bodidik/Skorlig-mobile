/**
 * SONUÇ ÖZETİ — profilin en üstü (2026-10-02).
 *
 * Kullanıcı: "Sonuçlar, kazançlar kayıplar daha gözüne girmeli... Hepsini
 * açınca tek yerden görsün." Son 7 günün oyun başına NETİ + son kazançlar.
 * Veri /api/rt/lc-wallet/ozet (hesap sunucuda, lib/lc-ozet.cjs). Dokununca
 * tam LC defteri açılır.
 */
import React, { useCallback, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import Colors from "../constants/colors";
import { apiFetch } from "../lib/apiFetch";
import { lcYaz } from "../lib/lcBicim";
import { t, useLang, type StringKey } from "../lib/i18n";

type OyunSatir = { oyun: string; giris: number; donus: number; net: number; kazanc: number };
type Kazanc = { oyun: string; reason: string; amount: number; createdAt: string };
type Ozet = { gun: number; net: number; bonus: number; kazancAdet: number; oyunlar: OyunSatir[]; sonKazanclar: Kazanc[] };

const OYUN_ADI: Record<string, StringKey> = {
  skor: "ozetOyunSkor", kupon: "ozetOyunKupon", tahmin: "ozetOyunTahmin", duello: "ozetOyunDuello",
  havuz: "ozetOyunHavuz", turnuva: "ozetOyunTurnuva", haftalik: "ozetOyunHaftalik",
};
const oyunAdi = (o: string) => (OYUN_ADI[o] ? t(OYUN_ADI[o]) : o);

const YESIL = "#22c55e";
const KIRMIZI = "#ef4444";
const isaretli = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + lcYaz(Math.abs(n));
const renk = (n: number) => (n > 0 ? YESIL : n < 0 ? KIRMIZI : Colors.mutedOnCard);

export default function SonucOzeti({ userId }: { userId: string | null | undefined }) {
  useLang();
  const nav = useRouter();
  const [ozet, setOzet] = useState<Ozet | null>(null);

  useFocusEffect(useCallback(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      try {
        const r = await apiFetch(`/api/rt/lc-wallet/ozet?userId=${encodeURIComponent(userId)}`);
        const j = await r.json();
        if (alive && j?.ok) setOzet(j);
      } catch { /* kart sessizce gizli kalır; defter ekranı ayrıca var */ }
    })();
    return () => { alive = false; };
  }, [userId]));

  if (!userId || !ozet) return null;
  const bos = !ozet.oyunlar.length;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => nav.push({ pathname: "/lc-ledger", params: { userId } })}
      accessibilityRole="button"
      accessibilityLabel={t("ozetBaslik", { n: ozet.gun })}
      style={{ backgroundColor: Colors.card, borderRadius: 14, borderWidth: 1, borderColor: Colors.cardBorder, padding: 14, gap: 10 }}
    >
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
        <Text style={{ color: Colors.mutedOnCard, fontWeight: "700", fontSize: 13 }}>{t("ozetBaslik", { n: ozet.gun })}</Text>
        <Text style={{ color: Colors.mutedOnCard, fontSize: 12 }}>{t("ozetTumu")} ›</Text>
      </View>

      {bos ? (
        <Text style={{ color: Colors.slate900, fontSize: 14 }}>{t("ozetBos")}</Text>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
            <Text style={{ color: renk(ozet.net), fontSize: 30, fontWeight: "900" }}>{isaretli(ozet.net)} LC</Text>
            <Text style={{ color: Colors.mutedOnCard, fontSize: 13, paddingBottom: 6 }}>
              {ozet.kazancAdet > 0 ? t("ozetKazancAdet", { n: ozet.kazancAdet }) : t("ozetKazancYok")}
            </Text>
          </View>

          <View style={{ gap: 6 }}>
            {ozet.oyunlar.map((s) => (
              <View key={s.oyun} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ flex: 1, color: Colors.slate900, fontSize: 14 }} numberOfLines={1}>
                  {oyunAdi(s.oyun)}
                  {s.kazanc > 0 ? <Text style={{ color: YESIL }}>{"  ✓" + s.kazanc}</Text> : null}
                </Text>
                <Text style={{ color: renk(s.net), fontWeight: "800", fontSize: 14 }}>{isaretli(s.net)}</Text>
              </View>
            ))}
            {ozet.bonus > 0 ? (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Text style={{ flex: 1, color: Colors.mutedOnCard, fontSize: 13 }}>{t("ozetBonus")}</Text>
                <Text style={{ color: Colors.mutedOnCard, fontSize: 13 }}>+{lcYaz(ozet.bonus)}</Text>
              </View>
            ) : null}
          </View>

          {ozet.sonKazanclar.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {ozet.sonKazanclar.map((k, i) => (
                <View key={i} style={{ backgroundColor: "#14532d", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ color: "#bbf7d0", fontSize: 12, fontWeight: "700" }}>
                    {oyunAdi(k.oyun)} +{lcYaz(k.amount)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      )}
    </TouchableOpacity>
  );
}
