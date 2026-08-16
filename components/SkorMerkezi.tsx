import React, { useCallback, useMemo, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { apiFetch } from "../lib/apiFetch";
import { t, useLang } from "../lib/i18n";
import { ulkeAnahtari, ulkeBayragi } from "../lib/ulkeler";
import { usePolling } from "../hooks/usePolling";

/**
 * SKOR MERKEZİ — ana listenin tepesinde canlı + bitmiş maç şeridi.
 *
 * NEDEN VAR (2026-08-16, kullanıcı bildirimi): "bitmiş maçları görmek zor;
 * canlı maçlar yazan yerde tamamlananlar da görülmeli". Gerçek sonuç ekranı
 * (/livescores) yalnızca listenin DİBİNDEKİ küçük bir düğmeden erişiliyordu;
 * varsayılan "açık maçlar" sekmesi ise bitmiş/canlı hiçbir maç göstermiyor
 * (kilit süzgeci tasarım gereği hepsini atıyor — tahmin listesi bu).
 *
 * Bu şerit iki işi görür: canlı maç varsa nabzı gösterir, yoksa son
 * bitenlerin skorunu gösterir; dokununca tam sonuç ekranına götürür.
 * Kullanıcının ülkesi önceliklidir (kanonik anahtar karşılaştırması —
 * ham `===` Türkiye dışındaki her ülkede sessizce boş kalırdı).
 */

type Mac = {
  homeTeam: string; awayTeam: string;
  homeScore: string | null; awayScore: string | null;
  isLive: boolean; isHT: boolean; isFinished: boolean;
};
type Lig = { country: string; matches: Mac[] };

export default function SkorMerkezi({ country }: { country?: string | null }) {
  useLang();
  const router = useRouter();
  const [ligler, setLigler] = useState<Lig[]>([]);

  const yukle = useCallback(async () => {
    try {
      const r = await apiFetch("/api/livescore/matches");
      const j = await r.json().catch(() => null);
      if (j?.ok && j.leagues) setLigler(Object.values(j.leagues) as Lig[]);
    } catch {}
  }, []);

  // Canlı skor 60 sn'de bir yeter: şerit özet, ayrıntı /livescores'ta.
  usePolling(yukle, 60_000);

  const { canliSayisi, bitenler } = useMemo(() => {
    const hedefK = country ? ulkeAnahtari(country) : null;
    let canli = 0;
    const biten: { m: Mac; ulke: string; oncelik: number }[] = [];
    for (const l of ligler) {
      for (const m of l.matches || []) {
        if (m.isLive || m.isHT) canli++;
        else if (m.isFinished && m.homeScore != null && m.awayScore != null) {
          const oncelik = hedefK && ulkeAnahtari(l.country) === hedefK ? 0 : 1;
          biten.push({ m, ulke: l.country, oncelik });
        }
      }
    }
    biten.sort((a, b) => a.oncelik - b.oncelik);
    return { canliSayisi: canli, bitenler: biten.slice(0, 3) };
  }, [ligler, country]);

  // Ne canlı ne biten varsa şerit kendini gizler — boş kutu durmaz.
  if (!canliSayisi && !bitenler.length) return null;

  return (
    <TouchableOpacity
      onPress={() => router.push("/livescores")}
      activeOpacity={0.85}
      style={{
        backgroundColor: "#0f172a", borderRadius: 14, borderWidth: 1,
        borderColor: canliSayisi ? "#22c55e44" : "#1e293b",
        padding: 12, marginBottom: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: bitenler.length ? 8 : 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {canliSayisi > 0 ? (
            <>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#22c55e" }} />
              <Text style={{ color: "#4ade80", fontWeight: "800", fontSize: 12 }}>
                {t("nLive", { n: canliSayisi })}
              </Text>
            </>
          ) : (
            <Text style={{ color: "#94a3b8", fontWeight: "800", fontSize: 12 }}>🏁 {t("finishedStripTitle")}</Text>
          )}
        </View>
        <Text style={{ color: "#60a5fa", fontSize: 11, fontWeight: "700" }}>{t("allScores")} ›</Text>
      </View>

      {bitenler.map(({ m, ulke }, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 3, gap: 6 }}>
          <Text style={{ fontSize: 11 }}>{ulkeBayragi(ulke)}</Text>
          <Text style={{ flex: 1, color: "#cbd5e1", fontSize: 12 }} numberOfLines={1}>
            {m.homeTeam} – {m.awayTeam}
          </Text>
          <Text style={{ color: "#f1f5f9", fontSize: 12, fontWeight: "900" }}>
            {m.homeScore}–{m.awayScore}
          </Text>
        </View>
      ))}
    </TouchableOpacity>
  );
}
