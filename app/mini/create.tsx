import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Colors from "../../constants/colors";
import { getApiBase } from "../../lib/apiBase";
import { getAuthHeaders } from "../../lib/apiFetch";

const MIN_FIXTURES = 2;
const MAX_FIXTURES = 10;

async function apiFetch(path: string, init?: RequestInit) {
  const base = await getApiBase();
  const authH = await getAuthHeaders();
  const p = path.startsWith("/") ? path : `/${path}`;
  return fetch(`${base}${p}`, { ...init, headers: { ...authH, ...(init?.headers as any) } });
}

type Fx = {
  fixtureId: string | number;
  home?: string | null;
  away?: string | null;
  kickoffISO?: string | null;
  league?: string | null;
  status?: string | null;
};

export default function MiniCreateScreen() {
  const router = useRouter();
  const { userId: qUserId } = useLocalSearchParams<{ userId?: string }>();
  const userId = String(qUserId || "demo1").trim();

  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [fixtures, setFixtures] = useState<Fx[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      // Kullanıcının yereli neyse onu göster (profil ülkesi)
      let country: string | null = null;
      try {
        const p = await apiFetch(`/api/users/profile?userId=${encodeURIComponent(userId)}`).then((x) => x.json());
        country = p?.ok && p.profile?.country ? String(p.profile.country) : null;
      } catch {
        country = null;
      }
      const cq = country ? `&country=${encodeURIComponent(country)}` : "";
      const r = await apiFetch(`/api/live2/schedule?backDays=0&fwdDays=14${cq}`).then((x) => x.json());
      const list: Fx[] = r?.ok && Array.isArray(r.fixtures) ? r.fixtures : [];
      // sadece henüz başlamamış maçlar seçilebilsin
      const upcoming = list.filter((f) => {
        const ko = new Date(f.kickoffISO || 0).getTime();
        return Number.isFinite(ko) && ko > Date.now();
      });
      setFixtures(upcoming);
    } catch {
      setFixtures([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const selCount = selected.size;

  function toggle(fid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fid)) next.delete(fid);
      else if (next.size < MAX_FIXTURES) next.add(fid);
      else Alert.alert("SkorLig", `En fazla ${MAX_FIXTURES} maç seçebilirsin.`);
      return next;
    });
  }

  const canCreate = useMemo(
    () => name.trim().length > 0 && selCount >= MIN_FIXTURES && selCount <= MAX_FIXTURES,
    [name, selCount]
  );

  async function create() {
    if (!canCreate) {
      Alert.alert("SkorLig", `Turnuvaya bir isim ver ve ${MIN_FIXTURES}-${MAX_FIXTURES} maç seç (önerilen: 5).`);
      return;
    }
    try {
      setCreating(true);
      const chosen = fixtures.filter((f) => selected.has(String(f.fixtureId)));
      const r = await apiFetch(`/api/mini/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          name: name.trim(),
          isPublic,
          fixtures: chosen.map((f) => ({
            fixtureId: String(f.fixtureId),
            home: f.home,
            away: f.away,
            kickoffISO: f.kickoffISO,
            league: f.league,
          })),
        }),
      }).then((x) => x.json());

      if (r?.ok && r.tournament) {
        const msg = isPublic
          ? `"${r.tournament.name}" kuruldu! 🎉\n\nHerkese Açık turnuva — "Turnuvalar" listesinde görünecek.\n\nKod: ${r.tournament.code}`
          : `"${r.tournament.name}" kuruldu! 🎉\n\nSadece arkadaşlar — kodu gönder:\n${r.tournament.code}`;
        Alert.alert("SkorLig", msg);
        router.replace({ pathname: "/mini/[id]", params: { id: r.tournament.id, userId } });
      } else {
        Alert.alert("Hata", r?.error || "Turnuva kurulamadı.");
      }
    } catch (e: any) {
      Alert.alert("Hata", String(e?.message || e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 4 }}>
        <Text style={{ color: Colors.muted, fontSize: 12 }}>← Geri</Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 20, fontWeight: "800", color: Colors.slate900 }}>Mini Turnuva Kur</Text>

      <View style={{ padding: 12, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: Colors.border, gap: 10 }}>
        <Text style={{ fontWeight: "700" }}>Turnuva Adı</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="örn: Hafta Sonu Kupası"
          maxLength={60}
          style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }}
        />

        {/* Görünürlük toggle */}
        <Text style={{ fontWeight: "700", marginTop: 4 }}>Görünürlük</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            onPress={() => setIsPublic(false)}
            style={{ flex: 1, padding: 10, borderRadius: 10, borderWidth: 2, borderColor: !isPublic ? "#3b82f6" : Colors.border, backgroundColor: !isPublic ? "#eff6ff" : "#fff", alignItems: "center", gap: 2 }}
          >
            <Text style={{ fontSize: 18 }}>🔒</Text>
            <Text style={{ fontWeight: "700", fontSize: 12, color: !isPublic ? "#1d4ed8" : Colors.muted }}>Sadece Arkadaşlar</Text>
            <Text style={{ fontSize: 10, color: Colors.muted, textAlign: "center" }}>Koda sahip ya da davet edilenler katılır</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setIsPublic(true)}
            style={{ flex: 1, padding: 10, borderRadius: 10, borderWidth: 2, borderColor: isPublic ? "#f59e0b" : Colors.border, backgroundColor: isPublic ? "#fffbeb" : "#fff", alignItems: "center", gap: 2 }}
          >
            <Text style={{ fontSize: 18 }}>🌍</Text>
            <Text style={{ fontWeight: "700", fontSize: 12, color: isPublic ? "#d97706" : Colors.muted }}>Herkese Açık</Text>
            <Text style={{ fontSize: 10, color: Colors.muted, textAlign: "center" }}>Turnuvalar listesinde görünür, max 2000 kişi</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontWeight: "700" }}>Maç Seç</Text>
        <Text style={{ color: selCount >= MIN_FIXTURES ? Colors.live : Colors.muted, fontSize: 12, fontWeight: "700" }}>
          {selCount} / {MAX_FIXTURES} seçildi {selCount >= MIN_FIXTURES ? "✓" : `(en az ${MIN_FIXTURES})`}
        </Text>
      </View>
      <Text style={{ color: Colors.muted, fontSize: 11 }}>
        Önümüzdeki 14 günün maçları. Önerilen turnuva boyutu: 5 maç.
      </Text>

      {loading && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <ActivityIndicator size="small" />
          <Text style={{ color: Colors.muted, fontSize: 12 }}>Maçlar yükleniyor...</Text>
        </View>
      )}
      {!loading && fixtures.length === 0 && (
        <Text style={{ color: Colors.muted, fontSize: 12 }}>
          Önümüzdeki günlerde seçilebilecek maç bulunamadı.
        </Text>
      )}

      {fixtures.map((f) => {
        const fid = String(f.fixtureId);
        const active = selected.has(fid);
        const ko = f.kickoffISO ? new Date(f.kickoffISO) : null;
        return (
          <TouchableOpacity
            key={fid}
            onPress={() => toggle(fid)}
            style={{
              padding: 12,
              borderRadius: 12,
              borderWidth: 2,
              borderColor: active ? Colors.accent : Colors.border,
              backgroundColor: active ? "#0f172a" : "#020617",
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: "#fff", fontWeight: "700", flex: 1 }} numberOfLines={1}>
                {f.home} — {f.away}
              </Text>
              {active && <Text style={{ color: Colors.accent, fontWeight: "900" }}>✓</Text>}
            </View>
            <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 2 }}>
              {f.league || ""}
              {ko ? ` · ${ko.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}
            </Text>
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity
        onPress={create}
        disabled={creating || !canCreate}
        style={{
          padding: 14,
          borderRadius: 12,
          backgroundColor: canCreate ? Colors.accent : Colors.border,
          opacity: creating ? 0.7 : 1,
          marginTop: 4,
          marginBottom: 24,
        }}
      >
        <Text style={{ textAlign: "center", color: "#fff", fontWeight: "800" }}>
          {creating ? "Kuruluyor..." : "Turnuvayı Kur"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
