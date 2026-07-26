import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  FlatList, Dimensions, useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../contexts/AuthContext";
import { markFirstRunDone } from "../lib/firstRun";
import { getDeviceCountry } from "../lib/locale";
import { apiFetch } from "../lib/apiFetch";

const GOLD = "#f59e0b";
const BG   = "#020617";
const CARD = "#0f172a";

const SLIDES = [
  {
    icon: "⚽",
    accent: GOLD,
    title: "Maç Tahmin Ligi",
    subtitle: "Dünyanın her liginden açık maçları seç",
    bullets: [
      "Skor, ilk gol, kırmızı kart, penaltı tahmin et",
      "Az kişinin tuttuğunu bilirsen daha fazla puan",
      "Her seçim isteğe bağlı — tek skor bile yeter",
    ],
  },
  {
    icon: "🪙",
    accent: GOLD,
    title: "LigCoin (LC) Sistemi",
    subtitle: "Para değil, puan biriktirirsin",
    bullets: [
      "Her gün ücretsiz LC hakkı al",
      "Maça girerken küçük bir giriş bedeli kesilir",
      "Doğru tahminlerde giriş bedelin de geri döner",
    ],
  },
  {
    icon: "⚔️",
    accent: "#ef4444",
    title: "Düello Modu",
    subtitle: "Bir maçta arkadaşına meydan oku",
    bullets: [
      "Tahmin ekranından Düello butonu ile başlat",
      "Aynı maçta kim daha doğru tahmin eder?",
      "Kazanan tüm havuzu alır",
    ],
  },
  {
    icon: "🏁",
    accent: "#22c55e",
    title: "Canlı Yarış",
    subtitle: "Maç sırasında sıranı saniye saniye izle",
    bullets: [
      "Gol olunca puan tablosu canlı güncellenir",
      "Kaçıncı sıraya düştüğünü anlık takip et",
      "Maç biter bitmez LC ödülü hesabına geçer",
    ],
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { width } = useWindowDimensions();

  const [slide, setSlide]               = useState(0);
  const [detectedCountry, setDetectedCountry] = useState<string | null>(null);
  const [busy, setBusy]                 = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => { setDetectedCountry(getDeviceCountry()); }, []);

  const isLast = slide === SLIDES.length - 1;

  function goNext() {
    if (isLast) { handleStart(); return; }
    const next = slide + 1;
    setSlide(next);
    listRef.current?.scrollToIndex({ index: next, animated: true });
  }

  function goBack() {
    if (slide === 0) return;
    const prev = slide - 1;
    setSlide(prev);
    listRef.current?.scrollToIndex({ index: prev, animated: true });
  }

  async function handleStart() {
    setBusy(true);
    try {
      if (detectedCountry && user) {
        await apiFetch("/api/users/set-country", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ country: detectedCountry }),
        });
      }
    } catch {}
    finally {
      await markFirstRunDone();
      setBusy(false);
      router.replace("/(tabs)/live");
    }
  }

  const accent = SLIDES[slide].accent;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Üst logo şeridi */}
      <View style={{ paddingTop: 56, paddingHorizontal: 24, alignItems: "center", gap: 4 }}>
        <Text style={{ fontSize: 26, fontWeight: "900", color: "#fff", letterSpacing: 1 }}>
          Skor<Text style={{ color: GOLD }}>Lig</Text>
          <Text style={{ color: "#64748b", fontWeight: "400", fontSize: 18 }}> 87</Text>
        </Text>
      </View>

      {/* Slaytlar */}
      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item }) => (
          <View style={{ width, paddingHorizontal: 28, paddingTop: 36, gap: 20 }}>
            {/* İkon + başlık */}
            <View style={{ alignItems: "center", gap: 10 }}>
              <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: item.accent + "22", borderWidth: 2, borderColor: item.accent + "66", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 42 }}>{item.icon}</Text>
              </View>
              <Text style={{ color: "#fff", fontSize: 22, fontWeight: "900", textAlign: "center" }}>
                {item.title}
              </Text>
              <Text style={{ color: "#94a3b8", fontSize: 14, textAlign: "center" }}>
                {item.subtitle}
              </Text>
            </View>

            {/* Bullet listesi */}
            <View style={{ gap: 10 }}>
              {item.bullets.map((b, bi) => (
                <View key={bi} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: item.accent + "33", padding: 14 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: item.accent + "22", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                    <Text style={{ color: item.accent, fontWeight: "900", fontSize: 12 }}>{bi + 1}</Text>
                  </View>
                  <Text style={{ flex: 1, color: "#cbd5e1", fontSize: 14, lineHeight: 20 }}>{b}</Text>
                </View>
              ))}
            </View>

            {/* Ülke tespiti (son slayt) */}
            {item === SLIDES[SLIDES.length - 1] && detectedCountry && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: GOLD + "33", paddingHorizontal: 14, paddingVertical: 10 }}>
                <Text style={{ fontSize: 18 }}>📍</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: GOLD, fontWeight: "700", fontSize: 13 }}>Ülken: {detectedCountry}</Text>
                  <Text style={{ color: "#64748b", fontSize: 11 }}>Profilden değiştirebilirsin</Text>
                </View>
              </View>
            )}
          </View>
        )}
      />

      {/* Alt navigasyon */}
      <View style={{ paddingHorizontal: 24, paddingBottom: 40, gap: 16 }}>
        {/* Nokta göstergesi */}
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6 }}>
          {SLIDES.map((_, i) => (
            <View key={i} style={{ width: i === slide ? 20 : 6, height: 6, borderRadius: 3, backgroundColor: i === slide ? accent : "#1e293b" }} />
          ))}
        </View>

        {/* Butonlar */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          {slide > 0 && (
            <TouchableOpacity
              onPress={goBack}
              style={{ paddingVertical: 14, paddingHorizontal: 20, borderRadius: 999, backgroundColor: CARD, borderWidth: 1, borderColor: "#1e293b" }}
            >
              <Text style={{ color: "#94a3b8", fontWeight: "700", fontSize: 15 }}>←</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={goNext}
            disabled={busy}
            style={{ flex: 1, paddingVertical: 15, borderRadius: 999, backgroundColor: accent, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
          >
            {busy
              ? <ActivityIndicator color="#020617" />
              : <Text style={{ color: "#020617", fontWeight: "900", fontSize: 16 }}>
                  {isLast ? "Hadi Başlayalım ⚽" : "Devam →"}
                </Text>
            }
          </TouchableOpacity>
        </View>

        {/* Direkt geç */}
        {!isLast && (
          <TouchableOpacity onPress={handleStart} style={{ alignItems: "center" }}>
            <Text style={{ color: "#475569", fontSize: 13 }}>Geç</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
