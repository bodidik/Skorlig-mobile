import React from "react";
import { View, Text } from "react-native";
import { t, useLang } from "../lib/i18n";
import { ulkeAdi } from "../lib/ulkeler";

/**
 * Maç listesi grup başlığı.
 *
 * NEDEN VAR: Liste sunucudan ÖNCELİK SIRASINDA geliyor — kullanıcının ülkesi,
 * sonra küresel turnuvalar, sonra büyük ligler, sonra kalan her şey, en sonda
 * hazırlık maçları. Başlık olmadan bu sıra görünmez; kullanıcı 49 maçlık düz
 * bir liste görür ve neden bu sırada olduğunu anlamaz.
 *
 * Eleme YOK: başlıklar yalnızca yol gösterir, kullanıcı aşağı kaydırarak her
 * maça ulaşır. (Eskiden ülke süzgeci maçları gizliyordu ve Türk kullanıcı
 * sezon arasında 14 gün boyunca hiç maç göremiyordu.)
 *
 * Grup etiketi SUNUCUDAN gelir (lib/fixture-priority.cjs) — aynı kuralı
 * istemcide yeniden yazmak bu projede defalarca sessiz ayrışma yarattı.
 */

export type PriorityGroup = "countryTop" | "country" | "global" | "big" | "other" | "friendly";

type Props = {
  group: PriorityGroup | string;
  /** Kullanıcının ülkesi — "country" grubunun başlığında gösterilir. */
  country?: string | null;
};

const GOLD = "#f59e0b";

function baslikIcin(group: string, country?: string | null) {
  switch (group) {
    /* ⚠️ ÜLKENİN EN ÜST LİGİ AYRI BAŞLIK. Kullanıcı kararı: "ülkenin en üst
     * düzey ilk ligi o ülkedekilere öncelikle sunulsun." Sunucu bu grubu ayrı
     * etiketliyor (lib/fixture-priority → countryTop); başlık da ayrılmazsa
     * Süper Lig ile 1. Lig aynı bloğun içinde görünür ve ayrım kaybolur. */
    case "countryTop":
      return { icon: "⭐", text: ulkeAdi(country) || t("yourCountryGrp"), color: GOLD };
    case "country":
      // Aynı ülkenin alt ligleri/kupaları — üst ligden sonra gelir.
      return { icon: "⚽", text: t("countryOtherGrp"), color: "#fbbf24" };
    case "global":
      return { icon: "🏆", text: t("cupsGrp"), color: "#818cf8" };
    case "big":
      return { icon: "🔥", text: t("bigLeagues"), color: "#f87171" };
    case "other":
      return { icon: "🌍", text: t("otherLeagues"), color: "#38bdf8" };
    case "friendly":
      return { icon: "🤝", text: t("friendlies"), color: "#94a3b8" };
    default:
      return { icon: "⚽", text: t("matches"), color: "#94a3b8" };
  }
}

export default function GroupHeader({ group, country }: Props) {
  useLang(); // dil değişince yeniden çizilsin
  const { icon, text, color } = baslikIcin(String(group || ""), country);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginTop: 14,
        marginBottom: 8,
      }}
    >
      <Text style={{ fontSize: 14 }}>{icon}</Text>
      <Text
        style={{
          color,
          fontSize: 12,
          fontWeight: "900",
          letterSpacing: 0.6,
          textTransform: "uppercase",
        }}
      >
        {text}
      </Text>
      {/* İnce ayraç: başlığı listeden görsel olarak ayırır */}
      <View style={{ flex: 1, height: 1, backgroundColor: color + "33" }} />
    </View>
  );
}
