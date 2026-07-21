import React, { useEffect, useState } from "react";
import {
  View, Text, TouchableOpacity, TextInput, Alert,
  ActivityIndicator, StyleSheet, ScrollView, Share,
} from "react-native";
import QuickPickCard, { PickFixture } from "./QuickPickCard";
import { getApiBase } from "../lib/apiBase";
import { getAuthHeaders } from "../lib/apiFetch";

type Props = {
  country?: string | null;
  userId: string;
  onCreated?: (code: string) => void;
  onClose?: () => void;
};

export default function TournamentCreate({ country, userId, onCreated, onClose }: Props) {
  const [matches, setMatches] = useState<PickFixture[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [entryLC, setEntryLC] = useState("10");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const base = await getApiBase();
        const qs = country ? `?country=${encodeURIComponent(country)}&limit=8` : "?limit=8";
        const r = await fetch(`${base}/api/daily-picks/singles${qs}`);
        const json = await r.json();
        if (!cancelled && json.ok) setMatches(json.picks || []);
      } catch {}
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [country]);

  function toggleMatch(fid: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(fid)) next.delete(fid);
      else if (next.size < 6) next.add(fid);
      else Alert.alert("Maksimum", "En fazla 6 maç seçebilirsin");
      return next;
    });
  }

  async function handleCreate() {
    if (selected.size < 2) return Alert.alert("Minimum", "En az 2 maç seç");
    const entry = Math.max(5, Math.min(100, Number(entryLC) || 10));

    setCreating(true);
    try {
      const base = await getApiBase();
      const authH = await getAuthHeaders();
      const fixtureIds = Array.from(selected);
      const fixtures = matches.filter(m => selected.has(m.fixtureId)).map(m => ({
        fixtureId: m.fixtureId, home: m.home, away: m.away,
        kickoffISO: m.kickoffISO, league: m.league,
      }));

      const r = await fetch(`${base}/api/tournaments/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authH },
        body: JSON.stringify({ name: name || "Turnuva", entryLC: entry, fixtureIds, fixtures }),
      });
      const json = await r.json();
      if (json.ok) {
        setCreatedCode(json.tournament.code);
        onCreated?.(json.tournament.code);
      } else {
        Alert.alert("Hata", json.error || "Oluşturulamadı");
      }
    } catch (e: any) {
      Alert.alert("Hata", e.message);
    }
    setCreating(false);
  }

  async function shareCode() {
    if (!createdCode) return;
    try {
      await Share.share({
        message: `SkorLig turnuvama katıl! Kod: ${createdCode}`,
      });
    } catch {}
  }

  if (createdCode) {
    return (
      <View style={s.container}>
        <Text style={s.title}>🏆 Turnuva Oluşturuldu!</Text>
        <View style={s.codeBox}>
          <Text style={s.codeLabel}>Davet Kodu</Text>
          <Text style={s.code}>{createdCode}</Text>
        </View>
        <Text style={s.hint}>Bu kodu arkadaşlarınla paylaş</Text>
        <TouchableOpacity style={s.shareBtn} onPress={shareCode}>
          <Text style={s.shareBtnText}>Paylaş</Text>
        </TouchableOpacity>
        {onClose && (
          <TouchableOpacity style={s.closeBtn} onPress={onClose}>
            <Text style={s.closeBtnText}>Kapat</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (loading) {
    return (
      <View style={s.loadingBox}>
        <ActivityIndicator color="#a3e635" />
        <Text style={s.loadingText}>Maçlar yükleniyor...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={s.container}>
      <Text style={s.title}>🏆 Turnuva Oluştur</Text>
      <Text style={s.subtitle}>2-6 maç seç, giriş ücreti belirle, arkadaşlarını davet et</Text>

      <View style={s.inputRow}>
        <View style={s.inputGroup}>
          <Text style={s.inputLabel}>İsim</Text>
          <TextInput
            style={s.input}
            placeholder="Turnuva adı"
            placeholderTextColor="#475569"
            value={name}
            onChangeText={setName}
            maxLength={40}
          />
        </View>
        <View style={[s.inputGroup, { flex: 0.4 }]}>
          <Text style={s.inputLabel}>Giriş (LC)</Text>
          <TextInput
            style={s.input}
            placeholder="10"
            placeholderTextColor="#475569"
            value={entryLC}
            onChangeText={setEntryLC}
            keyboardType="number-pad"
            maxLength={3}
          />
        </View>
      </View>

      <Text style={s.matchHeader}>
        Maç Seç ({selected.size}/6)
      </Text>

      {matches.map(m => {
        const isSel = selected.has(m.fixtureId);
        return (
          <TouchableOpacity
            key={m.fixtureId}
            onPress={() => toggleMatch(m.fixtureId)}
            style={[s.matchRow, isSel && s.matchRowSelected]}
          >
            <View style={s.matchCheck}>
              <Text style={{ fontSize: 18 }}>{isSel ? "✅" : "⬜"}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.matchTeams}>{m.home} vs {m.away}</Text>
              <Text style={s.matchMeta}>{m.league} • {m.odds.home.toFixed(2)} / {m.odds.draw.toFixed(2)} / {m.odds.away.toFixed(2)}</Text>
            </View>
          </TouchableOpacity>
        );
      })}

      {matches.length === 0 && (
        <Text style={s.emptyText}>Bugün maç yok</Text>
      )}

      <View style={s.summary}>
        <Text style={s.summaryText}>
          {selected.size} maç seçildi • Giriş: {Math.max(5, Number(entryLC) || 10)} LC
        </Text>
        <Text style={s.payoutHint}>
          1. → %60  •  2. → %25  •  3. → %15
        </Text>
      </View>

      <TouchableOpacity
        style={[s.createBtn, (selected.size < 2 || creating) && s.createBtnDisabled]}
        onPress={handleCreate}
        disabled={selected.size < 2 || creating}
      >
        {creating
          ? <ActivityIndicator color="#000" />
          : <Text style={s.createBtnText}>Turnuvayı Oluştur</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  loadingBox: { padding: 40, alignItems: "center" },
  loadingText: { color: "#64748b", marginTop: 8, fontSize: 12 },
  title: { color: "#f1f5f9", fontSize: 20, fontWeight: "900", marginBottom: 4 },
  subtitle: { color: "#64748b", fontSize: 12, marginBottom: 16 },
  inputRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  inputGroup: { flex: 1 },
  inputLabel: { color: "#94a3b8", fontSize: 11, fontWeight: "700", marginBottom: 4 },
  input: {
    backgroundColor: "#1e293b", borderRadius: 10, paddingHorizontal: 12,
    paddingVertical: 10, color: "#f1f5f9", fontSize: 14, borderWidth: 1, borderColor: "#334155",
  },
  matchHeader: { color: "#a3e635", fontSize: 13, fontWeight: "800", marginBottom: 8 },
  matchRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#0f172a",
    borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: "#1e293b",
  },
  matchRowSelected: { borderColor: "#a3e635" },
  matchCheck: { marginRight: 10 },
  matchTeams: { color: "#f1f5f9", fontWeight: "700", fontSize: 13 },
  matchMeta: { color: "#64748b", fontSize: 10, marginTop: 2 },
  emptyText: { color: "#64748b", fontSize: 13, textAlign: "center", padding: 20 },
  summary: { backgroundColor: "#1e293b", borderRadius: 10, padding: 12, marginTop: 12, marginBottom: 12 },
  summaryText: { color: "#f1f5f9", fontWeight: "700", fontSize: 13 },
  payoutHint: { color: "#fbbf24", fontSize: 11, marginTop: 4 },
  createBtn: {
    backgroundColor: "#a3e635", borderRadius: 12, paddingVertical: 14,
    alignItems: "center", marginBottom: 40,
  },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: { color: "#0f172a", fontWeight: "900", fontSize: 15 },
  codeBox: {
    backgroundColor: "#1e293b", borderRadius: 16, padding: 20,
    alignItems: "center", marginVertical: 20,
  },
  codeLabel: { color: "#64748b", fontSize: 11, marginBottom: 4 },
  code: { color: "#a3e635", fontSize: 36, fontWeight: "900", letterSpacing: 6 },
  hint: { color: "#94a3b8", fontSize: 12, textAlign: "center", marginBottom: 16 },
  shareBtn: {
    backgroundColor: "#3b82f6", borderRadius: 12, paddingVertical: 14,
    alignItems: "center", marginBottom: 10,
  },
  shareBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  closeBtn: { alignItems: "center", paddingVertical: 10 },
  closeBtnText: { color: "#64748b", fontSize: 13 },
});
