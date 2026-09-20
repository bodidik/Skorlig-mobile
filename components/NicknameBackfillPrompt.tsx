import React, { useEffect, useState } from "react";
import {
  View, Text, TouchableOpacity, Modal, TextInput, ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../contexts/AuthContext";
import { apiFetch } from "../lib/apiFetch";
import { t, useLang } from "../lib/i18n";
import { isFirstRun } from "../lib/firstRun";
import { getPendingNickname } from "../lib/pendingNickname";
import { adOner, gonderilebilirMi } from "../lib/takmaAd";

/**
 * Adı olmayan MEVCUT kullanıcılar için geri doldurma.
 *
 * ⚠️ NEDEN AYRI BİR YÜZEY: onboarding düzeltmesi yalnızca YENİ kullanıcıları
 * kapsıyor — kurulumu daha önce tamamlamış herkes `firstRun` işaretli olduğu
 * için o ekranı bir daha görmez. Ölçülen kusur tam olarak onlarda:
 * 2026-09-20'de canlı sıralamadaki 6 insanın 5'i ham Firebase kimliği olarak
 * görünüyordu. Onboarding'i düzeltip burayı boş bırakmak, ölçülen vakaların
 * hiçbirini kapatmazdı.
 *
 * ⚠️ ENGELLEMEZ. "Sonra" ile kapatılır, o gün tekrar sorulmaz —
 * `CountryBackfillPrompt` ile aynı sözleşme. Ad kozmetik değil (sıralamada
 * görünen kimlik) ama oyunu kilitleyecek kadar da kritik değil; ülke seçimi
 * bile engellemiyor.
 */

const GOLD = "#f59e0b";
const BG   = "#020617";
const CARD = "#0f172a";

const SNOOZE_KEY = "skorlig.nicknamePrompt.snoozedUntil";
const SNOOZE_MS  = 24 * 60 * 60 * 1000; // 1 gün

export default function NicknameBackfillPrompt() {
  useLang(); // dil değişince yeniden çizilsin
  const { user, loading } = useAuth();

  const [visible, setVisible] = useState(false);
  const [deger, setDeger]     = useState("");
  const [saving, setSaving]   = useState(false);
  const [hata, setHata]       = useState<string | null>(null);
  const [onerildi, setOnerildi] = useState(false);

  // Ad eksik mi? Oturum oturduktan sonra bir kez bak.
  useEffect(() => {
    if (loading || !user) return;
    let alive = true;

    (async () => {
      try {
        // İlk kurulum sürüyorsa karışma: onboarding zaten adı soruyor.
        if (await isFirstRun()) return;

        const snoozed = await AsyncStorage.getItem(SNOOZE_KEY);
        if (snoozed && Date.now() < Number(snoozed)) return;

        // Onboarding'de yazılmış ama henüz gönderilememiş bir ad varsa
        // `flushPendingNickname` onu halleder — üstüne sorma.
        if (await getPendingNickname()) return;

        const res  = await apiFetch(
          `/api/users/profile?userId=${encodeURIComponent(user.uid)}`
        );
        const data = await res.json();
        if (!alive) return;

        if (data?.ok && !data.profile?.nickname) {
          /* Google adı varsa ÖNERİ olarak doldur — yalnızca ilk ad, ve
           * kullanıcı görüp onaylamadan hiçbir yere gitmez. Anonim girişte
           * `displayName` null, alan boş açılır. */
          const oneri = adOner(user.displayName);
          if (oneri) { setDeger(oneri); setOnerildi(true); }
          setVisible(true);
        }
      } catch {
        // Ağ hatası: sorma, sonraki açılışta tekrar denenir.
      }
    })();

    return () => { alive = false; };
  }, [user, loading]);

  async function snooze() {
    try {
      await AsyncStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {}
    setVisible(false);
  }

  async function kaydet() {
    const ad = deger.trim();
    if (!gonderilebilirMi(ad)) { setHata(t("nickLength")); return; }

    setSaving(true);
    setHata(null);
    try {
      const res  = await apiFetch("/api/users/set-nickname", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: ad }),
      });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.ok) {
        setVisible(false);
        return;
      }

      /* ⚠️ REDDİ YUTMA, EKRANDA SÖYLE. Ülke tarafında ret tek sebepliydi ve
       * oradaki çözüm "ertele"ydi; burada ret büyük ihtimalle ÇAKIŞMA ve
       * kullanıcının yapabileceği bir şey var: başka bir ad yazmak.
       * Erteleseydik kişi neden kaydedilmediğini hiç öğrenmezdi. */
      const kod = String(data?.error || "");
      setHata(
        kod === "NICKNAME_TAKEN"    ? t("nickTaken")
        : kod === "NICKNAME_RESERVED" ? t("nickReserved")
        : kod === "NICKNAME_LENGTH"   ? t("nickLength")
        : kod === "NICKNAME_INVALID"  ? t("nickInvalid")
        : t("saveFailed")
      );
    } catch {
      setHata(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={snooze}>
      <View style={{ flex: 1, backgroundColor: "#000000cc", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: BG, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 18 }}>
          <View style={{ paddingHorizontal: 20, gap: 10, paddingBottom: 16 }}>
            <Text style={{ color: "#fff", fontSize: 19, fontWeight: "900" }}>
              {t("nickBackfillTitle")}
            </Text>
            <Text style={{ color: "#94a3b8", fontSize: 13, lineHeight: 19 }}>
              {t("nickBackfillMsg")}
            </Text>

            <TextInput
              value={deger}
              onChangeText={(x) => { setDeger(x); setHata(null); setOnerildi(false); }}
              placeholder={t("nicknamePh")}
              placeholderTextColor="#475569"
              maxLength={20}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ backgroundColor: CARD, borderRadius: 10, borderWidth: 1, borderColor: hata ? "#ef444466" : "#1e293b", paddingHorizontal: 14, paddingVertical: 11, color: "#fff", fontSize: 16 }}
            />

            {hata ? (
              <Text style={{ color: "#ef4444", fontSize: 12 }}>{hata}</Text>
            ) : onerildi ? (
              <Text style={{ color: "#64748b", fontSize: 12 }}>{t("nickSuggested")}</Text>
            ) : (
              <Text style={{ color: "#64748b", fontSize: 12 }}>{t("nicknameHelp")}</Text>
            )}

            <TouchableOpacity
              onPress={kaydet}
              disabled={saving || !gonderilebilirMi(deger)}
              style={{ marginTop: 4, paddingVertical: 14, borderRadius: 999, alignItems: "center", backgroundColor: saving || !gonderilebilirMi(deger) ? "#1e293b" : GOLD }}
            >
              {saving
                ? <ActivityIndicator color="#020617" />
                : <Text style={{ color: saving || !gonderilebilirMi(deger) ? "#475569" : "#020617", fontWeight: "900", fontSize: 15 }}>
                    {t("save")}
                  </Text>
              }
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={snooze}
            disabled={saving}
            style={{ alignItems: "center", paddingVertical: 16, borderTopWidth: 1, borderTopColor: "#0f172a" }}
          >
            <Text style={{ color: "#475569", fontSize: 14 }}>{t("later")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
