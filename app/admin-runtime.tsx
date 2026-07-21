import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import Colors from "../constants/colors";
import { getApiBase } from "../lib/apiBase";
import { getAuthHeaders } from "../lib/apiFetch";
import BackBar from "../components/BackBar";

async function apiFetch(path: string, init?: RequestInit) {
  const base = await getApiBase();
  const authH = await getAuthHeaders();
  const p = path.startsWith("/") ? path : `/${path}`;
  return fetch(`${base}${p}`, { ...init, headers: { ...authH, ...(init?.headers as any) } });
}

type RuntimeMode = {
  profile: string;
  maxTeams?: number | null;
  maxLeagues?: number | null;
  notes?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

export default function AdminRuntimeScreen() {
  const router = useRouter();

  const [mode, setMode] = useState<RuntimeMode | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // form state
  const [profileInput, setProfileInput] = useState("");
  const [maxTeamsInput, setMaxTeamsInput] = useState("");
  const [maxLeaguesInput, setMaxLeaguesInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [updatedByInput, setUpdatedByInput] = useState("mobile-admin");

  const applyModeToForm = useCallback((m: RuntimeMode | null) => {
    if (!m) {
      setProfileInput("");
      setMaxTeamsInput("");
      setMaxLeaguesInput("");
      setNotesInput("");
      return;
    }
    setProfileInput(m.profile || "");
    setMaxTeamsInput(
      typeof m.maxTeams === "number" && !Number.isNaN(m.maxTeams)
        ? String(m.maxTeams)
        : ""
    );
    setMaxLeaguesInput(
      typeof m.maxLeagues === "number" && !Number.isNaN(m.maxLeagues)
        ? String(m.maxLeagues)
        : ""
    );
    setNotesInput(m.notes || "");
  }, []);

  async function fetchMode() {
    try {
      setError(null);
      const r = await apiFetch(`/api/admin/runtime-mode`);
      const j = await r.json();
      if (!j?.ok) {
        throw new Error(j?.error || "RUNTIME_MODE_GET_FAILED");
      }
      const m: RuntimeMode = j.mode || j.data || {};
      setMode(m);
      applyModeToForm(m);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMode();
    setRefreshing(false);
  }, []);

  async function postPatch(body: any) {
    try {
      setSaving(true);
      setError(null);

      const r = await apiFetch(`/api/admin/runtime-mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const j = await r.json();
      if (!j?.ok) {
        throw new Error(j?.error || "RUNTIME_MODE_SET_FAILED");
      }

      const m: RuntimeMode = j.mode || j.data || {};
      setMode(m);
      applyModeToForm(m);
      Alert.alert("SkorLig", "Runtime modu güncellendi ✅");
    } catch (e: any) {
      const msg = String(e?.message || e);
      setError(msg);
      Alert.alert("Hata", msg);
    } finally {
      setSaving(false);
    }
  }

  // Preset butonları
  const applyPreset = async (presetKey: string) => {
    await postPatch({
      preset: presetKey,
      updatedBy: updatedByInput || "mobile-admin",
    });
  };

  // Serbest form kaydet
  const saveCustom = async () => {
    const patch: any = {};

    if (profileInput.trim()) patch.profile = profileInput.trim();
    if (notesInput.trim()) patch.notes = notesInput.trim();

    const mt = Number(maxTeamsInput.trim());
    if (!Number.isNaN(mt) && maxTeamsInput.trim() !== "") {
      patch.maxTeams = mt;
    }

    const ml = Number(maxLeaguesInput.trim());
    if (!Number.isNaN(ml) && maxLeaguesInput.trim() !== "") {
      patch.maxLeagues = ml;
    }

    if (updatedByInput.trim()) {
      patch.updatedBy = updatedByInput.trim();
    }

    if (Object.keys(patch).length === 0) {
      Alert.alert("Uyarı", "Kaydedilecek bir değişiklik bulunamadı.");
      return;
    }

    await postPatch(patch);
  };

  const currentProfile = mode?.profile || "—";
  const currentMaxTeams =
    typeof mode?.maxTeams === "number" ? mode.maxTeams : null;
  const currentMaxLeagues =
    typeof mode?.maxLeagues === "number" ? mode.maxLeagues : null;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <BackBar title="Runtime Modu (Admin)" />
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >

      {/* Loading */}
      {loading && (
        <View style={{ paddingVertical: 24, alignItems: "center" }}>
          <ActivityIndicator />
          <Text style={{ color: Colors.muted, marginTop: 8, fontSize: 12 }}>
            Runtime modu yükleniyor...
          </Text>
        </View>
      )}

      {/* Hata mesajı */}
      {error && !loading && (
        <View
          style={{
            padding: 10,
            borderRadius: 8,
            backgroundColor: "#7f1d1d",
            marginBottom: 12,
          }}
        >
          <Text style={{ color: "#fee2e2", fontSize: 12 }}>Hata: {error}</Text>
        </View>
      )}

      {/* Mevcut durum kartı */}
      {mode && (
        <View
          style={{
            padding: 12,
            borderRadius: 12,
            backgroundColor: "#020617",
            borderWidth: 1,
            borderColor: Colors.border,
            marginBottom: 16,
            gap: 4,
          }}
        >
          <Text style={{ color: "#e5e7eb", fontWeight: "700", marginBottom: 2 }}>
            Aktif runtime modu
          </Text>
          <Text style={{ color: Colors.muted, fontSize: 12 }}>Profil: {currentProfile}</Text>
          <Text style={{ color: Colors.muted, fontSize: 12 }}>
            Maks. takım: {currentMaxTeams ?? "—"}
          </Text>
          <Text style={{ color: Colors.muted, fontSize: 12 }}>
            Maks. lig: {currentMaxLeagues ?? "—"}
          </Text>
          {!!mode.notes && <Text style={{ color: Colors.muted, fontSize: 12 }}>Not: {mode.notes}</Text>}
          {!!mode.updatedAt && <Text style={{ color: Colors.muted, fontSize: 11 }}>Güncelleme: {mode.updatedAt}</Text>}
          {!!mode.updatedBy && <Text style={{ color: Colors.muted, fontSize: 11 }}>Güncelleyen: {mode.updatedBy}</Text>}
        </View>
      )}

      {/* Preset butonları */}
      <View
        style={{
          padding: 12,
          borderRadius: 12,
          backgroundColor: "#0b1120",
          borderWidth: 1,
          borderColor: Colors.border,
          marginBottom: 16,
          gap: 8,
        }}
      >
        <Text style={{ color: "#e5e7eb", fontWeight: "700", marginBottom: 4 }}>
          Hızlı profil geçişi
        </Text>
        <Text style={{ color: Colors.muted, fontSize: 11, marginBottom: 4 }}>
          Sistem ağırlaştığında tek tıkla daha küçük profile geçebil, rahat olduğunda tekrar büyütebil.
        </Text>

        {([
          { key: "DEV_4_TEAMS", label: "4 takımlı geliştirme", desc: "Sadece 4 takım, düşük yük" },
          { key: "TR_30_TEAMS", label: "TR 30 takım modu", desc: "Örnek Türkiye ligi yükü" },
          { key: "GLOBAL_100_TEAMS", label: "Global 100 takım", desc: "Kısıtlı global test" },
          { key: "GLOBAL_456_TEAMS", label: "Global 456 takım", desc: "Tam yük (dikkatli kullan)" },
        ] as const).map((p) => (
          <TouchableOpacity
            key={p.key}
            disabled={saving}
            onPress={() => applyPreset(p.key)}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 10,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: Colors.border,
              backgroundColor:
                currentProfile.toUpperCase() === p.key ? Colors.accent : "transparent",
              marginBottom: 6,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: currentProfile.toUpperCase() === p.key ? "#fff" : "#e5e7eb",
                  fontWeight: "600",
                  fontSize: 13,
                }}
              >
                {p.label}
              </Text>
              <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 2 }}>
                {p.desc}
              </Text>
            </View>
            {saving && <ActivityIndicator style={{ marginLeft: 8 }} size="small" />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Serbest düzenleme formu */}
      <View
        style={{
          padding: 12,
          borderRadius: 12,
          backgroundColor: "#020617",
          borderWidth: 1,
          borderColor: Colors.border,
          marginBottom: 24,
          gap: 8,
        }}
      >
        <Text style={{ color: "#e5e7eb", fontWeight: "700", marginBottom: 4 }}>
          Manuel ayarlar
        </Text>
        <Text style={{ color: Colors.muted, fontSize: 11, marginBottom: 4 }}>
          Boş bıraktığın alanlar değişmeden kalır.
        </Text>

        <Text style={{ color: Colors.muted, fontSize: 11 }}>Profil kodu</Text>
        <TextInput
          value={profileInput}
          onChangeText={setProfileInput}
          placeholder="Örn: DEV_4_TEAMS"
          placeholderTextColor={Colors.muted}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: Colors.border,
            color: "#e5e7eb",
            fontSize: 13,
          }}
          autoCapitalize="characters"
        />

        <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 8 }}>
          Maksimum takım sayısı
        </Text>
        <TextInput
          value={maxTeamsInput}
          onChangeText={setMaxTeamsInput}
          placeholder="Örn: 4, 30, 100, 456"
          placeholderTextColor={Colors.muted}
          keyboardType="numeric"
          style={{
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: Colors.border,
            color: "#e5e7eb",
            fontSize: 13,
          }}
        />

        <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 8 }}>
          Maksimum lig sayısı
        </Text>
        <TextInput
          value={maxLeaguesInput}
          onChangeText={setMaxLeaguesInput}
          placeholder="Örn: 1, 5, 20"
          placeholderTextColor={Colors.muted}
          keyboardType="numeric"
          style={{
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: Colors.border,
            color: "#e5e7eb",
            fontSize: 13,
          }}
        />

        <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 8 }}>Not</Text>
        <TextInput
          value={notesInput}
          onChangeText={setNotesInput}
          placeholder="Örn: Yoğunluk sebebiyle 4 takıma düşürüldü"
          placeholderTextColor={Colors.muted}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: Colors.border,
            color: "#e5e7eb",
            fontSize: 13,
          }}
          multiline
        />

        <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 8 }}>
          Güncelleyen (log için)
        </Text>
        <TextInput
          value={updatedByInput}
          onChangeText={setUpdatedByInput}
          placeholder="Örn: mobile-admin"
          placeholderTextColor={Colors.muted}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: Colors.border,
            color: "#e5e7eb",
            fontSize: 13,
          }}
        />

        <TouchableOpacity
          disabled={saving}
          onPress={saveCustom}
          style={{
            marginTop: 12,
            paddingVertical: 10,
            borderRadius: 999,
            backgroundColor: Colors.accent,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
          }}
        >
          {saving && (
            <ActivityIndicator size="small" style={{ marginRight: 8 }} color="#fff" />
          )}
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>
            Manuel ayarları kaydet
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
    </View>
  );
}
