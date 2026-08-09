import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { t, useLang } from "../../lib/i18n";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useUserId } from "../../lib/useUserId";
import Colors from "../../constants/colors";
import { getApiBase } from "../../lib/apiBase";
import { apiFetch as sharedApiFetch } from "../../lib/apiFetch";

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
/**
 * ⚠️ YEREL apiFetch KALDIRILDI — paylaşılan olan kullanılıyor.
 *
 * Buradaki kopya ham `fetch` çağırıyordu: ZAMAN AŞIMI ve yeniden deneme
 * politikası yoktu (bkz. lib/fetchPolicy). İstek asıldığında ekran sonsuza
 * kadar spinner gösteriyordu; kullanıcının elinde iptal edecek bir şey de
 * yoktu. Paylaşılan sürüm auth başlıklarını da kendisi ekliyor.
 */
async function apiFetch(path: string, init?: RequestInit) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return sharedApiFetch(p, init as any);
}

export default function KingsScreen() {
  useLang(); // dil değişince ekran yeniden çizilsin
  const router = useRouter();
  const { userId: qUser } = useLocalSearchParams<{ userId?: string }>();

  const userId = useUserId(qUser);

  // SEZON TOTALE
  const [rows, setRows] = useState<Row[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /**
   * Ekranda çizilecek satır sayısı.
   *
   * ⚠️ NEDEN VAR: bu ekran sanallaştırılmamış bir ScrollView içinde
   * `filteredRows.map()` yapıyor. Sezon tablosu 1700 satır döndürüyor
   * (182 KB) ve hepsi TEK SEFERDE çiziliyordu: JS iş parçacığı saniyelerce
   * kilitleniyor, sekme çubuğu dahil arayüz donuyordu. Kullanıcı sekmeye
   * yanlışlıkla dokunduğunda uygulamadan çıkamıyordu.
   * Sıralamada ilk yüz zaten yeterli; gerisi "daha fazla" ile gelir.
   */
  const [gosterilecek, setGosterilecek] = useState(100);

  // Refresh
  const [refreshing, setRefreshing] = useState(false);

  // PROFİLLER
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);

  /**
   * SEZON ETİKETİ — tablo aylık sıfırlanıyor ve bu ekran bunu söylemiyordu.
   *
   * Aynı savunma stats.tsx'te VAR; oradaki not aynen şöyle: "sezon aylık,
   * yani ayın 1'inde tablo SESSİZCE boşalıyor ve kullanıcı ne olduğunu
   * anlamadan bir aylık emeğini kayıp sanıyor". Bu ekranın başlığı da
   * "Sezon Liderleri" ama HANGİ sezon olduğu hiçbir yerde görünmüyordu —
   * sunucu da göndermiyordu (bkz. routes/totals-read.cjs).
   */
  const [sezonEtiket, setSezonEtiket] = useState<string | null>(null);

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
      // ⚠️ Ekran zaten ilk 100'ü gösteriyor ("Daha fazla göster" ile açılıyor)
      // ama sunucu 1707 satırın hepsini yolluyordu (182 KB). `limit` sunucuda
      // SIRALADIKTAN sonra kesiyor, yani aşağıdaki sıra numaraları doğru kalır.
      // 300 seçildi: gösterilen 100'ün üstünde pay bırakır. Ölçüldü: 182 KB → 32 KB.
      const res = await apiFetch(`/api/rt/totals?limit=300`);
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
      setSezonEtiket((j as any)?.seasonLabel || null);
    } catch {
      setRows([]);
      setUpdatedAt(null);
    }
  }, []);

  /**
   * Segment üyeliklerini yükler.
   *
   * ⚠️ ESKİ HÂLİ `/api/users` ÇAĞIRIYORDU — BÖYLE BİR UÇ YOK (404).
   * Hata yakalanıp `profiles` boş bırakılıyor, `filteredRows` de boşken
   * TÜM LİSTEYİ döndürüyordu. Sonuç: kullanıcı "Takımım" sekmesine basıp
   * küresel listeyi görüyor ve onları takımdaşı sanıyordu. Sessizce yanlış.
   *
   * Gerçek uçlar: takım için `/api/team/members`, 1987 için `/api/users/1987`.
   * İkisi de İNDEKSLİ sorgu — "tüm kullanıcıları getir" gibi ölçeklenmeyen
   * bir uç eklemeye gerek yok.
   */
  const loadUsers = useCallback(async () => {
    const uid = userId.trim();
    try {
      // 1) Kendi profilim: takım segmenti için hangi takım olduğunu buradan alırız.
      let benimTakim: string | null = null;
      if (uid) {
        try {
          const r = await apiFetch(`/api/users/profile?userId=${encodeURIComponent(uid)}`);
          const j = await r.json();
          benimTakim = j?.profile?.mainTeam ? String(j.profile.mainTeam).trim() : null;
        } catch (e) { console.warn("[kings] profil yuklenemedi:", e); }
      }

      const toplananlar: UserProfile[] = [];

      // 2) Takım kadrosu
      if (benimTakim) {
        try {
          const r = await apiFetch(`/api/team/members?team=${encodeURIComponent(benimTakim)}`);
          const j = await r.json();
          for (const m of (j?.members ?? [])) {
            const id = String(m?.userId || m?.id || "").trim();
            if (id) toplananlar.push({ userId: id, mainTeam: benimTakim } as UserProfile);
          }
        } catch (e) { console.warn("[kings] takim kadrosu yuklenemedi:", e); }
      }

      // 3) 1987 segmenti
      try {
        const r = await apiFetch(`/api/users/1987`);
        const j = await r.json();
        for (const u of (j?.users ?? j?.items ?? [])) {
          const id = String(u?.userId || "").trim();
          if (id) toplananlar.push({ userId: id, is1987: true } as UserProfile);
        }
      } catch (e) { console.warn("[kings] 1987 segmenti yuklenemedi:", e); }

      // Kendi profilim de listede olsun (takım segmenti için gerekli).
      if (uid && benimTakim) {
        toplananlar.push({ userId: uid, mainTeam: benimTakim } as UserProfile);
      }

      setProfiles(toplananlar);
      setProfilesLoaded(true);
    } catch {
      setProfiles([]);
      setProfilesLoaded(true);
    }
  }, [userId]);

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

    // ⚠️ ESKİDEN BURADA `return rows` VARDI: segment verisi yoksa TÜM liste
    // gösteriliyordu, yani "Takımım" sekmesi küresel sıralamayı takım
    // sıralaması gibi sunuyordu. Boş göstermek yanlış göstermekten iyidir.
    if (!profilesLoaded) return [];
    if (profiles.length === 0) return [];

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
    if (s === "team") return t("myTeamSeg");
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
          <Text style={{ color: Colors.muted, fontSize: 12 }}>{t("back")}</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: "800", color: Colors.slate900 }}>
          {t("seasonLeaders")}
        </Text>
      </View>

      <Text style={{ color: Colors.muted, fontSize: 12, marginBottom: 8 }}>
        {t("byTotalPoints")}
      </Text>

      {/* Hangi sezona bakıldığı ve tablonun sıfırlanacağı görünür olmalı. */}
      {sezonEtiket ? (
        <Text style={{ color: Colors.muted, fontSize: 11, marginBottom: 8 }}>
          {t("seasonOf", { s: sezonEtiket })}
          {" · "}
          {rows.length === 0 ? t("newSeasonReset") : t("seasonResets")}
        </Text>
      ) : null}

      {/* Güncelleme */}
      <View style={{ marginBottom: 12 }}>
        <Text style={{ color: Colors.muted, fontSize: 11 }}>
          {t("currentAt", { d: updatedAt ? formatDate(updatedAt) : "-" })}
        </Text>
      </View>

      {loading && rows.length === 0 ? (
        <View style={{ marginTop: 24, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8, color: Colors.muted, fontSize: 12 }}>
            {t("loading")}
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
            <Text style={{ fontWeight: "700", color: "#e2e8f0" }}>{t("mySeasonGlobal")}</Text>
            {myRowGlobal ? (
              <>
                <Text style={{ color: Colors.muted, fontSize: 12 }}>
                  {t("rankHash", { r: myRowGlobal.rank })}
                </Text>
                <Text style={{ color: Colors.muted, fontSize: 12 }}>
                  {t("totalPts", { n: Math.round(myRowGlobal.totalPoints) })} p
                </Text>
                <Text style={{ color: Colors.muted, fontSize: 12 }}>
                  {t("playedMatches", { n: myRowGlobal.matches })}
                </Text>
                <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 4 }}>
                  {t("lastUpdate", { d: myRowGlobal.lastAt ? formatDate(myRowGlobal.lastAt) : "-" })}
                </Text>
              </>
            ) : (
              <Text style={{ color: Colors.muted, fontSize: 12 }}>
                {t("noSeasonData")}
              </Text>
            )}

            {myMainTeam && (
              <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 6 }}>
                {t("yourMainTeam", { t: myMainTeam })}
              </Text>
            )}

            {/* Global tahmin sayısı */}
            {predCountLoading ? (
              <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 4 }}>
                {t("predCountLoading")}
              </Text>
            ) : predCount !== null ? (
              <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 4 }}>
                {t("predCountInfo", { n: predCount })}
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
                {segment === "team" ? t("myTeamRankT") : t("my1987Rank")}
              </Text>
              {myRowInSegment ? (
                <Text style={{ color: Colors.slate900, fontSize: 12 }}>
                  {t("rankPtsShort", { r: myRowInSegment.rank, p: Math.round(myRowInSegment.totalPoints) })}
                </Text>
              ) : (
                <Text style={{ color: Colors.muted, fontSize: 12 }}>
                  {t("noSegmentRank")}
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
                    {t("cup1987Congrats")}
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
                {segment === "global" ? t("globalSeasonTable") : segment === "team" ? t("teamSeasonTable") : t("gs1987SeasonTable")}
              </Text>
              <Text style={{ color: Colors.muted, fontSize: 10 }}>
                {t("totalPlayers", { n: filteredRows.length })}
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
                    {t("champ1987")}
                  </Text>
                  <Text
                    style={{
                      color: "#dcfce7",
                      fontSize: 12,
                      marginTop: 2,
                    }}
                  >
                    {champion1987.userId} · {Math.round(champion1987.totalPoints)} p ·{" "}
                    {t("nMatches", { n: champion1987.matches })}
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
                {filteredRows.slice(0, gosterilecek).map((row) => {
                  const isMe =
                    row.userId.trim().toLowerCase() === userId.toLowerCase();

                  const approxPts = Math.round(row.totalPoints || 0);
                  // İlk üç madalyayla anılır — sıralama okumadan tanınmalı.
                  const madalya = row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : null;
                  const zeminRengi = isMe
                    ? "#022c22"
                    : row.rank === 1 ? "#f59e0b1a"
                    : row.rank === 2 ? "#94a3b81a"
                    : row.rank === 3 ? "#b4530920"
                    : "#020617";

                  return (
                    <View
                      key={`${row.userId}-${row.rank}`}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingVertical: madalya ? 9 : 6,
                        paddingHorizontal: 8,
                        borderRadius: 8,
                        marginBottom: 4,
                        backgroundColor: zeminRengi,
                        borderWidth: isMe ? 1 : 0,
                        borderColor: isMe ? "#a3e63566" : "transparent",
                      }}
                    >
                      {/* Sıra */}
                      <View style={{ width: madalya ? 36 : 32 }}>
                        {madalya ? (
                          <Text style={{ fontSize: 18 }}>{madalya}</Text>
                        ) : (
                          <Text
                            style={{
                              color: isMe ? "#a7f3d0" : Colors.muted,
                              fontSize: 12,
                              fontWeight: "600",
                            }}
                          >
                            #{row.rank}
                          </Text>
                        )}
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
                          {t("matchPenalty2", { m: row.matches, c: row.totalPenalty ?? 0 })}
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

                {/* Kalan satırlar isteğe bağlı: hepsini birden çizmek arayüzü
                    donduruyordu (bkz. `gosterilecek`). */}
                {filteredRows.length > gosterilecek && (
                  <TouchableOpacity
                    onPress={() => setGosterilecek((n) => n + 100)}
                    style={{
                      marginTop: 10, alignSelf: "center", paddingHorizontal: 18,
                      paddingVertical: 9, borderRadius: 999, backgroundColor: "#1e293b",
                    }}
                  >
                    <Text style={{ color: "#e2e8f0", fontWeight: "700", fontSize: 12.5 }}>
                      {t("showMore", { n: filteredRows.length - gosterilecek })}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <Text style={{ color: Colors.muted, fontSize: 10, marginTop: 8 }}>
              {t("settle2Note")}
            </Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}
