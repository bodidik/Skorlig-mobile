/**
 * İZLEME MODU SEÇİCİ — kişinin kendi maç filtresi (2026-10-02).
 *
 * Kullanıcı: "Global 456 çok kalabalıksa kişi kolaylıkla profilinden fr40'a
 * daraltsın." Mod sunucuda kişinin kaydında durur (/api/users/set-izleme-modu);
 * kural tek kaynak api/lib/izleme-modu.cjs. Ülkesi yerel tabloda yoksa sunucu
 * etkin modu GLOBAL_100 döndürür — burada açıkça söylenir.
 */
import React, { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { useFocusEffect } from "expo-router";
import Colors from "../constants/colors";
import { apiFetch } from "../lib/apiFetch";
import { hataMesaji } from "../lib/hataMesaji";
import { t, useLang } from "../lib/i18n";

const MODLAR = [
  { key: "YEREL_40", ad: "izModYerel", acik: "izModYerelAcik" },
  { key: "GLOBAL_100", ad: "izModG100", acik: "izModG100Acik" },
  { key: "GLOBAL_456", ad: "izModG456", acik: "izModG456Acik" },
] as const;

export default function IzlemeModuSecici({ userId }: { userId: string | null | undefined }) {
  useLang();
  const [secili, setSecili] = useState<string | null>(null);
  const [etkin, setEtkin] = useState<string | null>(null);
  const [kayit, setKayit] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      try {
        const j = await apiFetch(`/api/users/profile?userId=${encodeURIComponent(userId)}`).then((r) => r.json());
        if (!alive || !j?.ok) return;
        setEtkin(j.profile?.etkinIzlemeModu || null);
        setSecili(j.profile?.izlemeModu || j.profile?.etkinIzlemeModu || null);
      } catch { /* seçici sessizce gizli kalır */ }
    })();
    return () => { alive = false; };
  }, [userId]));

  async function sec(mod: string) {
    if (kayit || mod === secili) return;
    setKayit(true);
    try {
      const r = await apiFetch(`/api/users/set-izleme-modu`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mod }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "IZLEME_MODU");
      setSecili(j.izlemeModu);
      setEtkin(j.etkinMod);
    } catch (e: any) {
      Alert.alert(t("error"), hataMesaji(e?.message || e));
    } finally {
      setKayit(false);
    }
  }

  if (!userId || !etkin) return null;
  const dustu = secili === "YEREL_40" && etkin !== "YEREL_40";

  return (
    <View style={{ backgroundColor: Colors.card, borderRadius: 14, borderWidth: 1, borderColor: Colors.cardBorder, padding: 14, gap: 8 }}>
      <Text style={{ color: Colors.slate900, fontWeight: "800", fontSize: 15 }}>{t("izModBaslik")}</Text>
      {MODLAR.map((m) => {
        const aktif = secili === m.key;
        return (
          <TouchableOpacity
            key={m.key}
            disabled={kayit}
            onPress={() => sec(m.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: aktif, disabled: kayit }}
            style={{
              padding: 12, borderRadius: 10, borderWidth: 1.5,
              borderColor: aktif ? Colors.accent : Colors.cardBorder,
              backgroundColor: aktif ? "#3b2a0a" : Colors.cardInner,
            }}
          >
            <Text style={{ color: aktif ? Colors.accent : Colors.slate900, fontWeight: "800", fontSize: 14 }}>
              {aktif ? "● " : "○ "}{t(m.ad)}
            </Text>
            <Text style={{ color: Colors.mutedOnCard, fontSize: 12, marginTop: 2 }}>{t(m.acik)}</Text>
          </TouchableOpacity>
        );
      })}
      {dustu ? <Text style={{ color: Colors.mutedOnCard, fontSize: 12 }}>{t("izModDustu")}</Text> : null}
    </View>
  );
}
