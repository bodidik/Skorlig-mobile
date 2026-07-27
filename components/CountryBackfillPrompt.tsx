import React, { useEffect, useState } from "react";
import {
  View, Text, TouchableOpacity, Modal, TextInput, FlatList, ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../contexts/AuthContext";
import { apiFetch } from "../lib/apiFetch";
import { getPendingCountry } from "../lib/pendingCountry";
import { isFirstRun } from "../lib/firstRun";

/**
 * Ülkesi olmayan mevcut kullanıcılar için geri doldurma akışı.
 *
 * Onboarding düzeltmesi yalnızca YENİ kullanıcıları kapsar: düzeltmeden önce
 * kurulumu tamamlamış herkes `firstRun` işaretli olduğu için ülke ekranını bir
 * daha görmez ve ülkesiz kalır. Ülkesiz kullanıcı hiçbir ülke sıralamasında
 * görünmez — bu prompt onları tek dokunuşla geri kazandırır.
 *
 * Engellemez: "Sonra" ile kapatılabilir, o gün tekrar sorulmaz.
 */

const GOLD = "#f59e0b";
const BG   = "#020617";
const CARD = "#0f172a";

const SNOOZE_KEY = "skorlig.countryPrompt.snoozedUntil";
const SNOOZE_MS  = 24 * 60 * 60 * 1000; // 1 gün

type CountryOpt = { country: string; flag: string };

export default function CountryBackfillPrompt() {
  const { user, loading } = useAuth();

  const [visible, setVisible]   = useState(false);
  const [countries, setCountries] = useState<CountryOpt[]>([]);
  const [search, setSearch]     = useState("");
  const [saving, setSaving]     = useState(false);

  // Ülke eksik mi? Oturum oturduktan sonra bir kez bak.
  useEffect(() => {
    if (loading || !user) return;
    let alive = true;

    (async () => {
      try {
        // İlk kurulum sürüyorsa karışma: onboarding zaten ülke soruyor,
        // bu prompt onun üstüne açılmamalı.
        if (await isFirstRun()) return;

        // Bu gün için ertelenmişse sorma
        const snoozed = await AsyncStorage.getItem(SNOOZE_KEY);
        if (snoozed && Date.now() < Number(snoozed)) return;

        // Onboarding'de seçilmiş ama henüz gönderilememiş bir ülke varsa,
        // flushPendingCountry onu halleder — kullanıcıyı tekrar rahatsız etme.
        if (await getPendingCountry()) return;

        const res  = await apiFetch(
          `/api/users/profile?userId=${encodeURIComponent(user.uid)}`
        );
        const data = await res.json();
        if (!alive) return;

        if (data?.ok && !data.profile?.country) setVisible(true);
      } catch {
        // Ağ hatası: sorma, sonraki açılışta tekrar denenir.
      }
    })();

    return () => { alive = false; };
  }, [user, loading]);

  // Ülke listesi — yalnızca prompt açıldığında çek
  useEffect(() => {
    if (!visible || countries.length) return;
    let alive = true;

    (async () => {
      try {
        // Ülke listesi statik — 5dk önbellek (onboarding ile paylaşılır).
        const res  = await apiFetch("/api/live2/countries", { skipAuth: true, cacheMs: 5 * 60_000 });
        const data = await res.json();
        const list: CountryOpt[] = (data?.countries ?? [])
          .map((c: any) =>
            typeof c === "string"
              ? { country: c, flag: "" }
              : { country: c?.country, flag: c?.flag ?? "" }
          )
          .filter((c: CountryOpt) => !!c.country);
        if (alive) setCountries(list);
      } catch {}
    })();

    return () => { alive = false; };
  }, [visible, countries.length]);

  async function snooze() {
    try {
      await AsyncStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {}
    setVisible(false);
  }

  async function choose(country: string) {
    setSaving(true);
    try {
      const res  = await apiFetch("/api/users/set-country", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country }),
      });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.ok) {
        setVisible(false);
      } else {
        // Kaydedilemedi: kullanıcıyı kilitleme, yarın tekrar sor.
        await snooze();
      }
    } catch {
      await snooze();
    } finally {
      setSaving(false);
    }
  }

  const filtered = search.trim()
    ? countries.filter((c) =>
        c.country.toLocaleLowerCase("tr").includes(search.trim().toLocaleLowerCase("tr"))
      )
    : countries;

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={snooze}>
      <View style={{ flex: 1, backgroundColor: "#000000cc", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: BG, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "80%", paddingTop: 18 }}>
          <View style={{ paddingHorizontal: 20, gap: 10, paddingBottom: 12 }}>
            <Text style={{ color: "#fff", fontSize: 19, fontWeight: "900" }}>
              Ülkeni seç 📍
            </Text>
            <Text style={{ color: "#94a3b8", fontSize: 13, lineHeight: 19 }}>
              Ülkeni seçmeden ülke sıralamasında yer alamazsın. Maç listen de
              yereline göre kişiselleşir.
            </Text>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Ülke ara..."
              placeholderTextColor="#475569"
              style={{ backgroundColor: CARD, borderRadius: 10, borderWidth: 1, borderColor: "#1e293b", paddingHorizontal: 14, paddingVertical: 10, color: "#fff", fontSize: 15 }}
            />
          </View>

          {saving ? (
            <View style={{ padding: 32, alignItems: "center", gap: 10 }}>
              <ActivityIndicator color={GOLD} />
              <Text style={{ color: "#64748b", fontSize: 13 }}>Kaydediliyor…</Text>
            </View>
          ) : countries.length === 0 ? (
            <View style={{ padding: 32, alignItems: "center", gap: 10 }}>
              <ActivityIndicator color={GOLD} />
              <Text style={{ color: "#64748b", fontSize: 13 }}>Ülkeler yükleniyor…</Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(c) => c.country}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 20 }}
              renderItem={({ item: c }) => (
                <TouchableOpacity
                  onPress={() => choose(c.country)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#0f172a" }}
                >
                  {!!c.flag && <Text style={{ fontSize: 20 }}>{c.flag}</Text>}
                  <Text style={{ flex: 1, color: "#cbd5e1", fontSize: 15 }}>{c.country}</Text>
                  <Text style={{ color: "#475569", fontSize: 18 }}>›</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={{ color: "#475569", fontSize: 13, textAlign: "center", paddingVertical: 24 }}>
                  Eşleşen ülke yok
                </Text>
              }
            />
          )}

          <TouchableOpacity
            onPress={snooze}
            disabled={saving}
            style={{ alignItems: "center", paddingVertical: 16, borderTopWidth: 1, borderTopColor: "#0f172a" }}
          >
            <Text style={{ color: "#475569", fontSize: 14 }}>Sonra</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
