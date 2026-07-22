"use strict";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, RefreshControl,
} from "react-native";
import Colors from "../constants/colors";
import { getApiBase } from "../lib/apiBase";
import { withAdminHeaders, hasAdminToken } from "../lib/adminToken";
import BackBar from "../components/BackBar";

type Fx = {
  fixtureId: string;
  home?: string | null;
  away?: string | null;
  kickoffISO?: string | null;
  kickoffDate?: string | null;
  status?: string | null;
  league?: string | null;
  note?: string | null;
  source?: string | null;
};

async function apiFetch(path: string, init?: RequestInit) {
  const base = await getApiBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  const headers: Record<string, string> = await withAdminHeaders({
    ...((init?.headers as Record<string, string>) || {}),
  });
  return fetch(`${base}${p}`, { ...(init || {}), headers });
}

function fmtKick(fx: Fx) {
  const iso = fx.kickoffISO || fx.kickoffDate;
  if (!iso) return "-";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return String(iso);
  return d.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// "2026-01-20" + "20:00" -> ISO (Türkiye saati, +03:00)
function buildKickoffISO(dateStr: string, timeStr: string): string | null {
  const d = dateStr.trim();
  const t = (timeStr.trim() || "00:00");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  if (!/^\d{1,2}:\d{2}$/.test(t)) return null;
  const [hh, mm] = t.split(":");
  return `${d}T${hh.padStart(2, "0")}:${mm}:00+03:00`;
}

export default function AdminAddScreen() {
  const [tokenReady, setTokenReady] = useState(false);
  useEffect(() => { hasAdminToken().then(setTokenReady); }, []);

  // ── Yeni maç formu ──
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [timeStr, setTimeStr] = useState("20:00");
  const [league, setLeague] = useState("");
  const [country, setCountry] = useState("Turkey");
  const [newNote, setNewNote] = useState("");
  const [adding, setAdding] = useState(false);

  // ── Mevcut maçlar + not editörü ──
  const [fixtures, setFixtures] = useState<Fx[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});   // fixtureId -> düzenlenen metin
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadFixtures = useCallback(async () => {
    try {
      const r = await apiFetch("/api/admin/fixtures").then(x => x.json());
      const list: Fx[] = Array.isArray(r?.fixtures) ? r.fixtures : [];
      // en yeni önce (zaten sunucu sıralı ama garanti)
      list.sort((a, b) => {
        const ta = new Date(a.kickoffISO || a.kickoffDate || 0).getTime();
        const tb = new Date(b.kickoffISO || b.kickoffDate || 0).getTime();
        return tb - ta;
      });
      setFixtures(list);
      const seed: Record<string, string> = {};
      for (const f of list) if (f.note) seed[String(f.fixtureId)] = String(f.note);
      setNotes(seed);
    } catch (e: any) {
      Alert.alert("Hata", String(e?.message || e));
    }
  }, []);

  useEffect(() => { setLoading(true); loadFixtures().finally(() => setLoading(false)); }, [loadFixtures]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFixtures();
    setRefreshing(false);
  }, [loadFixtures]);

  const canAdd = useMemo(() =>
    home.trim() !== "" && away.trim() !== "" && buildKickoffISO(dateStr, timeStr) != null,
    [home, away, dateStr, timeStr]
  );

  const addMatch = useCallback(async () => {
    if (!tokenReady) { Alert.alert("Admin", "Token ayarlı değil. Profil > Admin bölümünden token gir."); return; }
    const kickoffISO = buildKickoffISO(dateStr, timeStr);
    if (!kickoffISO) { Alert.alert("Eksik bilgi", "Tarih (YYYY-AA-GG) ve saat (SS:DD) geçerli olmalı."); return; }
    try {
      setAdding(true);
      const r = await apiFetch("/api/admin/fixtures/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          home: home.trim(), away: away.trim(), kickoffISO,
          league: league.trim() || undefined,
          country: country.trim() || undefined,
          note: newNote.trim() || undefined,
        }),
      }).then(x => x.json());

      if (!r?.ok) {
        Alert.alert("Hata", r?.error === "FIXTURE_EXISTS" ? "Bu maç zaten ekli." : (r?.error || "EKLENEMEDI"));
        return;
      }
      Alert.alert("Eklendi ✓", `${home.trim()} — ${away.trim()}\n${fmtKick(r.fixture)}`);
      setHome(""); setAway(""); setDateStr(""); setTimeStr("20:00"); setLeague(""); setNewNote("");
      await loadFixtures();
    } catch (e: any) {
      Alert.alert("Hata", String(e?.message || e));
    } finally {
      setAdding(false);
    }
  }, [tokenReady, home, away, dateStr, timeStr, league, country, newNote, loadFixtures]);

  const saveNote = useCallback(async (fx: Fx) => {
    const fid = String(fx.fixtureId);
    const note = (notes[fid] ?? "").trim();
    try {
      setSavingId(fid);
      const r = await apiFetch("/api/admin/match-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixtureId: fid, note, home: fx.home, away: fx.away }),
      }).then(x => x.json());
      if (!r?.ok) { Alert.alert("Hata", r?.error || "NOT_KAYDEDILEMEDI"); return; }
      Alert.alert(note ? "Not kaydedildi ✓" : "Not silindi", note ? "Kullanıcılar bu notu görecek." : "");
      await loadFixtures();
    } catch (e: any) {
      Alert.alert("Hata", String(e?.message || e));
    } finally {
      setSavingId(null);
    }
  }, [notes, loadFixtures]);

  const deleteMatch = useCallback((fx: Fx) => {
    Alert.alert("Maçı sil", `${fx.home} — ${fx.away}\n\nBu maç listeden kaldırılsın mı?`, [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil", style: "destructive",
        onPress: async () => {
          try {
            const r = await apiFetch("/api/admin/fixtures/delete", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fixtureId: fx.fixtureId }),
            }).then(x => x.json());
            if (!r?.ok) { Alert.alert("Hata", r?.error || "SILINEMEDI"); return; }
            await loadFixtures();
          } catch (e: any) { Alert.alert("Hata", String(e?.message || e)); }
        },
      },
    ]);
  }, [loadFixtures]);

  const inputStyle = {
    color: "#e2e8f0", borderWidth: 1, borderColor: "#334155", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, backgroundColor: "#0b1220",
  } as const;

  const Label = ({ children }: { children: string }) => (
    <Text style={{ color: "#94a3b8", fontSize: 12, fontWeight: "700", marginBottom: 4 }}>{children}</Text>
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#020617" }}>
      <BackBar title="➕ Maç Ekle + Not" />
      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#475569" />}
      >
        {!tokenReady && (
          <View style={{ backgroundColor: "#3a1212", borderColor: "#7f1d1d", borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 12 }}>
            <Text style={{ color: "#fca5a5", fontSize: 12 }}>
              Admin token ayarlı değil — Profil {">"} Admin bölümünden token gir, sonra buraya dön.
            </Text>
          </View>
        )}

        {/* ── YENİ MAÇ FORMU ── */}
        <View style={{ backgroundColor: "#0f172a", borderRadius: 14, borderWidth: 1, borderColor: "#1e293b", padding: 14, gap: 10 }}>
          <Text style={{ color: "#e2e8f0", fontWeight: "900", fontSize: 16 }}>Yeni Maç</Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Label>Ev Sahibi</Label>
              <TextInput value={home} onChangeText={setHome} placeholder="Galatasaray" placeholderTextColor="#475569" style={inputStyle} />
            </View>
            <View style={{ flex: 1 }}>
              <Label>Deplasman</Label>
              <TextInput value={away} onChangeText={setAway} placeholder="Fenerbahçe" placeholderTextColor="#475569" style={inputStyle} />
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 2 }}>
              <Label>Tarih (YYYY-AA-GG)</Label>
              <TextInput value={dateStr} onChangeText={setDateStr} placeholder="2026-01-20" placeholderTextColor="#475569" keyboardType="numbers-and-punctuation" style={inputStyle} />
            </View>
            <View style={{ flex: 1 }}>
              <Label>Saat</Label>
              <TextInput value={timeStr} onChangeText={setTimeStr} placeholder="20:00" placeholderTextColor="#475569" keyboardType="numbers-and-punctuation" style={inputStyle} />
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 2 }}>
              <Label>Lig (opsiyonel)</Label>
              <TextInput value={league} onChangeText={setLeague} placeholder="Süper Lig" placeholderTextColor="#475569" style={inputStyle} />
            </View>
            <View style={{ flex: 1 }}>
              <Label>Ülke</Label>
              <TextInput value={country} onChangeText={setCountry} placeholder="Turkey" placeholderTextColor="#475569" style={inputStyle} />
            </View>
          </View>

          <View>
            <Label>Not (opsiyonel · kullanıcılar görür)</Label>
            <TextInput
              value={newNote} onChangeText={setNewNote} multiline
              placeholder="Örn: Bu maç tarafsız sahada oynanacak."
              placeholderTextColor="#475569"
              style={{ ...inputStyle, minHeight: 46 }}
            />
          </View>

          <TouchableOpacity
            onPress={addMatch}
            disabled={!canAdd || adding}
            style={{ paddingVertical: 13, borderRadius: 12, backgroundColor: !canAdd || adding ? "#334155" : "#16a34a" }}
          >
            <Text style={{ textAlign: "center", color: "#fff", fontWeight: "900", fontSize: 15 }}>
              {adding ? "Ekleniyor..." : "✓ Maçı Ekle"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── MEVCUT MAÇLAR: NOT EKLE/DÜZENLE ── */}
        <Text style={{ color: "#e2e8f0", fontWeight: "900", fontSize: 16, marginTop: 22, marginBottom: 10 }}>
          Maç Notları
        </Text>
        <Text style={{ color: "#64748b", fontSize: 12, marginBottom: 12 }}>
          Nota yazdığın metni tüm kullanıcılar maç kartında görür. Boş bırakıp kaydedince not silinir.
        </Text>

        {loading ? (
          <View style={{ paddingVertical: 30, alignItems: "center" }}><ActivityIndicator color="#475569" /></View>
        ) : fixtures.length === 0 ? (
          <Text style={{ color: "#475569", textAlign: "center", paddingVertical: 24 }}>Kayıtlı maç yok.</Text>
        ) : (
          fixtures.map((fx) => {
            const fid = String(fx.fixtureId);
            const val = notes[fid] ?? "";
            const dirty = (val.trim()) !== String(fx.note || "").trim();
            return (
              <View key={fid} style={{ backgroundColor: "#0f172a", borderRadius: 12, borderWidth: 1, borderColor: fx.note ? "#22c55e44" : "#1e293b", padding: 12, marginBottom: 10, gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#e2e8f0", fontWeight: "800", fontSize: 14 }} numberOfLines={1}>
                      {fx.home ?? "?"} — {fx.away ?? "?"}
                    </Text>
                    <Text style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>
                      {fmtKick(fx)}{fx.league ? ` · ${fx.league}` : ""}{fx.source === "MANUAL" ? " · elle" : ""}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => deleteMatch(fx)} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text style={{ color: "#ef4444", fontSize: 16 }}>🗑</Text>
                  </TouchableOpacity>
                </View>

                <TextInput
                  value={val}
                  onChangeText={(t) => setNotes((m) => ({ ...m, [fid]: t }))}
                  multiline
                  placeholder="Bu maç için not yaz (kullanıcılar görür)…"
                  placeholderTextColor="#475569"
                  style={{ ...inputStyle, minHeight: 42 }}
                />

                <TouchableOpacity
                  onPress={() => saveNote(fx)}
                  disabled={!dirty || savingId === fid}
                  style={{
                    alignSelf: "flex-start", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999,
                    backgroundColor: !dirty || savingId === fid ? "#1e293b" : (val.trim() ? Colors.primary : "#7f1d1d"),
                  }}
                >
                  <Text style={{ color: !dirty ? "#475569" : "#fff", fontWeight: "800", fontSize: 12 }}>
                    {savingId === fid ? "Kaydediliyor..." : val.trim() ? "Notu Kaydet" : "Notu Sil"}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
