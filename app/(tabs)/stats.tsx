import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { hataMesaji } from "../../lib/hataMesaji";
import { useUserId } from "../../lib/useUserId";
import Colors from "../../constants/colors";
import { useRuntimeConfig } from "../../lib/runtimeConfig";
import { getApiBase } from "../../lib/apiBase";
import { getAuthHeaders, apiFetch as sharedApiFetch } from "../../lib/apiFetch";
import { withAdminHeaders } from "../../lib/adminToken";

const DEFAULT_COMPETITION_ID = process.env.EXPO_PUBLIC_DEFAULT_COMPETITION_ID || "";

type TotRow = {
  userId: string;
  totalPoints: number;
  totalPenalty: number;
  matches: number;
  /** Sıralama anahtarı: güven ağırlıklı maç-başı ortalama (API: rating) */
  rating?: number;
  /** Ham maç-başı ortalama (API: avg) */
  avg?: number;
  /**
   * Nitelik eşiğini geçti mi (API: qualified). Eşiğin altındaki oyuncunun
   * rating'i havuz ortalamasını AŞAMAZ — tek şanslı maç zirveye çıkmasın diye.
   * Oyuncu listeden düşmez, yalnızca tavanlanır.
   */
  qualified?: boolean;
  /** Eşik değeri (API: minPlayed) — "N maç daha" mesajı için. */
  minPlayed?: number;
  lastAt?: string;
};

type TeamRankRow = {
  userId: string;
  total: number;
  flag?: string | null;
  team?: string | null;
};

type MeStats = {
  ok: boolean;
  favTeam?: string | null;
  team?:
    | {
        team: string;
        rank: number | null;
        count: number;
        myTeamTotal: number | null;
      }
    | null;
  totalPoints?: number;
  played?: number;
  form?: number[];
};

type CupRow = {
  userId: string;
  totalPoints: number;
  matches: number;
  totalPenalty: number;
};

type CupMeta = {
  competitionId: string;
  name?: string | null;
  shortName?: string | null;
};

type ViewKey = "genel" | "fav" | "me";
type ScopeKey = "country" | "global";
type ModeKey = "global" | "cup" | "kupon";

// Tek kalıp: base’i içeriden alıp çağır
/**
 * Paylasilan apiFetch'e delege eder.
 *
 * ⚠️ BURADA HAM `fetch` VARDI: zaman asimi ve yeniden deneme politikasi yoktu
 * (bkz. lib/fetchPolicy). Istek asildiginda ekran sonsuza kadar spinner
 * gosteriyor, kullanicinin iptal edecek bir seyi olmuyordu — "kings"
 * sekmesinde tam olarak bu yasandi. Ayni kopya 29 dosyada vardi.
 * Paylasilan surum auth basliklarini da kendisi ekliyor.
 */
async function apiFetch(path: string, init?: RequestInit) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return sharedApiFetch(p, init as any);
}

