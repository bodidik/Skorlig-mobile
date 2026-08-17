import React, { useEffect, useRef } from "react";
import { t, useLang, type StringKey } from "../lib/i18n";
import { View, Text, StyleSheet, Animated, Easing } from "react-native";
import GradyanZemin from "./GradyanZemin";
import { Gradyan } from "../constants/colors";

type Tier = { threshold: number; bonus: number; label: string } | null;
/** Sunucunun yayımladığı eşik listesi (/api/live/streak → tiers). */
export type SunucuTier = { threshold: number; bonus?: number; label?: string; badge?: string | null };

type Props = {
  seriesCumOdds: number;
  seriesCount: number;
  activeSeries: boolean;
  bestSeries: number;
  currentTier: Tier;
  /** Sunucudan gelen eşikler; verilmezse yedek liste kullanılır. */
  tiers?: SunucuTier[] | null;
};

/* StringKey tipi: t() dinamik anahtarla çağrılınca TS 1222 seçenekli union
 * istiyor — harita değerlerini anahtar tipiyle işaretlemek hem hatayı
 * susturur hem yanlış anahtarı derlemede yakalar. */
export const TIER_KEYS: Record<string, StringKey> = {
  "Isınıyor": "streakWarmup",
  "Ateşte": "streakOnFire",
  "Durdurulamıyor": "streakUnstoppable",
};
/**
 * ⚠️ EŞİKLER SUNUCUDAN GELİR — BURADAKİ LİSTE YALNIZCA YEDEK.
 *
 * ÖLÇÜLEN KUSUR (2026-08-17): bu dosya kendi eşik kopyasını tutuyordu ve
 * sunucudan AYRIŞMIŞTI:
 *
 *     sunucu (services/streak.cjs) : 10 · 20 · 40
 *     ekran  (bu dosya)            :  5 · 10 · 20
 *
 * Sonuç: kullanıcı 5'e ulaşınca çubuk DOLUYOR ve ipucu "Isınıyor'a ulaştın"
 * diyordu, ama sunucu bonusu 10'da veriyor — ödül hiç gelmiyordu. Ekran
 * ödül vaat edip tutmayınca mekanik bağlayıcı olmaktan çıkar, bozuk görünür.
 *
 * `/api/live/streak` yanıtı `tiers` dizisini ZATEN yayımlıyordu; ekran onu
 * kullanmıyordu. Bu depoda yazılı kural: kuralı sunucu bilir, ekran tahmin
 * etmez. Yedek liste yalnızca sunucu alanı hiç göndermezse devreye girer ve
 * sunucudaki değerlerle AYNI tutulur.
 */
const YEDEK_TIERS: { threshold: number; labelKey: StringKey; emoji: string }[] = [
  { threshold: 10, labelKey: "streakWarmup", emoji: "🔥" },
  { threshold: 20, labelKey: "streakOnFire", emoji: "🔥🔥" },
  { threshold: 40, labelKey: "streakUnstoppable", emoji: "💥" },
];

/** Sunucudan gelen eşikleri ekran biçimine çevirir. */
function tierListesi(sunucu?: SunucuTier[] | null) {
  if (!Array.isArray(sunucu) || !sunucu.length) return YEDEK_TIERS;
  const emoji = ["🔥", "🔥🔥", "💥"];
  return sunucu
    .filter((x) => Number.isFinite(Number(x?.threshold)))
    .sort((a, b) => Number(a.threshold) - Number(b.threshold))
    .map((x, i) => ({
      threshold: Number(x.threshold),
      labelKey: TIER_KEYS[String(x.label)] ?? YEDEK_TIERS[i]?.labelKey ?? "streakWarmup",
      emoji: emoji[i] ?? "🔥",
    }));
}

export default function StreakBar({ seriesCumOdds, seriesCount, activeSeries, bestSeries, currentTier, tiers }: Props) {
  useLang(); // dil değişince yeniden çizilsin

  const TIERS = tierListesi(tiers);
  const nextTier = TIERS.find(ti => ti.threshold > seriesCumOdds) || TIERS[TIERS.length - 1];
  const progress = nextTier ? Math.min(1, seriesCumOdds / nextTier.threshold) : 1;

  // Çubuk dolumu yaylanarak ilerler — sıçrayan sayı yerine akan hareket.
  const dolum = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(dolum, {
      toValue: progress,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // width yüzdesi native sürücüyle animasyonlanamaz
    }).start();
  }, [progress, dolum]);

  // Seri aktifken alev nabız gibi atar; seri büyüdükçe alev büyür.
  const nabiz = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!activeSeries || seriesCount === 0) return;
    const dongu = Animated.loop(
      Animated.sequence([
        Animated.timing(nabiz, { toValue: 1.25, duration: 600, useNativeDriver: true }),
        Animated.timing(nabiz, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    dongu.start();
    return () => dongu.stop();
  }, [activeSeries, seriesCount, nabiz]);

  if (!activeSeries && seriesCount === 0 && bestSeries === 0) return null;

  const tierI18nKey = currentTier?.label ? TIER_KEYS[currentTier.label] ?? "streakSeries" : "streakSeries";
  const tierEmoji = currentTier?.label
    ? TIERS.find(ti => ti.labelKey === TIER_KEYS[currentTier.label])?.emoji ?? ""
    : "";
  const alevBoyu = 16 + Math.min(12, seriesCount * 2);
  const atesli = activeSeries && seriesCount > 0;

  return (
    <View style={[s.container, atesli && s.containerAtesli]}>
      {atesli && <GradyanZemin renkler={["#7c2d12", "#1e293b"]} yon="yatay" />}
      <View style={s.row}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {atesli && (
            <Animated.Text style={{ fontSize: alevBoyu, transform: [{ scale: nabiz }] }}>
              🔥
            </Animated.Text>
          )}
          <Text style={s.label}>
            {atesli ? `${t(tierI18nKey)} ${tierEmoji}` : t("newStreak")}
          </Text>
        </View>
        <Text style={s.stats}>
          {t("streakRow", { n: seriesCount, x: seriesCumOdds.toFixed(1) })}
        </Text>
      </View>

      <View style={s.barBg}>
        <Animated.View
          style={[
            s.barFill,
            atesli && { backgroundColor: "#fb923c" },
            { width: dolum.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) },
          ]}
        />
      </View>

      <View style={s.row}>
        <Text style={s.hint}>{t("streakNext", { label: t(nextTier?.labelKey ?? "streakWarmup"), threshold: String(nextTier?.threshold ?? 5) })}</Text>
        {bestSeries > 0 && <Text style={s.best}>{t("streakBest", { x: bestSeries.toFixed(1) })}</Text>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    overflow: "hidden",
  },
  containerAtesli: {
    borderWidth: 1,
    borderColor: "#fb923c66",
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { color: "#fbbf24", fontWeight: "800", fontSize: 13 },
  stats: { color: "#94a3b8", fontSize: 11, fontWeight: "600" },
  barBg: {
    height: 6, backgroundColor: "#334155", borderRadius: 3,
    marginVertical: 8, overflow: "hidden",
  },
  barFill: { height: 6, backgroundColor: "#a3e635", borderRadius: 3 },
  hint: { color: "#64748b", fontSize: 10 },
  best: { color: "#64748b", fontSize: 10 },
});
