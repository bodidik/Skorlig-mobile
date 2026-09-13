import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { t, useLang } from "../lib/i18n";
import { gosterilsinMi, sayacCoz, GOSTERIM_SINIRI } from "../lib/nasilOynanirKurali";

/**
 * NASIL OYNANIR ŞERİDİ — ilk 20 açılışta, sonra susar.
 *
 * Kullanıcı kararı (2026-09-13): giriş slaytları ömürde bir kez çıkıyor ve
 * hızlı geçen kişi kuralları bir daha bulamıyordu. Şerit o boşluğu kapatıyor;
 * kalıcı çözüm `/nasil-oynanir` sayfası, bu yalnızca ona giden kapı.
 *
 * ⚠️ SAYAÇ AÇILIŞ BAŞINA BİR KEZ ARTAR, her render'da değil. Modül düzeyindeki
 * `_sayildi` bayrağı süreç boyunca yaşıyor: kullanıcı sekmeler arasında gezip
 * geri dönünce sayaç yine artsaydı şerit birkaç dakikada "20 açılış" görür ve
 * susardı.
 *
 * ⚠️ YÜKLEME BİTMEDEN DEPOYA YAZILMIYOR. Önce oku, sonra yaz: bu depoda
 * (ve kardeş projede) kayıtlı kusur, kurulum anında boş durumu depoya yazıp
 * kaydı silmek. `hazir` bir DURUM, ref değil — ref aynı commit'te true olur
 * ve yazma etkisi hâlâ boş durumu görür.
 *
 * ⚠️ TASARIM: tek satır, sabit yükseklik, otomatik kaybolmaz. `TanitimSeridi`
 * ile aynı kısıtlar — maç tablosunu itmesin, kayarken zıplamasın.
 */

const SAYAC_ANAHTARI = "skorlig.nasilOynanir.acilis";
const KAPALI_ANAHTARI = "skorlig.nasilOynanir.kapali";

/** Süreç başına tek sayım — bkz. başlıktaki not. */
let _sayildi = false;

export default function NasilOynanirSeridi() {
  useLang();
  const router = useRouter();
  const [hazir, setHazir] = useState(false);
  const [goster, setGoster] = useState(false);

  useEffect(() => {
    let iptal = false;
    (async () => {
      try {
        const [hamSayac, hamKapali] = await Promise.all([
          AsyncStorage.getItem(SAYAC_ANAHTARI),
          AsyncStorage.getItem(KAPALI_ANAHTARI),
        ]);
        const kapali = hamKapali === "1";
        const onceki = sayacCoz(hamSayac);

        /* Açılış sayımı: yalnızca bu süreçte ilk kez çalışıyorsa. */
        let sayac = onceki == null ? 1 : onceki;
        if (!_sayildi) {
          _sayildi = true;
          sayac = (onceki ?? 0) + 1;
          if (!kapali && sayac <= GOSTERIM_SINIRI + 1) {
            /* Sınırı geçtikten sonra yazmayı sürdürmek gereksiz I/O; bir
             * fazlasına kadar yazıp bırakıyoruz ki sınır kararı kalıcı olsun. */
            AsyncStorage.setItem(SAYAC_ANAHTARI, String(sayac)).catch(() => {});
          }
        }
        if (!iptal) {
          setGoster(gosterilsinMi(sayac, kapali));
          setHazir(true);
        }
      } catch {
        /* Depo okunamadı: şeridi göster. Kural yerine sessizliği seçmek,
         * yeni kullanıcıyı kuralsız bırakmaktan iyi değil. */
        if (!iptal) { setGoster(true); setHazir(true); }
      }
    })();
    return () => { iptal = true; };
  }, []);

  if (!hazir || !goster) return null;

  const kapat = () => {
    setGoster(false);
    AsyncStorage.setItem(KAPALI_ANAHTARI, "1").catch(() => {});
  };

  return (
    <View style={s.kok}>
      <Pressable
        style={s.sol}
        onPress={() => router.push("/nasil-oynanir")}
        accessibilityRole="button"
        accessibilityLabel={t("howOpen")}
      >
        <Text style={s.metin} numberOfLines={1}>
          {t("howStripText")}
        </Text>
      </Pressable>
      <Pressable onPress={kapat} accessibilityRole="button" hitSlop={8}>
        <Text style={s.kapat}>{t("howStripHide")}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  kok:    { flexDirection: "row", alignItems: "center", gap: 10, height: 34,
            paddingHorizontal: 12, backgroundColor: "#0f172a",
            borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#1e293b" },
  sol:    { flex: 1 },
  metin:  { fontSize: 12, color: "#cbd5e1" },
  kapat:  { fontSize: 11, color: "#94a3b8", fontWeight: "700" },
});
