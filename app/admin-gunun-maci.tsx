/**
 * YÖNETİCİ — GÜNÜN MAÇI ÖNİZLEMESİ.
 *
 * Önceki gün 10:00–20:00 sistemin ilk 3 adayı (puan + gerekçe) burada.
 * "Bunu seç" elle seçim kaydeder (gün, maç, kim, ne zaman); "Otomatiğe dön"
 * kaldırır; arama ile o günün başka maçı seçilebilir.
 *
 * ⚠️ KİLİT SUNUCUDA: ilk tahmin geldikten sonra sunucu 409 GUNUN_MACI_KILITLI
 * döner. Buradaki düğmelerin gizlenmesi yalnız kolaylık; asıl kural API'de.
 */

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, RefreshControl } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { apiFetch as sharedApiFetch } from "../lib/apiFetch";
import { withAdminHeaders } from "../lib/adminToken";
import Colors from "../constants/colors";
import { t, useLang } from "../lib/i18n";
import hataMesaji from "../lib/hataMesaji";
import BackBar from "../components/BackBar";

type Mac = { fixtureId: string; home: string; away: string; league?: string | null; kickoffISO: string; puan?: number; gerekce?: string[] };
type Durum = {
  gun: string; asama: "once" | "onizleme" | "yayin"; etkin: Mac | null; kilitli: boolean;
  kayit: null | { adaylar: Mac[]; otomatik: Mac | null; elle: null | { mac: Mac; kim: string; at: string }; kilit: null | { at: string } };
};

async function api(path: string, init?: RequestInit) {
  const headers = await withAdminHeaders({ "Content-Type": "application/json", ...((init?.headers as any) || {}) });
  const r = await sharedApiFetch(path, { ...(init as any), headers });
  return r.json().catch(() => null);
}

const saat = (iso: string) => new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const gunEkle = (gun: string, n: number) => new Date(Date.parse(`${gun}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);

export default function AdminGununMaci() {
  useLang();
  const p = useLocalSearchParams<{ gun?: string }>();
  const [gun, setGun] = useState<string | null>(typeof p.gun === "string" ? p.gun : null);
  const [d, setD] = useState<Durum | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [q, setQ] = useState("");
  const [bulunan, setBulunan] = useState<Mac[]>([]);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    const j = await api(`/api/gunun-maci/admin?gun=${gun || ""}`);
    if (j?.ok) { setD(j); if (!gun) setGun(j.gun); }
    else Alert.alert(t("gmTitle"), hataMesaji(j?.error));
    setYukleniyor(false);
  }, [gun]);
  useEffect(() => { yukle(); }, [yukle]);

  async function sec(fixtureId: string) {
    const j = await api("/api/gunun-maci/admin/sec", { method: "POST", body: JSON.stringify({ gun: d?.gun, fixtureId }) });
    if (!j?.ok) Alert.alert(t("gmTitle"), hataMesaji(j?.error));
    setBulunan([]); setQ("");
    yukle();
  }
  async function otomatik() {
    const j = await api("/api/gunun-maci/admin/otomatik", { method: "POST", body: JSON.stringify({ gun: d?.gun }) });
    if (!j?.ok) Alert.alert(t("gmTitle"), hataMesaji(j?.error));
    yukle();
  }
  async function ara(metin: string) {
    setQ(metin);
    if (metin.trim().length < 2 || !d) { setBulunan([]); return; }
    const j = await api(`/api/gunun-maci/admin/ara?gun=${d.gun}&q=${encodeURIComponent(metin.trim())}`);
    setBulunan(j?.ok ? j.maclar : []);
  }

  const asamaYazi = { once: t("gmAdmOnce"), onizleme: t("gmAdmOnizleme"), yayin: t("gmAdmYayin") };
  const degistirilebilir = !!d && !d.kilitli;
  const Dugme = ({ yazi, onPress }: { yazi: string; onPress: () => void }) => (
    <TouchableOpacity onPress={onPress} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: Colors.headerBlue }}>
      <Text style={{ color: Colors.slate900, fontWeight: "900" }}>{yazi}</Text>
    </TouchableOpacity>
  );
  const Kart = ({ m, sec: secilebilir }: { m: Mac; sec: boolean }) => {
    const etkin = d?.etkin?.fixtureId === m.fixtureId;
    return (
      <View style={{ padding: 12, borderRadius: 12, backgroundColor: "#1e293b", gap: 4, borderWidth: etkin ? 2 : 0, borderColor: Colors.headerBlue }}>
        <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>{m.home} – {m.away}{etkin ? "  ✓" : ""}</Text>
        <Text style={{ color: "#cbd5e1", fontSize: 12 }}>{[m.league, saat(m.kickoffISO)].filter(Boolean).join(" · ")}{m.puan != null ? ` · ${t("gmAdmPuan", { n: m.puan })}` : ""}</Text>
        {!!m.gerekce?.length && <Text style={{ color: "#94a3b8", fontSize: 11 }}>{m.gerekce.join(" · ")}</Text>}
        {secilebilir && !etkin && <View style={{ flexDirection: "row", marginTop: 6 }}><Dugme yazi={t("gmAdmSec")} onPress={() => sec(m.fixtureId)} /></View>}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <BackBar title={t("gmTitle")} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} refreshControl={<RefreshControl refreshing={yukleniyor} onRefresh={yukle} />}>
        {d && (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Dugme yazi="‹" onPress={() => setGun(gunEkle(d.gun, -1))} />
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>{d.gun}</Text>
            <Dugme yazi="›" onPress={() => setGun(gunEkle(d.gun, 1))} />
          </View>
        )}
        {!d ? <ActivityIndicator /> : (
          <>
            <Text style={{ color: "#fde68a", fontWeight: "800" }}>{asamaYazi[d.asama]}</Text>
            {d.kilitli && <Text style={{ color: "#fca5a5", fontWeight: "800" }}>🔒 {t("gmAdmKilitli")}</Text>}
            {d.kayit?.elle && <Text style={{ color: "#cbd5e1" }}>{t("gmAdmElle", { kim: d.kayit.elle.kim, at: saat(d.kayit.elle.at) })}</Text>}

            <Text style={{ color: "#fff", fontWeight: "900", marginTop: 8 }}>{t("gmAdmAdaylar")}</Text>
            {(d.kayit?.adaylar || []).map((m) => <Kart key={m.fixtureId} m={m} sec={degistirilebilir} />)}
            {!d.kayit?.adaylar?.length && <Text style={{ color: "#94a3b8" }}>{t("gmAdmAdayYok")}</Text>}

            {d.kayit?.elle && degistirilebilir && <View style={{ flexDirection: "row" }}><Dugme yazi={t("gmAdmOtomatik")} onPress={otomatik} /></View>}
            {d.kayit?.elle && <><Text style={{ color: "#fff", fontWeight: "900" }}>{t("gmAdmElleSecilen")}</Text><Kart m={d.kayit.elle.mac} sec={false} /></>}

            {degistirilebilir && (
              <>
                <Text style={{ color: "#fff", fontWeight: "900", marginTop: 8 }}>{t("gmAdmAra")}</Text>
                <TextInput value={q} onChangeText={ara} placeholder={t("gmAdmAraYer")} placeholderTextColor="#64748b"
                  style={{ backgroundColor: "#fff", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }} />
                {bulunan.map((m) => <Kart key={m.fixtureId} m={m} sec />)}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