export default function StatsScreen() {
  const router = useRouter();
  const { userId: qUser } = useLocalSearchParams<{ userId?: string }>();
  const userId = useUserId(qUser);

  // ✅ useRuntimeConfig ile uyumlu destructure
  const {
    loading: cfgLoading,
    error: cfgError,
    runtimeMode,
    features,
  } = useRuntimeConfig();

  function mapProfileLabel(profile?: string | null) {
    const p = String(profile || "").toUpperCase();
    if (p === "DEV_4_TEAMS") return "4 takımlı geliştirme modu";
    if (p === "TR_30_TEAMS") return "Türkiye ligi testi (≈30 takım)";
    if (p === "GLOBAL_100_TEAMS") return "Kısıtlı global test modu (≈100 takım)";
    if (p === "GLOBAL_456_TEAMS") return "Tam global yüksek yük modu";
    return p ? `Custom: ${p}` : null;
  }

  // 🔹 Shadow runtime (POST sonrası badge'in anında güncellenmesi için)
  const [runtimeShadow, setRuntimeShadow] = useState<any | null>(null);

  async function refreshRuntimeShadow() {
    try {
      const r = await apiFetch(`/api/config`);
      const j = await r.json();
      if (j?.ok) {
        setRuntimeShadow(j.runtimeMode || null);
      }
    } catch {
      // sessiz geç
    }
  }

  const [mode, setMode] = useState<ModeKey>("global");

  /**
   * HAFTALIK KUPON kümülatif sıralaması.
   * ⚠️ Ayrı bir tablo: kupon puanları sezon toplamına da işleniyor ama oyuncu
   * "kuponlarda nasılım" sorusunu ayrıca sorabilmeli.
   */
  type KuponSira = {
    sira: number; userId: string; toplamPuan: number; kuponSayisi: number;
    toplamDogru: number; toplamMac: number; isabetYuzde: number;
    tamKupon: number; toplamOdul: number;
  };
  const [kuponSira, setKuponSira] = useState<KuponSira[]>([]);
  const [kuponYukleniyor, setKuponYukleniyor] = useState(false);
  const [view, setView] = useState<ViewKey>("genel");

  const [totalsRows, setTotalsRows] = useState<TotRow[]>([]);
  const [updatedAtTotals, setUpdatedAtTotals] = useState<string | null>(null);

  // Sıralama kapsamı: kendi ülken mi, tüm dünya mı.
  // Varsayılan "country" — oyuncu önce kendi ülkesinde yarıştığını görmeli;
  // küresel liste 1280 botla birlikte ilk açılışta ulaşılmaz görünüyor.
  const [scope, setScope] = useState<ScopeKey>("country");
  const [myCountry, setMyCountry] = useState<string | null>(null);
  // Sunucu ülkeyi çözemediyse (kullanıcı henüz ülke seçmemiş) küresele düşer;
  // sekmede bunu göstermek yerine sessizce küresel aktif görünsün.
  const [scopeFellBack, setScopeFellBack] = useState(false);
  // Sezon gezinmesi (bkz. loadTotals): aylık sezonda ay başında tablo sıfırlanır.
  const [sezon, setSezon] = useState<string | null>(null);
  const [sezonEtiket, setSezonEtiket] = useState<string | null>(null);
  const [guncelSezonMu, setGuncelSezonMu] = useState(true);
  const [oncekiSezon, setOncekiSezon] = useState<string | null>(null);
  const [arsivKisitli, setArsivKisitli] = useState(false);
  const [bakilanSezon, setBakilanSezon] = useState<string | null>(null);
  /**
   * "Sadece gerçek oyuncular" süzgeci.
   *
   * ⚠️ NEDEN VAR: tabloda 1672 bot, 1 gerçek oyuncu var. Yeni gelen ~1600.
   * sırada başlıyor ve kiminle yarıştığını bilmiyor — bu kadar demoralize
   * edici bir açılış az. Botlar maç doldurmak için var, sıralamada rakip
   * olmak için değil. API `?humans=1` ve `botCount`/`humanCount` döndürüyordu
   * ama arayüz kullanmıyordu.
   */
  const [humansOnly, setHumansOnly] = useState(false);
  const [botCount, setBotCount] = useState(0);
  const [humanCount, setHumanCount] = useState(0);

  const [teamRanks, setTeamRanks] = useState<TeamRankRow[]>([]);
  /**
   * ⚠️ ESKİDEN "Galatasaray" SABİTİYLE BAŞLIYORDU. Sunucu `/api/stats/me`
   * içinde takımı doldurmadığı sürece (uzun süre `favTeam: null` sabitiydi)
   * HERKESE Galatasaray gösteriliyordu — Fenerbahçeli kullanıcı kendi
   * ekranında "Ana takım: Galatasaray" görüyordu.
   *
   * Artık boş başlıyor: takım `meStats.favTeam`'den geliyor. Takımı olmayan
   * kullanıcıda boş kalır ve `loadTeamRanks` erken döner — yanlış takımın
   * sıralamasını çekmektense hiç çekmemek doğru.
   */
  const [teamName, setTeamName] = useState<string>("");
  const [updatedAtTeam, setUpdatedAtTeam] = useState<string | null>(null);

  const [meStats, setMeStats] = useState<MeStats | null>(null);

  // Kupa (competition) tarafı
  const [cupRows, setCupRows] = useState<CupRow[]>([]);
  const [cupMeta, setCupMeta] = useState<CupMeta | null>(null);
  const [cupUpdatedAt, setCupUpdatedAt] = useState<string | null>(null);
  const [cupError, setCupError] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);

  // 🔐 Admin runtime modal state
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminProfile, setAdminProfile] = useState<string>(
    () => (runtimeMode?.profile as string) || "DEV_4_TEAMS"
  );
  const [adminMaxTeams, setAdminMaxTeams] = useState<string>(
    runtimeMode?.maxTeams != null ? String(runtimeMode.maxTeams) : ""
  );
  const [adminMaxLeagues, setAdminMaxLeagues] = useState<string>(
    runtimeMode?.maxLeagues != null ? String(runtimeMode.maxLeagues) : ""
  );
  const [adminNotes, setAdminNotes] = useState<string>(runtimeMode?.notes || "");
  const [adminSaving, setAdminSaving] = useState(false);

  // runtimeMode güncellenince modal formunu senkron tut

  // Kupon sıralaması: yalnızca o sekmeye geçilince çekilir (gereksiz istek yok).
  useEffect(() => {
    if (mode !== "kupon") return;
    let iptal = false;
    (async () => {
      setKuponYukleniyor(true);
      try {
        const r = await apiFetch("/api/kupon/siralama?limit=100");
        const j = await r.json();
        if (!iptal) setKuponSira(j?.ok && Array.isArray(j.siralama) ? j.siralama : []);
      } catch {
        if (!iptal) setKuponSira([]);
      } finally {
        if (!iptal) setKuponYukleniyor(false);
      }
    })();
    return () => { iptal = true; };
  }, [mode]);

  useEffect(() => {
    if (!runtimeMode) return;
    setAdminProfile((runtimeMode.profile as string) || "DEV_4_TEAMS");
    setAdminMaxTeams(runtimeMode.maxTeams != null ? String(runtimeMode.maxTeams) : "");
    setAdminMaxLeagues(runtimeMode.maxLeagues != null ? String(runtimeMode.maxLeagues) : "");
    setAdminNotes(runtimeMode.notes || "");
  }, [runtimeMode]);

  // Arkadaşlık isteği gönder (satıra tıklayınca)
  async function sendFriendRequest(targetUserId: string) {
    if (!targetUserId) return;
    if (targetUserId.toLowerCase() === userId.toLowerCase()) return;

    Alert.alert("Arkadaşlık isteği", `${targetUserId} kullanıcısına arkadaşlık isteği gönderilsin mi?`, [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Gönder",
        onPress: async () => {
          try {
            const r = await apiFetch(`/api/friends/request`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fromUserId: userId, toUserId: targetUserId }),
            });
            const j = await r.json();
            if (j?.ok) Alert.alert("SkorLig", "Arkadaşlık isteği gönderildi ✅");
            else Alert.alert("Hata", hataMesaji(j?.error));
          } catch (e: any) {
            Alert.alert("Hata", String(e?.message || e));
          }
        },
      },
    ]);
  }

  // Global sezon – mevcut Me istatistiği
  async function loadMeStats() {
    try {
      const r = await apiFetch(`/api/stats/me?userId=${encodeURIComponent(userId)}`);
      const j = (await r.json()) as MeStats;
      if (j && j.ok) {
        setMeStats(j);
        const t = (j.favTeam && j.favTeam.trim()) || (j.team && j.team.team) || "Galatasaray";
        setTeamName(t);
      }
    } catch {
      // me gelmese de leaderboard çalışır
    }
  }

  // Global sezon – leaderboard: /api/leaderboard
  /**
   * ⚠️ SINIR PARAMETRE OLARAK GEÇİLİYOR, DURUMDAN OKUNMUYOR.
   *
   * `setIstenenSinir(...)` eşzamansız; hemen ardından `loadTotals()` çağırmak
   * ESKİ sınırı okurdu ve "Daha fazla göster" sessizce aynı kısa listeyi
   * getirirdi. Bu tuzağa yazarken düştüm, ölçüm değil okuma yakaladı.
   */
  async function loadTotals(
    nextScope: ScopeKey = scope,
    sadeceInsan = humansOnly,
    sinir: number = istenenSinir
  ) {
    try {
      const parcalar: string[] = [];
      if (nextScope === "country") {
        parcalar.push("scope=country", `userId=${encodeURIComponent(userId)}`);
      }
      if (sadeceInsan) parcalar.push("humans=1");
      // Kullanıcı geçmiş sezona baktıysa onu iste; boşsa sunucu güncel sezonu döner.
      if (bakilanSezon) {
        parcalar.push(`season=${encodeURIComponent(bakilanSezon)}`);
        if (userId) parcalar.push(`userId=${encodeURIComponent(userId)}`);
      }
      parcalar.push(`limit=${sinir}`);
      const q = parcalar.length ? `?${parcalar.join("&")}` : "";
      const r = await apiFetch(`/api/leaderboard${q}`);
      const j = await r.json();

      // Sunucu hangi kapsamı uyguladığını söyler; ülke bilinmiyorsa küresele düşmüştür.
      setMyCountry(j?.scope?.country || null);
      setScopeFellBack(j?.scope?.fellBackReason === "COUNTRY_UNKNOWN");
      setBotCount(Number(j?.scope?.botCount || 0));
      setHumanCount(Number(j?.scope?.humanCount || 0));
      // ⚠️ SEZON BİLGİSİ. Sunucu bunları hep gönderiyordu ama istemci hiç
      // okumuyordu: sezon aylık, yani ayın 1'inde tablo SESSİZCE boşalıyor ve
      // kullanıcı ne olduğunu anlamadan bir aylık emeğini kayıp sanıyor.
      setSezon(j?.scope?.season || null);
      setSezonEtiket(j?.scope?.seasonLabel || null);
      setGuncelSezonMu(j?.scope?.isCurrentSeason !== false);
      setOncekiSezon(j?.scope?.previousSeason || null);
      setArsivKisitli(!!j?.scope?.archiveLimited);

      if (j?.ok && Array.isArray(j.leaderboard)) {
        const rows: TotRow[] = (j.leaderboard as any[]).map((t: any) => {
          const totalPoints = Number(t.total ?? t.totalPoints ?? 0);
          const matches = Number(t.played ?? t.matches ?? 0);
          const penalties = Number(t.penalties ?? t.totalPenalty ?? 0);
          return {
            userId: String(t.userId || t.userIdLower || "-"),
            totalPoints,
            totalPenalty: penalties,
            matches,
            rating: t.rating != null ? Number(t.rating) : undefined,
            avg: t.avg != null ? Number(t.avg) : undefined,
            // ⚠️ Bu iki alan eşlemede DÜŞÜYORDU: sunucu gönderiyor, tip tanımı
            // vardı, satır bileşeni okuyordu — ama buraya kopyalanmadığı için
            // "Sıralamaya girmek için N maç daha" hiç görünmüyordu.
            qualified: typeof t.qualified === "boolean" ? t.qualified : undefined,
            minPlayed: t.minPlayed != null ? Number(t.minPlayed) : undefined,
            lastAt: t.lastAt || t.updatedAt || undefined,
          };
        });
        setTotalsRows(rows);
        setUpdatedAtTotals(j.updatedAt || null);
      } else {
        setTotalsRows([]);
        setUpdatedAtTotals(null);
      }
    } catch {
      setTotalsRows([]);
      setUpdatedAtTotals(null);
    }
  }

  // Global – takım bazlı sıralama
  async function loadTeamRanks(currentTeam: string) {
    const team = String(currentTeam || "").trim();
    if (!team) {
      setTeamRanks([]);
      setUpdatedAtTeam(null);
      return;
    }
    try {
      const r = await apiFetch(`/api/stats/team-ranks?team=${encodeURIComponent(team)}`);
      const j = await r.json();
      if (j?.ok && Array.isArray(j.items)) {
        setTeamRanks(j.items as TeamRankRow[]);
        setUpdatedAtTeam(new Date().toISOString());
      } else {
        setTeamRanks([]);
        setUpdatedAtTeam(null);
      }
    } catch {
      setTeamRanks([]);
      setUpdatedAtTeam(null);
    }
  }

  // Kupa – competition_totals
  async function loadCompetitionTotals() {
    const compId = DEFAULT_COMPETITION_ID.trim();
    if (!compId) {
      setCupRows([]);
      setCupMeta(null);
      setCupUpdatedAt(null);
      setCupError("Seçilmiş kupa için competitionId yapılandırılmamış.");
      return;
    }

    try {
      const r = await apiFetch(`/api/rt/competition-totals?competitionId=${encodeURIComponent(compId)}`);
      const j = await r.json();

      if (j?.ok && Array.isArray(j.items)) {
        const rows: CupRow[] = (j.items as any[]).map((it: any) => {
          const totalPoints = Number(it.totalPoints ?? it.total ?? 0);
          const matches = Number(it.matches ?? it.played ?? 0);
          const totalPenalty = Number(it.totalPenalty ?? it.penalties ?? 0);
          return { userId: String(it.userId || it.userIdLower || "-"), totalPoints, matches, totalPenalty };
        });

        rows.sort((a, b) => b.totalPoints - a.totalPoints);

        setCupRows(rows);
        setCupMeta({
          competitionId: String(j.competitionId || compId),
          name: j.meta?.name ?? j.name ?? null,
          shortName: j.meta?.shortName ?? j.shortName ?? null,
        });
        setCupUpdatedAt(j.updatedAt || null);
        setCupError(null);
      } else {
        setCupRows([]);
        setCupMeta({
          competitionId: String(j?.competitionId || compId),
          name: j?.meta?.name ?? j?.name ?? null,
          shortName: j?.meta?.shortName ?? j?.shortName ?? null,
        });
        setCupUpdatedAt(j?.updatedAt || null);
        setCupError(j?.error || "COMPETITION_TOTALS_FAILED");
      }
    } catch (e: any) {
      setCupRows([]);
      setCupMeta(null);
      setCupUpdatedAt(null);
      setCupError(String(e?.message || e));
    }
  }

  async function loadAll() {
    await loadMeStats();
    await loadTotals();
    await loadTeamRanks(teamName);
    await loadCompetitionTotals();
  }

  useEffect(() => {
    loadAll();
    refreshRuntimeShadow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // meStats güncellendikçe takım bazlı sıralamayı güncelle
  useEffect(() => {
    if (meStats) {
      const t = (meStats.favTeam && meStats.favTeam.trim()) || (meStats.team && meStats.team.team) || teamName;
      if (t && t !== teamName) {
        setTeamName(t);
        loadTeamRanks(t);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meStats]);

  /**
   * Ekranda çizilecek satır sayısı.
   *
   * ⚠️ NEDEN VAR: bu ekran sanallaştırılmamış bir ScrollView içinde
   * `genelRows.map()` yapıyor ve sezon tablosu 1700 satır döndürüyor. Hepsini
   * tek render'da çizmek JS iş parçacığını kilitliyor; "kings" sekmesinde
   * kullanıcı bu yüzden ekrandan çıkamadı. Aynı desen burada da vardı.
   */
  const [gosterilecek, setGosterilecek] = useState(100);
  /**
   * ⚠️ SUNUCUDAN NE KADAR SATIR İSTENDİĞİ.
   *
   * Uç eskiden TÜM tabloyu gönderiyordu: ölçüldü (2026-08-02, canlı) 1575
   * satır, 256 KB, 660 ms — ekran bunun ilk 100'ünü çiziyordu, yani 16 katı
   * veri. Çizim tarafındaki donma zaten düzeltilmişti (`gosterilecek`), ağ
   * tarafı kalmıştı.
   *
   * Sunucu artık `limit` kabul ediyor. Bir sayfa payı fazlasını istiyoruz ki
   * "Daha fazla göster"in ilk basışı yeniden istek gerektirmesin; kullanıcı
   * daha da açarsa sınır büyütülüp yeniden çekiliyor.
   */
  const [istenenSinir, setIstenenSinir] = useState(300);

  const genelRows = useMemo(() => totalsRows, [totalsRows]);
  const favRows = useMemo(() => teamRanks, [teamRanks]);

  const meRow = useMemo(
    () => totalsRows.find((r) => String(r.userId || "").toLowerCase() === userId.toLowerCase()),
    [totalsRows, userId]
  );

  const myCupRow = useMemo(
    () => cupRows.find((r) => String(r.userId || "").toLowerCase() === userId.toLowerCase()),
    [cupRows, userId]
  );

  const formArray = meStats?.form || [];

  const globalSummaryPoints = meRow?.totalPoints ?? meStats?.totalPoints ?? 0;
  const globalSummaryMatches = meRow?.matches ?? meStats?.played ?? undefined;

  const cupSummaryPoints = myCupRow?.totalPoints ?? 0;
  const cupSummaryMatches = myCupRow?.matches ?? undefined;

  const summaryPoints = mode === "global" ? globalSummaryPoints : cupSummaryPoints;
  const summaryMatches = mode === "global" ? globalSummaryMatches : cupSummaryMatches;

  const cupTitle =
    cupMeta?.shortName || cupMeta?.name || cupMeta?.competitionId || DEFAULT_COMPETITION_ID || "Seçilmiş kupa";

  const effectiveRuntime = runtimeShadow || runtimeMode || null;

  const runtimeLabel =
    mapProfileLabel(effectiveRuntime?.profile) || (features?.mode === "GS_ONLY" ? "GS-only mod" : null);

  const presetProfiles = [
    { key: "DEV_4_TEAMS", label: "4 takımlı DEV", maxTeams: 4, maxLeagues: 1, notes: "4 takımlı geliştirme modu" },
    { key: "TR_30_TEAMS", label: "TR 30 takım", maxTeams: 30, maxLeagues: 1, notes: "Türkiye ligi testi (≈30 takım)" },
    { key: "GLOBAL_100_TEAMS", label: "Global 100 takım", maxTeams: 100, maxLeagues: 5, notes: "Kısıtlı global test modu (≈100 takım)" },
    { key: "GLOBAL_456_TEAMS", label: "Global full", maxTeams: 456, maxLeagues: 20, notes: "Tam global yüksek yük modu" },
  ];

  async function saveRuntimeProfile() {
    if (!adminProfile) {
      Alert.alert("SkorLig", "Önce bir çalışma profili seç.");
      return;
    }
    try {
      setAdminSaving(true);

      const payload: any = { profile: adminProfile, updatedBy: userId };

      const mt = parseInt(adminMaxTeams, 10);
      if (!Number.isNaN(mt)) payload.maxTeams = mt;

      const ml = parseInt(adminMaxLeagues, 10);
      if (!Number.isNaN(ml)) payload.maxLeagues = ml;

      if (adminNotes.trim()) payload.notes = adminNotes.trim();

      const headers: Record<string, string> = await withAdminHeaders({
        "Content-Type": "application/json",
      });

      const res = await apiFetch(`/api/admin/runtime-mode`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const j = await res.json();

      if (!res.ok || !j?.ok) {
        Alert.alert("Hata", hataMesaji(j?.error));
        return;
      }

      await refreshRuntimeShadow();
      await loadAll();

      Alert.alert("SkorLig", "Çalışma modu güncellendi. /api/config çıktısına yansıyacak.");
      setAdminModalOpen(false);
    } catch (e: any) {
      Alert.alert("Hata", String(e?.message || e));
    } finally {
      setAdminSaving(false);
    }
  }

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: Colors.bg }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await loadAll();
              await refreshRuntimeShadow();
              setRefreshing(false);
            }}
          />
        }
      >
        <View style={{ padding: 16, gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
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
              İstatistikler & Krallar
            </Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4, justifyContent: "space-between" }}>
            <View style={{ flexShrink: 1 }}>
              {runtimeLabel && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  delayLongPress={5000}
                  onLongPress={() => {
                    const m = effectiveRuntime || null;
                    setAdminProfile((m?.profile as string) || "DEV_4_TEAMS");
                    setAdminMaxTeams(m?.maxTeams != null ? String(m.maxTeams) : "");
                    setAdminMaxLeagues(m?.maxLeagues != null ? String(m.maxLeagues) : "");
                    setAdminNotes(m?.notes || "");
                    setAdminModalOpen(true);
                  }}
                >
                  <View
                    style={{
                      alignSelf: "flex-start",
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderRadius: 999,
                      backgroundColor: "#020617",
                      borderWidth: 1,
                      borderColor: Colors.border,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Text style={{ color: "#a5b4fc", fontSize: 11, fontWeight: "600" }}>Çalışma modu:</Text>
                    <Text style={{ color: "#e5e7eb", fontSize: 11, fontWeight: "600" }} numberOfLines={1}>
                      {runtimeLabel}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              {!runtimeLabel && cfgLoading && (
                <Text style={{ color: Colors.muted, fontSize: 11 }}>Çalışma modu yükleniyor...</Text>
              )}
              {cfgError && !runtimeLabel && !cfgLoading && (
                <Text style={{ color: "#f97316", fontSize: 11 }}>Mod okunamadı: {cfgError}</Text>
              )}
            </View>

          </View>

          {/* MOD (Global sezon / Kupa) */}
          <View style={{ flexDirection: "row", backgroundColor: Colors.dark, borderRadius: 999, padding: 4 }}>
            {[{ key: "global", label: "Global sezon" }, { key: "kupon", label: "Kupon" }, { key: "cup", label: "Kupa" }].map((tab) => {
              const active = mode === (tab.key as ModeKey);
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setMode(tab.key as ModeKey)}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: active ? Colors.accent : "transparent",
                  }}
                >
                  <Text
                    style={{
                      textAlign: "center",
                      color: active ? Colors.onAccent : Colors.muted,
                      fontWeight: active ? "700" : "500",
                      fontSize: 12,
                    }}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Diğer istatistik sayfaları */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {[
              { label: "Gol Kralları", pathname: "/kings" },
              { label: "Detaylı Ben Sayfası", pathname: "/stats/me" },
              { label: "Takım Paneli", pathname: "/stats/team", params: { team: teamName } },
              { label: "Bayraklı Liderlik", pathname: "/stats/board2" },
              { label: "Favori Takım Ayarları", pathname: "/stats/fav" },
              { label: "Kupa Krallığı", pathname: "/stats/competition-kings" },
            ].map((item) => (
              <TouchableOpacity
                key={item.pathname}
                onPress={() =>
                  router.push({
                    pathname: item.pathname as any,
                    params: { userId, ...(item.params || {}) },
                  } as any)
                }
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: Colors.border,
                  backgroundColor: "#020617",
                }}
              >
                <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: "600" }}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Özet kartı */}
          <View style={{ padding: 12, backgroundColor: "#0f172a", borderRadius: 12, borderWidth: 1, borderColor: Colors.border, gap: 4 }}>
            <Text style={{ fontWeight: "700", color: "#e2e8f0" }}>{mode === "global" ? "Global sezon özetim" : "Kupa özetim"}</Text>

            <Text style={{ fontSize: 26, fontWeight: "800", color: Colors.primary, marginTop: 4 }}>
              {summaryPoints} puan
            </Text>

            {typeof summaryMatches === "number" && (
              <Text style={{ color: Colors.muted, fontSize: 12 }}>Tahmin girilen maç: {summaryMatches}</Text>
            )}

            <Text style={{ color: Colors.muted, fontSize: 12 }}>
              Ana takım: {teamName || meStats?.favTeam || meStats?.team?.team || "-"}
            </Text>

            {mode === "global" && formArray.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={{ color: Colors.muted, fontSize: 11, marginBottom: 2 }}>Form (son 10 maç puanları):</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {formArray.map((p, ix) => (
                    <View
                      key={ix}
                      style={{
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 8,
                        backgroundColor: p >= 0 ? Colors.headerBlue : "#450a0a",
                        marginRight: 4,
                        marginBottom: 4,
                      }}
                    >
                      <Text style={{ fontSize: 10, color: p >= 0 ? Colors.slate900 : "#fecaca" }}>{p}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {typeof summaryMatches === "number" && (
              <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 6 }}>
                Not: Bu sayı, en az bir tahmin girdiğin ve işlenmiş maç sayısıdır.
              </Text>
            )}
          </View>

          {/* Sekmeler: sadece GLOBAL sezonda */}
          {mode === "global" && (
            <View style={{ flexDirection: "row", backgroundColor: Colors.dark, borderRadius: 999, padding: 4 }}>
              {[{ key: "genel", label: "Genel" }, { key: "fav", label: "Takımıma göre" }, { key: "me", label: "Ben" }].map((tab) => {
                const active = view === (tab.key as ViewKey);
                return (
                  <TouchableOpacity
                    key={tab.key}
                    onPress={() => setView(tab.key as ViewKey)}
                    style={{ flex: 1, paddingVertical: 8, borderRadius: 999, backgroundColor: active ? Colors.accent : "transparent" }}
                  >
                    <Text style={{ textAlign: "center", color: active ? Colors.onAccent : Colors.muted, fontWeight: active ? "700" : "500", fontSize: 12 }}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Kapsam: kendi ülken / dünya — sadece Genel listede anlamlı.
              "Ben" ve "Takımıma göre" zaten kişiye/takıma özel. */}
          {mode === "global" && view === "genel" && (
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {([
                  { key: "country" as ScopeKey, label: myCountry ? `🏠 ${myCountry}` : "🏠 Ülkem" },
                  { key: "global" as ScopeKey, label: "🌍 Dünya" },
                ]).map((s) => {
                  const active = scope === s.key;
                  return (
                    <TouchableOpacity
                      key={s.key}
                      onPress={() => {
                        if (scope === s.key) return;
                        setScope(s.key);
                        loadTotals(s.key);
                      }}
                      style={{
                        flex: 1,
                        paddingVertical: 9,
                        borderRadius: 999,
                        backgroundColor: active ? Colors.accent : Colors.dark,
                        borderWidth: 1,
                        borderColor: active ? Colors.accent : "#1f2937",
                      }}
                    >
                      <Text
                        style={{
                          textAlign: "center",
                          color: active ? Colors.onAccent : Colors.muted,
                          fontWeight: active ? "800" : "600",
                          fontSize: 13,
                        }}
                        numberOfLines={1}
                      >
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* SEZON ŞERİDİ.
                  ⚠️ Sezon AYLIK: ayın 1'inde tablo sıfırlanıyordu ve istemci
                  bunu hiç göstermiyordu — kullanıcı bir aylık emeğinin
                  kaybolduğunu sanırdı. Sunucu `season`/`seasonLabel`/
                  `previousSeason` alanlarını hep gönderiyordu, okunmuyordu. */}
              {sezonEtiket && (
                <View
                  style={{
                    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10,
                    backgroundColor: guncelSezonMu ? Colors.dark : "#78350f33",
                    borderWidth: 1, borderColor: guncelSezonMu ? "#1f2937" : "#b4530966",
                    marginBottom: 8,
                  }}
                >
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ color: Colors.text, fontSize: 12, fontWeight: "700" }}>
                      {sezonEtiket} sezonu{guncelSezonMu ? "" : "  (arşiv)"}
                    </Text>
                    <Text style={{ color: Colors.muted, fontSize: 10, marginTop: 2 }}>
                      {guncelSezonMu
                        ? (totalsRows.length === 0
                            ? "Yeni sezon başladı, tablo sıfırlandı. İlk tahminini yap!"
                            : "Sıralama her ay başında sıfırlanır.")
                        : "Geçmiş sezonun kapanış tablosu."}
                      {arsivKisitli ? "  Daha eski sezonlar Premium'da." : ""}
                    </Text>
                  </View>

                  {guncelSezonMu && oncekiSezon ? (
                    <TouchableOpacity
                      onPress={() => { setBakilanSezon(oncekiSezon); loadTotals(scope, humansOnly); }}
                      style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: "#1f2937" }}
                    >
                      <Text style={{ color: "#a3e635", fontSize: 11, fontWeight: "700" }}>Geçen sezon</Text>
                    </TouchableOpacity>
                  ) : !guncelSezonMu ? (
                    <TouchableOpacity
                      onPress={() => { setBakilanSezon(null); loadTotals(scope, humansOnly); }}
                      style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: "#1f2937" }}
                    >
                      <Text style={{ color: "#a3e635", fontSize: 11, fontWeight: "700" }}>Bu sezon</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}

              {/* Kiminle yarıştığını göster ve seçim hakkı ver. */}
              {botCount > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    const yeni = !humansOnly;
                    setHumansOnly(yeni);
                    loadTotals(scope, yeni);
                  }}
                  style={{
                    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10,
                    backgroundColor: humansOnly ? "#14532d33" : Colors.dark,
                    borderWidth: 1, borderColor: humansOnly ? "#16a34a66" : "#1f2937",
                  }}
                >
                  <Text style={{ color: humansOnly ? "#4ade80" : Colors.muted, fontSize: 12, fontWeight: "700" }}>
                    {humansOnly ? "✓ Sadece gerçek oyuncular" : "Sadece gerçek oyuncuları göster"}
                  </Text>
                  <Text style={{ color: Colors.muted, fontSize: 11 }}>
                    {humanCount} oyuncu · {botCount} bot
                  </Text>
                </TouchableOpacity>
              )}

              {/* Ülke seçilmemişse sekme boş liste getirir gibi görünmesin */}
              {scope === "country" && scopeFellBack && (
                <Text style={{ color: "#f97316", fontSize: 11 }}>
                  Ülkeni seçmediğin için dünya sıralaması gösteriliyor. Profil ekranından ülkeni seçebilirsin.
                </Text>
              )}
            </View>
          )}

          {/* Güncelleme bilgileri */}
          {mode === "global" && (
            <>
              <Text style={{ color: Colors.muted, fontSize: 12 }}>Güncelleme (genel sezon): {updatedAtTotals || "-"}</Text>
              {view === "fav" && (
                <Text style={{ color: Colors.muted, fontSize: 12 }}>
                  Takım: {teamName} · Güncelleme (takım): {updatedAtTeam || "-"}
                </Text>
              )}
            </>
          )}

          {mode === "kupon" && (
            <View style={{ marginTop: 12 }}>
              <Text style={{ color: Colors.text, fontSize: 15, fontWeight: "800" }}>
                Haftalık Kupon — kümülatif
              </Text>
              <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 2, marginBottom: 10 }}>
                Bu sezonda oynanan tüm kuponların toplamı. Sıralama PUANA göre —
                kazanılan LC harcanabilir, puan beceriyi gösterir.
              </Text>

              {kuponYukleniyor ? (
                <Text style={{ color: Colors.muted, fontSize: 12 }}>Yükleniyor...</Text>
              ) : kuponSira.length === 0 ? (
                /* Boş durum sebebini söylüyor — "veri yok" tek başına bir şey anlatmaz. */
                <View style={{ padding: 14, borderRadius: 12, backgroundColor: Colors.dark }}>
                  <Text style={{ color: Colors.text, fontSize: 13, fontWeight: "700" }}>
                    Henüz sonuçlanmış kupon yok
                  </Text>
                  <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 6, lineHeight: 17 }}>
                    Tablo, bir kuponun tüm maçları bitince dolmaya başlar. Kupon
                    alıp hafta sonunu bekle.
                  </Text>
                </View>
              ) : (
                kuponSira.map((r) => {
                  const benMi = String(r.userId).toLowerCase() === String(userId).toLowerCase();
                  return (
                    <View
                      key={r.userId}
                      style={{
                        flexDirection: "row", alignItems: "center", paddingVertical: 10,
                        paddingHorizontal: 12, borderRadius: 10, marginBottom: 6,
                        backgroundColor: benMi ? "#14532d33" : Colors.dark,
                        borderWidth: benMi ? 1 : 0, borderColor: "#16a34a66",
                      }}
                    >
                      <Text style={{ color: Colors.muted, fontSize: 12, width: 28 }}>{r.sira}.</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: Colors.text, fontSize: 13, fontWeight: "700" }}>
                          {r.userId}{benMi ? " (ben)" : ""}
                        </Text>
                        <Text style={{ color: Colors.muted, fontSize: 10, marginTop: 2 }}>
                          {r.kuponSayisi} kupon · {r.toplamDogru}/{r.toplamMac} doğru (%{r.isabetYuzde})
                          {r.tamKupon > 0 ? ` · ${r.tamKupon} tam kupon 🎯` : ""}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={{ color: "#a3e635", fontSize: 15, fontWeight: "800" }}>
                          {r.toplamPuan}
                        </Text>
                        <Text style={{ color: Colors.muted, fontSize: 9 }}>puan</Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {mode === "cup" && (
            <View style={{ gap: 2 }}>
              <Text style={{ color: Colors.muted, fontSize: 12 }}>Seçilmiş kupa: {cupTitle}</Text>
              <Text style={{ color: Colors.muted, fontSize: 12 }}>Güncelleme (kupa): {cupUpdatedAt || "-"}</Text>
              {cupError && <Text style={{ color: "#f97316", fontSize: 11 }}>Kupa verisi: {cupError}</Text>}
            </View>
          )}

          {/* Liste alanı */}
          <View style={{ marginTop: 8 }}>
            {mode === "global" && (
              <>
                {view === "genel" &&
                  (genelRows.length ? genelRows.slice(0, gosterilecek) : ([{ userId: "-", totalPoints: 0, totalPenalty: 0, matches: 0 } as TotRow] as TotRow[])).map(
                    (r, ix) => {
                      const isMe = String(r.userId || "").toLowerCase() === userId.toLowerCase();
                      return (
                        <TouchableOpacity
                          key={String(r.userId ?? "-") + "_" + String(ix)}
                          activeOpacity={0.8}
                          onPress={() => {
                            if (!isMe && r.userId) sendFriendRequest(r.userId);
                          }}
                        >
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#0b0b0e", padding: 12, borderRadius: 12, marginBottom: 8 }}>
                            <View>
                              <Text style={{ color: "#fff", fontWeight: "600" }}>
                                {ix + 1}. {r.userId}
                                {isMe ? " (ben)" : ""}
                              </Text>
                              <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 2 }}>
                                {r.matches} maç · {r.totalPoints} puan · Ceza: {r.totalPenalty}
                              </Text>
                              {/* Nitelik eşiği: eşiğin altındaki oyuncunun rating'i havuz
                                  ortalamasını aşamaz (tek şanslı maç zirveye çıkmasın).
                                  Sebebini söylemezsek kullanıcı "neden hep alttayım"
                                  diye düşünür — kaç maç kaldığını yazıyoruz. */}
                              {r.qualified === false && r.minPlayed ? (
                                <Text style={{ color: "#eab308", fontSize: 10, marginTop: 2 }}>
                                  Sıralamaya girmek için {Math.max(0, r.minPlayed - r.matches)} maç daha
                                </Text>
                              ) : null}
                            </View>
                            {/* Sıralama maç-başı ortalamaya göre (rating) — toplam puan
                                değil. 1000 bot her maça girdiği için kümülatif tabloda
                                insan yetişemiyordu. */}
                            <View style={{ alignItems: "flex-end" }}>
                              <Text style={{ color: "#a3e635", fontWeight: "700", fontSize: 15 }}>
                                {r.rating != null ? r.rating.toFixed(1) : r.totalPoints}
                              </Text>
                              <Text style={{ color: Colors.muted, fontSize: 9 }}>
                                {r.rating != null ? "maç ort." : "puan"}
                              </Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    }
                  )}

                {/* Kalan satırlar isteğe bağlı — hepsini birden çizmek
                    arayüzü donduruyordu (bkz. `gosterilecek`). */}
                {view === "genel" && genelRows.length > gosterilecek && (
                  <TouchableOpacity
                    onPress={() => {
                      const yeni = gosterilecek + 100;
                      setGosterilecek(yeni);
                      /* Elimizdekinin sonuna yaklaştıysak sunucudan daha
                       * fazlasını iste — aksi halde liste sessizce kısa kalır. */
                      if (yeni + 100 > istenenSinir) {
                        const yeniSinir = istenenSinir + 500;
                        setIstenenSinir(yeniSinir);
                        loadTotals(scope, humansOnly, yeniSinir);
                      }
                    }}
                    style={{
                      marginTop: 10, alignSelf: "center", paddingHorizontal: 18,
                      paddingVertical: 9, borderRadius: 999, backgroundColor: Colors.dark,
                      borderWidth: 1, borderColor: "#1f2937",
                    }}
                  >
                    <Text style={{ color: "#e2e8f0", fontWeight: "700", fontSize: 12.5 }}>
                      Daha fazla göster ({genelRows.length - gosterilecek} kaldı)
                    </Text>
                  </TouchableOpacity>
                )}

                {view === "fav" &&
                  (favRows.length ? favRows : ([{ userId: "-", total: 0 } as TeamRankRow] as TeamRankRow[])).map((r, ix) => {
                    const isMe = String(r.userId || "").toLowerCase() === userId.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={String(r.userId ?? "-") + "_" + String(ix)}
                        activeOpacity={0.8}
                        onPress={() => {
                          if (!isMe && r.userId) sendFriendRequest(r.userId);
                        }}
                      >
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#020617", padding: 12, borderRadius: 12, marginBottom: 8 }}>
                          <View>
                            <Text style={{ color: "#fff", fontWeight: "600" }}>
                              {ix + 1}. {r.userId}
                              {isMe ? " (ben)" : ""}
                              {r.flag ? ` ${r.flag}` : ""}
                            </Text>
                            <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 2 }}>Takım: {r.team || teamName}</Text>
                          </View>
                          <Text style={{ color: "#facc15", fontWeight: "700", fontSize: 14 }}>{r.total} puan</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}

                {view === "me" && (
                  <View style={{ padding: 12, backgroundColor: "#020617", borderRadius: 12, borderWidth: 1, borderColor: Colors.border, gap: 6 }}>
                    <Text style={{ color: "#fff", fontWeight: "700", marginBottom: 4 }}>Benim detaylarım (global sezon)</Text>
                    <Text style={{ color: Colors.muted, fontSize: 12 }}>Kullanıcı: {userId}</Text>
                    <Text style={{ color: Colors.muted, fontSize: 12 }}>Ana takım: {teamName || meStats?.favTeam || meStats?.team?.team || "-"}</Text>
                    <Text style={{ color: "#a3e635", fontWeight: "700", fontSize: 16, marginTop: 4 }}>Toplam puan: {globalSummaryPoints}</Text>
                    {typeof globalSummaryMatches === "number" && (
                      <Text style={{ color: Colors.muted, fontSize: 12, marginTop: 2 }}>Tahmin girilen maç: {globalSummaryMatches}</Text>
                    )}
                    {typeof (meStats?.team?.rank ?? null) === "number" && (
                      <Text style={{ color: Colors.muted, fontSize: 12 }}>
                        Takım içi sıram: {meStats!.team!.rank} / {meStats!.team!.count}
                      </Text>
                    )}
                    {formArray.length > 0 && (
                      <View style={{ marginTop: 8 }}>
                        <Text style={{ color: Colors.muted, fontSize: 11, marginBottom: 2 }}>Form (son 10 maç):</Text>
                        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                          {formArray.map((p, ix) => (
                            <View
                              key={ix}
                              style={{
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                borderRadius: 8,
                                backgroundColor: p >= 0 ? Colors.headerBlue : "#450a0a",
                                marginRight: 4,
                                marginBottom: 4,
                              }}
                            >
                              <Text style={{ fontSize: 10, color: p >= 0 ? Colors.slate900 : "#fecaca" }}>{p}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                    <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 8 }}>
                      Not: “Tahmin girilen maç”, en az bir tahmin girdiğin ve sistemde işlenmiş maçların sayısını temsil eder.
                    </Text>
                  </View>
                )}
              </>
            )}

            {mode === "cup" && (
              <View style={{ marginTop: 4 }}>
                {(cupRows.length ? cupRows : ([{ userId: "-", totalPoints: 0, matches: 0, totalPenalty: 0 } as CupRow] as CupRow[])).map((r, ix) => {
                  const isMe = String(r.userId || "").toLowerCase() === userId.toLowerCase();
                  return (
                    <View
                      key={String(r.userId ?? "-") + "_" + String(ix)}
                      style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#0b0b0e", padding: 12, borderRadius: 12, marginBottom: 8 }}
                    >
                      <View>
                        <Text style={{ color: "#fff", fontWeight: "600" }}>
                          {ix + 1}. {r.userId}
                          {isMe ? " (ben)" : ""}
                        </Text>
                        <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 2 }}>
                          Tahmin girilen maç: {r.matches} · Ceza: {r.totalPenalty}
                        </Text>
                      </View>
                      <Text style={{ color: "#7dd3fc", fontWeight: "700", fontSize: 14 }}>{r.totalPoints} puan</Text>
                    </View>
                  );
                })}
                <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 4 }}>
                  Not: Kupa sıralaması, competition_totals üzerinden hesaplanır. Buradaki “tahmin girilen maç” sayısı da ilgili kupa kapsamındaki tahminli maçları gösterir.
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={adminModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!adminSaving) setAdminModalOpen(false);
        }}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <View style={{ width: "100%", maxWidth: 420, borderRadius: 16, padding: 16, backgroundColor: "#020617", borderWidth: 1, borderColor: Colors.border }}>
            <Text style={{ color: "#e5e7eb", fontWeight: "700", fontSize: 14, marginBottom: 8 }}>Çalışma modu (admin)</Text>
            <Text style={{ color: Colors.muted, fontSize: 11, marginBottom: 8 }}>
              Bu panel, sadece bilinçli kullanım için. Badge’e 5 saniye uzun basarak açılır. Değişiklikler backend’de runtime-mode.json dosyasına yazılır.
            </Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {presetProfiles.map((preset) => {
                const active = adminProfile.toUpperCase() === preset.key.toUpperCase();
                const handlePressPreset = () => {
                  setAdminProfile(preset.key);
                  setAdminMaxTeams(String(preset.maxTeams));
                  setAdminMaxLeagues(String(preset.maxLeagues));
                  if (!adminNotes || adminNotes.trim().length === 0) setAdminNotes(preset.notes || "");
                };
                return (
                  <TouchableOpacity
                    key={preset.key}
                    onPress={handlePressPreset}
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: active ? Colors.accent : Colors.border,
                      backgroundColor: active ? "#0f172a" : "#020617",
                    }}
                  >
                    <Text style={{ color: active ? Colors.accent : Colors.muted, fontSize: 11, fontWeight: "600" }}>{preset.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={{ color: Colors.muted, fontSize: 11, marginBottom: 4 }}>Profil (custom yazmak istersen):</Text>
            <TextInput
              value={adminProfile}
              onChangeText={setAdminProfile}
              autoCapitalize="characters"
              placeholder="DEV_4_TEAMS / TR_30_TEAMS / ..."
              placeholderTextColor={Colors.muted}
              style={{
                borderWidth: 1,
                borderColor: Colors.border,
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 6,
                fontSize: 12,
                color: "#e5e7eb",
                marginBottom: 8,
              }}
            />

            <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.muted, fontSize: 11, marginBottom: 2 }}>maxTeams</Text>
                <TextInput
                  value={adminMaxTeams}
                  onChangeText={setAdminMaxTeams}
                  placeholder="örn: 4 / 30 / 100"
                  placeholderTextColor={Colors.muted}
                  keyboardType="numeric"
                  style={{
                    borderWidth: 1,
                    borderColor: Colors.border,
                    borderRadius: 8,
                    paddingHorizontal: 8,
                    paddingVertical: 6,
                    fontSize: 12,
                    color: "#e5e7eb",
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.muted, fontSize: 11, marginBottom: 2 }}>maxLeagues</Text>
                <TextInput
                  value={adminMaxLeagues}
                  onChangeText={setAdminMaxLeagues}
                  placeholder="örn: 1 / 5 / 20"
                  placeholderTextColor={Colors.muted}
                  keyboardType="numeric"
                  style={{
                    borderWidth: 1,
                    borderColor: Colors.border,
                    borderRadius: 8,
                    paddingHorizontal: 8,
                    paddingVertical: 6,
                    fontSize: 12,
                    color: "#e5e7eb",
                  }}
                />
              </View>
            </View>

            <Text style={{ color: Colors.muted, fontSize: 11, marginBottom: 2 }}>Not (opsiyonel):</Text>
            <TextInput
              value={adminNotes}
              onChangeText={setAdminNotes}
              placeholder="Örn: 'TR test: 30 takım'..."
              placeholderTextColor={Colors.muted}
              multiline
              style={{
                borderWidth: 1,
                borderColor: Colors.border,
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 6,
                fontSize: 12,
                color: "#e5e7eb",
                minHeight: 48,
                textAlignVertical: "top",
                marginBottom: 10,
              }}
            />

            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
              <TouchableOpacity
                disabled={adminSaving}
                onPress={() => setAdminModalOpen(false)}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: Colors.border }}
              >
                <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: "600" }}>Kapat</Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={adminSaving}
                onPress={saveRuntimeProfile}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: adminSaving ? Colors.border : Colors.accent,
                  opacity: adminSaving ? 0.7 : 1,
                }}
              >
                <Text style={{ color: adminSaving ? "#fff" : Colors.onAccent, fontSize: 12, fontWeight: "700" }}>{adminSaving ? "Kaydediliyor..." : "Kaydet"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
