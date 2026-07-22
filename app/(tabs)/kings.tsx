import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useUserId } from "../../lib/useUserId";
import Colors from "../../constants/colors";
import { getApiBase } from "../../lib/apiBase";
import { getAuthHeaders } from "../../lib/apiFetch";

// ====================
// Backend modelleri
// ====================
type TotalsItem = {
  userId: string;
  totalPoints: number;
  totalPenalty: number;
  matches: number;
  lastAt?: string | null;
};

type TotalsResponse = {
  ok: boolean;
  items?: TotalsItem[];
  updatedAt?: string | null;
};

type Row = TotalsItem & { rank: number };

type UserProfile = {
  userId: string;
  mainTeam?: string | null;
  is1987?: boolean;
};

type UsersResponse = {
  ok: boolean;
  items?: UserProfile[];
  users?: UserProfile[];
};

type SegmentKey = "global" | "team" | "1987";

type PredFlagsResponse = {
  ok: boolean;
  userId: string;
  fixtures?: string[];
  count?: number;
};

function formatDate(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

// Tek kalıp: base'i içeriden alıp çağır
async function apiFetch(path: string, init?: RequestInit) {
  const base = await getApiBase();
  const authH = await getAuthHeaders();
  const p = path.startsWith("/") ? path : `/${path}`;
  return fetch(`${base}${p}`, { ...init, headers: { ...authH, ...(init?.headers as any) } });
}

export default function KingsScreen() {
  const router = useRouter();
  const { userId: qUser } = useLocalSearchParams<{ userId?: string }>();

  const userId = useUserId(qUser);

  // SEZON TOTALE
  const [rows, setRows] = useState<Row[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Refresh
  const [refreshing, setRefreshing] = useState(false);

  // PROFİLLER
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);

  // Segment seçimi
  const [segment, setSegment] = useState<SegmentKey>("global");

  // Tahmin VAR/YOK map'i (şu ekran fixtur bazında çalışmıyor, şimdilik dursun)
  const [hasPredMap, setHasPredMap] = useState<Record<string, boolean>>({});

  // Toplam tahmin sayısı (pred.flags)
  const [predCount, setPredCount] = useState<number | null>(null);
  const [predCountLoading, setPredCountLoading] = useState(false);

  // ================================
  // Backend çağrıları
  // ================================
  const loadTotals = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/rt/totals`);
      const j: TotalsResponse = await res.json();
      if (!j?.ok || !Array.isArray(j.items)) {
        setRows([]);
        setUpdatedAt(null);
        return;
      }

      const sorted = j.items
        .slice()
        .sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0))
        .map((it, idx) => ({
          ...it,
          rank: idx + 1,
        }));

      setRows(sorted);
      setUpdatedAt(j.updatedAt || null);
    } catch {
      setRows([]);
      setUpdatedAt(null);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/users`);
      const j: UsersResponse = await res.json();
      if (!j?.ok) {
        setProfiles([]);
        setProfilesLoaded(true);
        return;
      }
      const arr =
        (Array.isArray(j.items) && j.items) ||
        (Array.isArray(j.users) && j.users) ||
        [];
      setProfiles(arr);
      setProfilesLoaded(true);
    } catch {
      setProfiles([]);
      setProfilesLoaded(true);
    }
  }, []);

  const loadPredCount = useCallback(async () => {
    const uid = userId.trim();
    if (!uid) {
      setPredCount(null);
      return;
    }
    try {
      setPredCountLoading(true);
      const res = await apiFetch(
        `/api/pred/flags?userId=${encodeURIComponent(uid)}`
      );
      const j: PredFlagsResponse = await res.json();
      if (j?.ok) {
        const c =
          typeof j.count === "number"
            ? j.count
            : Array.isArray(j.fixtures)
            ? j.fixtures.length
            : 0;
        setPredCount(c);
      } else {
        setPredCount(null);
      }
    } catch {
      setPredCount(null);
    } finally {
      setPredCountLoading(false);
    }
  }, [userId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadTotals(), loadUsers(), loadPredCount()]);
    } finally {
      setLoading(false);
    }
  }, [loadTotals, loadUsers, loadPredCount]);

  // =======================================
  // Tahmin VAR/YOK bilgisi: hasPredMap
  // =======================================
  async function loadHasPredForAllVisibleMatches() {
    try {
      const fxList = rows.map((r) => r.userId); // row.userId değil, fixture yok
      // Kings ekranında fixture yok → maç bazında tahmin var/yok gösterimi yok.
      // Live listesinde gösterdik. Kings'te yalnızca kullanıcı sezon puanı var.
      void fxList;
      void hasPredMap;
      void setHasPredMap;
      return;
    } catch {
      return;
    }
  }

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    loadHasPredForAllVisibleMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // ================================
  // Segment & profil ilişkileri
  // ================================
  const myProfile = useMemo(() => {
    const uid = userId.toLowerCase();
    return (
      profiles.find((u) => String(u.userId || "").toLowerCase() === uid) ||
      null
    );
  }, [profiles, userId]);

  const myMainTeam = useMemo(
    () => (myProfile?.mainTeam ? String(myProfile.mainTeam).trim() : null),
    [myProfile]
  );

  const myRowGlobal = useMemo(
    () =>
      rows.find((r) => r.userId.trim().toLowerCase() === userId.toLowerCase()) ||
      null,
    [rows, userId]
  );

  const filteredRows = useMemo(() => {
    if (segment === "global") return rows;

    if (!profilesLoaded || profiles.length === 0) {
      return rows;
    }

    if (segment === "team") {
      if (!myMainTeam) return [];
      const key = myMainTeam.toLowerCase();
      const ids = new Set(
        profiles
          .filter((u) => String(u.mainTeam || "").toLowerCase() === key)
          .map((u) => u.userId)
      );
      const teamRows = rows.filter((r) => ids.has(r.userId));
      return teamRows.map((r, idx) => ({ ...r, rank: idx + 1 }));
    }

    if (segment === "1987") {
      const ids = new Set(
        profiles.filter((u) => u.is1987).map((u) => u.userId)
      );
      const segRows = rows.filter((r) => ids.has(r.userId));
      return segRows.map((r, idx) => ({ ...r, rank: idx + 1 }));
    }

    return rows;
  }, [rows, segment, profiles, profilesLoaded, myMainTeam]);

  const myRowInSegment = useMemo(
    () =>
      filteredRows.find(
        (r) => r.userId.trim().toLowerCase() === userId.toLowerCase()
      ) || null,
    [filteredRows, userId]
  );

  const champion1987 = useMemo(() => {
    if (segment !== "1987") return null;
    if (filteredRows.length === 0) return null;
    return filteredRows[0];
  }, [segment, filteredRows]);

  const segmentLabel = (s: SegmentKey) => {
    if (s === "global") return "Global";
    if (s === "team") return "Benim Takımım";
    return "1987GS";
  };

  const segmentDisabled = useMemo(() => {
    if (!profilesLoaded || profiles.length === 0) {
      return {
        global: false,
        team: true,
        1987: true,
      } as Record<SegmentKey, boolean>;
    }
    return {
      global: false,
      team: !myMainTeam,
      1987: !profiles.some((u) => u.is1987),
    };
  }, [profilesLoaded, profiles, myMainTeam]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  // ================================
  // RENDER
  // ================================
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Başlık */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: Colors.border,
            marginRight: 8,
          }}
        >
          <Text style={{ color: Colors.muted, fontSize: 12 }}>← Geri</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: "800", color: Colors.slate900 }}>
          Sezon Liderleri
        </Text>
      </View>

      <Text style={{ color: Colors.muted, fontSize: 12, marginBottom: 8 }}>
        Toplam puanlara göre sıralama.
      </Text>

      {/* Güncelleme */}
      <View style={{ marginBottom: 12 }}>
        <Text style={{ color: Colors.muted, fontSize: 11 }}>
          Güncel: {updatedAt ? formatDate(updatedAt) : "-"}
        </Text>
      </View>

      {loading && rows.length === 0 ? (
        <View style={{ marginTop: 24, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8, color: Colors.muted, fontSize: 12 }}>
            Yükleniyor...
          </Text>
        </View>
      ) : (
        <>
          {/* Benim sezon durumum */}
          <View
            style={{
              padding: 12,
              backgroundColor: "#0f172a",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: Colors.border,
              marginBottom: 12,
              gap: 6,
            }}
          >
            <Text style={{ fontWeight: "700", color: "#e2e8f0" }}>Benim sezon durumum (global)</Text>
            {myRowGlobal ? (
              <>
                <Text style={{ color: Colors.muted, fontSize: 12 }}>
                  Sıra: #{myRowGlobal.rank}
                </Text>
                <Text style={{ color: Colors.muted, fontSize: 12 }}>
                  Toplam puan: {Math.round(myRowGlobal.totalPoints)} p
                </Text>
                <Text style={{ color: Colors.muted, fontSize: 12 }}>
                  Oynanan maç: {myRowGlobal.matches}
                </Text>
                <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 4 }}>
                  Son güncelleme:{" "}
                  {myRowGlobal.lastAt ? formatDate(myRowGlobal.lastAt) : "-"}
                </Text>
              </>
            ) : (
              <Text style={{ color: Colors.muted, fontSize: 12 }}>
                Bu kullanıcı için sezon verisi yok.
              </Text>
            )}

            {myMainTeam && (
              <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 6 }}>
                Ana takımın: {myMainTeam}
              </Text>
            )}

            {/* Global tahmin sayısı */}
            {predCountLoading ? (
              <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 4 }}>
                Tahmin yaptığın maç sayısı yükleniyor...
              </Text>
            ) : predCount !== null ? (
              <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 4 }}>
                Toplam tahmin yaptığın maç sayısı: {predCount}
              </Text>
            ) : null}
          </View>

          {/* Segment seçici */}
          <View
            style={{
              padding: 8,
              backgroundColor: "#0f172a",
              borderRadius: 999,
              borderWidth: 1,
              borderColor: Colors.border,
              marginBottom: 12,
              flexDirection: "row",
              gap: 6,
            }}
          >
            {(["global", "team", "1987"] as SegmentKey[]).map((s) => {
              const active = segment === s;
              const disabled = segmentDisabled[s];
              return (
                <TouchableOpacity
                  key={s}
                  onPress={() => !disabled && setSegment(s)}
                  disabled={disabled}
                  style={{
                    flex: 1,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: active ? Colors.primary : "#f1f5f9",
                    opacity: disabled ? 0.4 : 1,
                  }}
                >
                  <Text
                    style={{
                      textAlign: "center",
                      fontSize: 11,
                      fontWeight: active ? "700" : "500",
                      color: active ? "#fff" : Colors.slate900,
                    }}
                  >
                    {segmentLabel(s)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Seçili segmentte benim pozisyonum */}
          {segment !== "global" && (
            <View
              style={{
                padding: 10,
                backgroundColor: "#e0f2fe",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#bae6fd",
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  fontWeight: "700",
                  color: Colors.slate900,
                  marginBottom: 4,
                  fontSize: 13,
                }}
              >
                {segment === "team"
                  ? "Benim takım içi sıram"
                  : "1987GS içindeki sıram"}
              </Text>
              {myRowInSegment ? (
                <Text style={{ color: Colors.slate900, fontSize: 12 }}>
                  Sıra: #{myRowInSegment.rank} · Puan:{" "}
                  {Math.round(myRowInSegment.totalPoints)} p
                </Text>
              ) : (
                <Text style={{ color: Colors.muted, fontSize: 12 }}>
                  Bu segmentte (henüz) sıralaman yok.
                </Text>
              )}

              {segment === "1987" &&
                myRowInSegment &&
                myRowInSegment.rank === 1 && (
                  <Text
                    style={{
                      color: "#b91c1c",
                      fontSize: 11,
                      marginTop: 6,
                      fontWeight: "700",
                    }}
                  >
                    🏆 Tebrikler! 1987GS sezon kupası sende.
                  </Text>
                )}
            </View>
          )}

          {/* Ana tablo */}
          <View
            style={{
              padding: 12,
              backgroundColor: "#020617",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: Colors.border,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
                {segment === "global"
                  ? "Global sezon tablosu"
                  : segment === "team"
                  ? "Takım içi sezon tablosu"
                  : "1987GS sezon tablosu"}
              </Text>
              <Text style={{ color: Colors.muted, fontSize: 10 }}>
                Toplam oyuncu: {filteredRows.length}
              </Text>
            </View>

            {/* 1987 kupa kartı */}
            {segment === "1987" && champion1987 && (
              <View
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 10,
                  borderRadius: 12,
                  backgroundColor: "#022c22",
                  borderWidth: 1,
                  borderColor: "#16a34a",
                  marginBottom: 10,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <View style={{ width: 40, alignItems: "center" }}>
                  <Text style={{ fontSize: 24 }}>🏆</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: "#bbf7d0",
                      fontWeight: "800",
                      fontSize: 14,
                    }}
                  >
                    1987GS Şampiyonu
                  </Text>
                  <Text
                    style={{
                      color: "#dcfce7",
                      fontSize: 12,
                      marginTop: 2,
                    }}
                  >
                    {champion1987.userId} · {Math.round(champion1987.totalPoints)} p ·{" "}
                    {champion1987.matches} maç
                  </Text>
                </View>
              </View>
            )}

            {/* Tablo içi satırlar */}
            {filteredRows.length === 0 ? (
              <Text style={{ color: Colors.muted, fontSize: 12, marginTop: 4 }}>
                Bu segmentte veri yok.
              </Text>
            ) : (
              <View style={{ marginTop: 4 }}>
                {filteredRows.map((row) => {
                  const isMe =
                    row.userId.trim().toLowerCase() === userId.toLowerCase();

                  const approxPts = Math.round(row.totalPoints || 0);

                  return (
                    <View
                      key={`${row.userId}-${row.rank}`}
                      style={{
                        flexDirection: "row",
                        paddingVertical: 6,
                        paddingHorizontal: 8,
                        borderRadius: 8,
                        marginBottom: 4,
                        backgroundColor: isMe ? "#022c22" : "#020617",
                      }}
                    >
                      {/* Sıra */}
                      <View style={{ width: 32 }}>
                        <Text
                          style={{
                            color: isMe ? "#a7f3d0" : Colors.muted,
                            fontSize: 12,
                            fontWeight: "600",
                          }}
                        >
                          #{row.rank}
                        </Text>
                      </View>

                      {/* Kullanıcı adı */}
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            color: "#fff",
                            fontWeight: isMe ? "800" : "600",
                            fontSize: 13,
                          }}
                        >
                          {row.userId}
                          {isMe ? " (ben)" : ""}
                        </Text>

                        <Text
                          style={{
                            color: Colors.muted,
                            fontSize: 10,
                            marginTop: 2,
                          }}
                        >
                          Maç: {row.matches} · Ceza {row.totalPenalty ?? 0}
                        </Text>
                      </View>

                      {/* Puan */}
                      <View style={{ minWidth: 70, alignItems: "flex-end" }}>
                        <Text
                          style={{
                            color: "#a3e635",
                            fontWeight: "700",
                            fontSize: 13,
                          }}
                        >
                          {approxPts} p
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            <Text style={{ color: Colors.muted, fontSize: 10, marginTop: 8 }}>
              Bu tablo, tüm maçlar için settle2 üzerinden hesaplanan sezon puanlarını gösterir.
            </Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}
