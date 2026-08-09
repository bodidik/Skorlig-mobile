import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Konfeti from "./Konfeti";
import { apiFetch } from "../lib/apiFetch";
import { useUserId } from "../lib/useUserId";
import { t, useLang } from "../lib/i18n";
import { titret } from "../lib/hisler";

/**
 * KAZANDIN BİLDİRİMİ — kullanıcı yokken sonuçlanan kazançları kutlar.
 *
 * ⚠️ NEDEN VAR: maçlar kullanıcı uygulamada değilken sonuçlanıyor; LC
 * bakiyesi sessizce artıyor ve kazanma anı hiç yaşanmıyordu. Oyunun en
 * güçlü duygusal anı ödülsüz kalıyordu.
 *
 * Yöntem: açılışta cüzdan defterinin son kayıtları okunur; en son görülen
 * kayıt zamanı cihazda tutulur (kullanıcıya özel anahtar). O zamandan yeni,
 * pozitif ve iade/günlük-hak OLMAYAN kayıtların toplamı kutlanır.
 *
 * ⚠️ İLK AÇILIŞTA KUTLAMA YOK: kayıtlı zaman yoksa yalnızca damga atılır —
 * yoksa tüm geçmiş "yeni kazanç" sanılıp taşma yaşanır.
 */
const KUTLANMAZ = /iade|refund|daily|initial|migration|signup|store|purchase|topup/i;

type Kayit = { amount?: number; reason?: string; kind?: string; createdAt?: string };

export default function KazancBildirimi() {
  useLang();
  const userId = useUserId();
  const [toplam, setToplam] = useState<number | null>(null);
  const giris = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const uid = userId.trim();
    if (!uid) return;
    let iptal = false;
    (async () => {
      try {
        const anahtar = `sonGorulenKazanc:${uid.toLowerCase()}`;
        const sonISO = await AsyncStorage.getItem(anahtar);
        const r = await apiFetch(`/api/rt/lc-wallet/ledger?userId=${encodeURIComponent(uid)}&limit=50`);
        const j = await r.json();
        if (iptal || !j?.ok || !Array.isArray(j.items)) return;

        const kayitlar: Kayit[] = j.items;
        const enYeni = kayitlar
          .map((k) => String(k.createdAt || ""))
          .filter(Boolean)
          .sort()
          .pop();
        if (!enYeni) return;

        if (!sonISO) {
          // İlk açılış: geçmişi kutlamadan damgala.
          await AsyncStorage.setItem(anahtar, enYeni);
          return;
        }

        const yeniKazanc = kayitlar
          .filter((k) =>
            Number(k.amount) > 0 &&
            String(k.createdAt || "") > sonISO &&
            !KUTLANMAZ.test(String(k.reason || k.kind || "")))
          .reduce((a, k) => a + Number(k.amount), 0);

        await AsyncStorage.setItem(anahtar, enYeni);

        if (yeniKazanc > 0 && !iptal) {
          setToplam(Math.round(yeniKazanc * 10) / 10);
          titret("gol");
          Animated.spring(giris, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 12 }).start();
        }
      } catch {}
    })();
    return () => { iptal = true; };
  }, [userId, giris]);

  if (toplam === null) return null;

  const kapat = () => setToplam(null);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <TouchableOpacity activeOpacity={1} onPress={kapat} style={s.karart}>
        <Animated.View style={[s.kutu, { transform: [{ scale: giris }] }]}>
          <Konfeti anahtar={toplam} />
          <Text style={{ fontSize: 44 }}>🏆</Text>
          <Text style={s.baslik}>{t("youWonTitle")}</Text>
          <Text style={s.tutar}>+{toplam} LC</Text>
          <Text style={s.alt}>{t("youWonSub")}</Text>
          <TouchableOpacity onPress={kapat} style={s.dugme}>
            <Text style={s.dugmeYazi}>{t("collectBtn")}</Text>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  karart: {
    flex: 1,
    backgroundColor: "#000000aa",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  kutu: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#0f172a",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#f59e0b66",
    alignItems: "center",
    padding: 24,
    gap: 6,
    overflow: "hidden",
  },
  baslik: { color: "#fbbf24", fontSize: 20, fontWeight: "900" },
  tutar: { color: "#a3e635", fontSize: 32, fontWeight: "900" },
  alt: { color: "#94a3b8", fontSize: 12, textAlign: "center" },
  dugme: {
    marginTop: 10,
    backgroundColor: "#f59e0b",
    borderRadius: 999,
    paddingHorizontal: 28,
    paddingVertical: 11,
  },
  dugmeYazi: { color: "#020617", fontWeight: "900", fontSize: 14 },
});
