import React from "react";
import { View, Text } from "react-native";

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

export type PriorityGroup = "country" | "global" | "big" | "other" | "friendly";

type Props = {
  group: PriorityGroup | string;
  /** Kullanıcının ülkesi — "country" grubunun başlığında gösterilir. */
  country?: string | null;
};

const GOLD = "#f59e0b";

function baslikIcin(group: string, country?: string | null) {
  switch (group) {
    case "country":
      // Ülke adı varsa onu yaz: "Türkiye" başlığı "Ülkeniz"den daha net.
      return { icon: "⭐", text: country?.trim() || "Ülkeniz", color: GOLD };
    case "global":
      return { icon: "🏆", text: "Avrupa & Dünya Kupaları", color: "#818cf8" };
    case "big":
      return { icon: "🔥", text: "Büyük Ligler", color: "#f87171" };
    case "other":
      return { icon: "🌍", text: "Diğer Ligler", color: "#38bdf8" };
    case "friendly":
      return { icon: "🤝", text: "Hazırlık Maçları", color: "#94a3b8" };
    default:
      return { icon: "⚽", text: "Maçlar", color: "#94a3b8" };
  }
}

export default function GroupHeader({ group, country }: Props) {
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
