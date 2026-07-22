import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Colors from "../../constants/colors";
import { getApiBase, resetApiBase, syncServerTime, nowFromServer } from "../../lib/apiBase";
import { getAuthHeaders } from "../../lib/apiFetch";
import { useUserId } from "../../lib/useUserId";

type Outcome = "H" | "D" | "A" | null;
type Side = "H" | "A" | null;

type TeamCode = "GS" | "FB" | "BJK" | "TS";

type NextMatchInfo = {
  fixtureId: string;
  home?: string;
  away?: string;
  kickoffISO?: string | null;
  status?: string | null;
};

// LC cüzdan tipleri (me.tsx ile uyumlu light versiyon)
type WalletUser = {
  userId: string;
  balance: number;
  lastDailyAt?: string | null;
  totalEarned?: number;
  totalSpent?: number;
};
type WalletDaily = {
  today: string;
  canClaim: boolean;
  amount: number;
};
type WalletPricing = {
  daily: number;
  matchEntryCost: number;
  initialDefault: number;
  initial1987: number;
};
type WalletSummary = {
  user: WalletUser;
  daily: WalletDaily;
  pricing?: WalletPricing | null;
  updatedAt?: string | null;
};

type PredRecord = {
  fixtureId: string;
  userId: string;
};

const TEAM_LABELS: Record<TeamCode, string> = {
  GS: "Galatasaray",
  FB: "Fenerbahçe",
  BJK: "Beşiktaş",
  TS: "Trabzonspor",
};

const QUICK_SCORES: { h: number; a: number }[] = [
  { h: 1, a: 0 }, { h: 0, a: 1 }, { h: 1, a: 1 }, { h: 0, a: 0 },
  { h: 2, a: 0 }, { h: 0, a: 2 }, { h: 2, a: 1 }, { h: 1, a: 2 },
  { h: 2, a: 2 }, { h: 3, a: 0 }, { h: 0, a: 3 }, { h: 3, a: 1 },
  { h: 1, a: 3 }, { h: 3, a: 2 }, { h: 2, a: 3 }, { h: 4, a: 0 },
  { h: 0, a: 4 }, { h: 4, a: 1 }, { h: 1, a: 4 },
];

export default function PredictScreen() {

  // Tek kalıp: base’i içeriden alıp çağır (IP değişince 1 kez reset + retry)
  async function apiFetch(path: string, init?: RequestInit, _retried = false) {
    const base = await getApiBase();
    const authH = await getAuthHeaders();
    const p = path.startsWith("/") ? path : `/${path}`;
    const url = `${base}${p}`;

    try {
      return await fetch(url, { ...init, headers: { ...authH, ...(init?.headers as any) } });
    } catch (e) {
      if (!_retried) {
        resetApiBase(); // LAN IP değiştiyse cache’i bırak
        return apiFetch(path, init, true); // 1 kez retry
      }
      throw e;
    }
  }

  const { fixtureId: qFx, userId: qUser, home: qHome, away: qAway, league: qLeague, kickoffISO: qKickoff } =
    useLocalSearchParams<{ fixtureId?: string; userId?: string; home?: string; away?: string; league?: string; kickoffISO?: string }>();
  useEffect(() => {
    syncServerTime();
  }, []);
  const router = useRouter();

  const [liveState, setLiveState] = useState<any | null>(null);
  const [predLock, setPredLock] = useState<{
    locked: boolean;
    reason?: string;
    lockAtISO?: string;
  }>({ locked: false });

  const [fixtureId, setFixtureId] = useState<string>("");
  const paramHome = String(qHome || "").trim();
  const paramAway = String(qAway || "").trim();
  const paramLeague = String(qLeague || "").trim();
  const paramKickoff = String(qKickoff || "").trim();
  const userId = useUserId(qUser);

  // 4 takımlı geliştirme modu için takım seçimi
  const [teamCode, setTeamCode] = useState<TeamCode>("GS");
  const [nextMatch, setNextMatch] = useState<NextMatchInfo | null>(null);
  const [loadingMatch, setLoadingMatch] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);

  // Skor: isteğe bağlı
  const [homeScore, setHomeScore] = useState<string>("");
  const [awayScore, setAwayScore] = useState<string>("");

  // Maç sonucu tahmini (H/D/A) - isteğe bağlı
  const [outcome, setOutcome] = useState<Outcome>(null);

  // İlk gol / ilk yarı - isteğe bağlı
  const [firstGoal, setFirstGoal] = useState<Side>(null);
  const [firstHalf, setFirstHalf] = useState<Outcome | null>(null);

  // Kırmızı kart: iki aşamalı
  const [redAny, setRedAny] = useState<boolean | null>(null);
  const [redSide, setRedSide] = useState<Side>(null);

  // Penaltı: iki aşamalı
  const [penaltyAny, setPenaltyAny] = useState<boolean | null>(null);
  const [penaltySide, setPenaltySide] = useState<Side>(null);

  const [sending, setSending] = useState(false);

  // LC mini şerit durumu
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);

  // Bu maç için daha önce tahmini var mı?
  const [hasPredByMe, setHasPredByMe] = useState<boolean | null>(null);
  const [checkingPred, setCheckingPred] = useState(false);
  const [myPredDetail, setMyPredDetail] = useState<any | null>(null);
  const [showMyPred, setShowMyPred] = useState(false);

  // Topluluk istatistikleri (sonuç + skor dağılımı)
  const [communityStats, setCommunityStats] = useState<{
    total: number; H: number; D: number; A: number;
  } | null>(null);
  const [scoreDist, setScoreDist] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (redAny !== true) setRedSide(null);
  }, [redAny]);

  useEffect(() => {
    if (penaltyAny !== true) setPenaltySide(null);
  }, [penaltyAny]);

  // Eski tahmini forma bir kez doldur (fixture başına)
  const prefilledFor = useRef<string | null>(null);
  useEffect(() => {
    const d = myPredDetail;
    if (!d) return;
    const key = String(d.fixtureId || fixtureId || "");
    if (prefilledFor.current === key) return; // aynı maç için tekrar doldurma
    prefilledFor.current = key;

    if (d.outcome) setOutcome(String(d.outcome).toUpperCase() as Outcome);
    if (d.home != null) setHomeScore(String(d.home));
    if (d.away != null) setAwayScore(String(d.away));
    if (d.firstGoal) setFirstGoal(String(d.firstGoal).toUpperCase() as Side);
    if (d.firstHalf) setFirstHalf(String(d.firstHalf).toUpperCase() as Outcome);
    if (typeof d.redAny === "boolean") setRedAny(d.redAny);
    if (d.redSide) setRedSide(String(d.redSide).toUpperCase() as Side);
    if (typeof d.penaltyAny === "boolean") setPenaltyAny(d.penaltyAny);
    if (d.penaltySide) setPenaltySide(String(d.penaltySide).toUpperCase() as Side);
  }, [myPredDetail, fixtureId]);

  function clearForm() {
    setOutcome(null);
    setHomeScore("");
    setAwayScore("");
    setFirstGoal(null);
    setFirstHalf(null);
    setRedAny(null);
    setRedSide(null);
    setPenaltyAny(null);
    setPenaltySide(null);
  }

  async function cancelPrediction() {
    const fx = fixtureId.trim();
    const uid = userId.trim();
    if (!fx || !uid) return;
    Alert.alert("Tahmini İptal Et", "Bu maç için tahminini silmek istediğine emin misin?", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil", style: "destructive",
        onPress: async () => {
          try {
            const res = await apiFetch("/api/pred/cancel", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fixtureId: fx, userId: uid }),
            });
            const j = await res.json();
            if (j?.ok) {
              setHasPredByMe(false);
              setMyPredDetail(null);
              clearForm();
              prefilledFor.current = null;
              Alert.alert("SkorLig", "Tahmin iptal edildi.");
            } else {
              Alert.alert("Hata", j?.error || "İptal edilemedi");
            }
          } catch (e: any) {
            Alert.alert("Hata", String(e?.message || e));
          }
        },
      },
    ]);
  }

  async function loadWalletSummary(uid: string) {
    const trimmed = uid.trim();
    if (!trimmed) {
      setWallet(null);
      return;
    }
    try {
      setWalletLoading(true);
      const res = await apiFetch(
        `/api/rt/lc-wallet/summary?userId=${encodeURIComponent(trimmed)}`
      );
      const j = await res.json();
      if (j?.ok && j.user && j.daily) {
        const summary: WalletSummary = {
          user: j.user as WalletUser,
          daily: j.daily as WalletDaily,
          pricing: j.pricing || null,
          updatedAt: j.updatedAt || null,
        };
        setWallet(summary);
      } else {
        setWallet(null);
      }
    } catch {
      setWallet(null);
    } finally {
      setWalletLoading(false);
    }
  }

  async function checkExistingPrediction(fx: string, uid: string) {
    const f = fx.trim();
    const u = uid.trim();
    if (!f || !u) {
      setHasPredByMe(null);
      return;
    }
    try {
      setCheckingPred(true);
      const res = await apiFetch(`/api/pred/list?fixtureId=${encodeURIComponent(f)}`);
      const j = await res.json();
      if (j?.ok && Array.isArray(j.items)) {
        const list = j.items as any[];
        const myRec = list.find(
          (p) =>
            String(p.fixtureId || "") === f &&
            String(p.userId || "").trim().toLowerCase() === u.toLowerCase()
        );
        setHasPredByMe(!!myRec);
        setMyPredDetail(myRec || null);

        // Topluluk dağılımı — bot olmayan tahminler
        const humans = list.filter((p: any) => !p.isBot);
        const stats = { total: 0, H: 0, D: 0, A: 0 };
        for (const p of humans) {
          const oc = String(p.outcome || "").toUpperCase();
          if (oc === "H" || oc === "D" || oc === "A") {
            stats[oc as "H" | "D" | "A"]++;
            stats.total++;
          }
        }
        setCommunityStats(stats.total >= 2 ? stats : null);

        // Skor dağılımı
        const sMap = new Map<string, number>();
        for (const p of humans) {
          if (p.home != null && p.away != null) {
            const key = `${p.home}-${p.away}`;
            sMap.set(key, (sMap.get(key) || 0) + 1);
          }
        }
        setScoreDist(sMap);
      } else {
        setHasPredByMe(null);
        setMyPredDetail(null);
        setCommunityStats(null);
      }
    } catch {
      setHasPredByMe(null);
      setCommunityStats(null);
    } finally {
      setCheckingPred(false);
    }
  }

  async function loadLiveState(fx: string) {
    const f = String(fx || "").trim();
    if (!f) {
      setLiveState(null);
      return;
    }
    try {
      const res = await apiFetch(
        `/api/rt/live-gs?fixtureId=${encodeURIComponent(f)}`
      );
      const j = await res.json();
      if (j?.ok && j.exists) {
        setLiveState(j);
      } else {
        setLiveState(null);
      }
    } catch {
      setLiveState(null);
    }
  }

  function computePredLock(st: any) {
    if (!st) return { locked: false as const };

    // Not: live-gs response’unda status/ kickOffISO üst seviyede dönüyor.
    const status = st.status || (st.state && st.state.status) || null;
    const kickoffISO = st.kickoffISO || (st.state && st.state.kickoffISO) || null;

    // Maç başladıysa: NS dışı ise kilit
    if (status && String(status).toUpperCase() !== "NS") {
      return { locked: true as const, reason: "MATCH_STARTED" as const };
    }

    // Kickoff’a 10 dk kala kilit
   if (kickoffISO) {
     const kickoffMs = new Date(kickoffISO).getTime();
     if (Number.isFinite(kickoffMs)) {
       const lockAtMs = kickoffMs - 10 * 60 * 1000;
       if (nowFromServer() >= lockAtMs) {
         return {
           locked: true,
           reason: "LOCKED_BEFORE_KICKOFF",
           lockAtISO: new Date(lockAtMs).toISOString(),
         };
       }
    }
  }

    return { locked: false as const };
  }

  // Seçilen takım için bir sonraki maçı otomatik getir
  async function loadNextMatch(team: TeamCode) {
    const t = team;
    setTeamCode(t);

    try {
      setLoadingMatch(true);
      setMatchError(null);

      const res = await apiFetch(`/api/skorlig/next?team=${encodeURIComponent(t)}`);
      const j = await res.json();

      if (!res.ok || !j) {
        throw new Error(j?.error || `NEXT_HTTP_${res.status}`);
      }

      const fid = String(j.fixtureId || j.id || "").trim();
      if (!fid) {
        throw new Error("NEXT_FIXTURE_NOT_FOUND");
      }

      setFixtureId(fid);

      setNextMatch({
        fixtureId: fid,
        home: j.home || j.homeTeam || j.home_name || "?",
        away: j.away || j.awayTeam || j.away_name || "?",
        kickoffISO: j.kickoffISO || j.dateUTC || j.date || null,
        status: j.status || null,
      });

      // Yeni maça geçince önceki tahmin durumunu tazele
      checkExistingPrediction(fid, userId);
      loadLiveState(fid);
    } catch (e: any) {
      setNextMatch(null);
      setMatchError(
        String(e?.message || e) ||
          "Sonraki maç bulunamadı, gerekirse Fixture ID'yi elle girebilirsin."
      );
      setFixtureId((prev) => prev || "1905-GS-TS");
    } finally {
      setLoadingMatch(false);
    }
  }

  useEffect(() => {
    loadWalletSummary(userId);
  }, [userId]);

  useEffect(() => {
    checkExistingPrediction(fixtureId, userId);
    loadLiveState(fixtureId);
  }, [fixtureId, userId]);

  useEffect(() => {
    if (!liveState) {
      setPredLock({ locked: false });
      return;
    }
    setPredLock(computePredLock(liveState));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveState]);

    // URL param değişince fixture'ı güncelle (aynı route'a tekrar push edilse bile)
useEffect(() => {
    const fxParam = String(qFx || "").trim();
  if (fxParam) {
    setFixtureId(fxParam);
    setHomeScore("");
    setAwayScore("");
    setOutcome(null);
    setFirstGoal(null);
    setFirstHalf(null);
    setRedAny(null);
    setRedSide(null);
    setPenaltyAny(null);
    setPenaltySide(null);

    return;
  }
    // Param yoksa otomatik next-match
    loadNextMatch(teamCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qFx, teamCode]);


  const matchCost = wallet?.pricing?.matchEntryCost ?? 0;
  const currentBalance = wallet?.user?.balance ?? 0;
  const mustPayForMatch = matchCost > 0 && hasPredByMe === false;
  const lcInsufficient = mustPayForMatch && currentBalance < matchCost;

  // Topluluk çarpanı hesaplamaları (backend ile aynı formül)
  function getOutcomeMultiplier(oc: "H" | "D" | "A"): number {
    if (!communityStats || communityStats.total < 5) return 1.0;
    const n = communityStats[oc];
    if (!n) return 4.0;
    const raw = (communityStats.total / 3) / n;
    return Math.max(0.35, Math.min(4.0, raw));
  }
  function getScoreMultiplier(h: string, a: string): number {
    if (!communityStats || communityStats.total < 5) return 1.0;
    const key = `${h}-${a}`;
    const n = scoreDist.get(key) || 0;
    if (!n) return 2.5;
    const fairShare = communityStats.total * 0.05;
    const raw = fairShare / n;
    return Math.max(0.6, Math.min(2.5, raw));
  }
  function fmtPts(n: number) { return Math.round(n * 10) / 10; }

  // Seçilen tahminlerin potansiyel kazanç / risk hesabı (çarpanlı)
  function calcSelection() {
    let gain = 0, risk = 0;
    if (outcome !== null) {
      gain += fmtPts(3 * getOutcomeMultiplier(outcome));
      risk += 1;
    }
    const hasScore = homeScore.trim() !== "" && awayScore.trim() !== "";
    if (hasScore) {
      gain += fmtPts(12 * getScoreMultiplier(homeScore.trim(), awayScore.trim()));
      risk += 0.1;
    }
    if (firstGoal !== null) { gain += 1; risk += 0.2; }
    if (firstHalf !== null) { gain += 2; risk += 0.4; }
    if (redAny !== null) { gain += 1.5; risk += 0.3; }
    if (redAny === true && redSide !== null) { gain += 1; risk += 0.2; }
    if (penaltyAny !== null) { gain += 1.5; risk += 0.3; }
    if (penaltyAny === true && penaltySide !== null) { gain += 1; risk += 0.2; }
    const count = (outcome !== null ? 1 : 0) + (hasScore ? 1 : 0) +
      (firstGoal !== null ? 1 : 0) + (firstHalf !== null ? 1 : 0) +
      (redAny !== null ? 1 : 0) + (penaltyAny !== null ? 1 : 0);
    return { gain: fmtPts(gain), risk: fmtPts(risk), count };
  }
  const sel = calcSelection();

  async function submitPrediction() {
  const fx = fixtureId.trim();
  const uid = userId.trim();
  if (!fx || !uid) {
    Alert.alert("SkorLig", "FixtureId ve kullanıcı zorunlu.");
    return;
  }

  if (predLock.locked) {
    Alert.alert(
      "SkorLig",
      predLock.reason === "MATCH_STARTED"
        ? "Maç başladıktan sonra tahmin yapılamaz."
        : "Maç başlamasına 10 dakika kala tahminler kilitlenir."
    );
    return;
  }

  // LC kontrolü (ilk tahmin ise ve bakiye yetersizse kilitle)
  if (matchCost > 0 && hasPredByMe === false && currentBalance < matchCost) {
    Alert.alert(
      "SkorLig",
      `Bu maç için giriş bedeli ${matchCost} LC. Cüzdan bakiyen (${currentBalance} LC) yetersiz görünüyor.`
    );
    return;
  }

  // Skor isteğe bağlı: her ikisi de boşsa skor gönderme
  const hasHome = homeScore.trim() !== "";
  const hasAway = awayScore.trim() !== "";

  let h: number | null = null;
  let a: number | null = null;

  if (hasHome || hasAway) {
    if (!hasHome || !hasAway) {
      Alert.alert(
        "SkorLig",
        "Skor tahmini için her iki alana da sayı girin veya ikisini de boş bırakın."
      );
      return;
    }
    const hh = Number(homeScore);
    const aa = Number(awayScore);
    if (!Number.isFinite(hh) || !Number.isFinite(aa)) {
      Alert.alert("SkorLig", "Skor alanlarına sayı girin.");
      return;
    }
    h = hh;
    a = aa;
  }

  const body: any = {
    fixtureId: fx,
    userId: uid,
  };

  if (outcome !== null) body.outcome = outcome;
  if (firstGoal !== null) body.firstGoal = firstGoal;
  if (firstHalf !== null) body.firstHalf = firstHalf;

  if (h !== null && a !== null) {
    body.home = h;
    body.away = a;
  }

  if (redAny !== null) body.redAny = redAny;
  if (redAny === true && redSide) body.redSide = redSide;

  if (penaltyAny !== null) body.penaltyAny = penaltyAny;
  if (penaltyAny === true && penaltySide) body.penaltySide = penaltySide;

  try {
    setSending(true);

    const res = await apiFetch(`/api/pred/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const rawText = await res.text();
    let j: any = null;

    try {
      j = rawText ? JSON.parse(rawText) : null;
    } catch {
      Alert.alert(
        "Hata",
        `Sunucudan beklenmeyen cevap geldi:\n\n${rawText.slice(0, 300)}`
      );
      return;
    }

    if (!res.ok || !j?.ok) {
      Alert.alert("Hata", j?.error || `TAHMIN_KAYIT_HATASI (HTTP ${res.status})`);
      return;
    }

    await Promise.all([loadWalletSummary(uid), checkExistingPrediction(fx, uid)]);

    router.replace({ pathname: "/(tabs)/live", params: { tab: "open" } });
  } catch (e: any) {
    Alert.alert("Hata", String(e?.message || e));
  } finally {
    setSending(false);
  }
}

return (
  <ScrollView
    style={{ flex: 1, backgroundColor: Colors.bg }}
    contentContainerStyle={{ padding: 16, gap: 12 }}
  >
    {/* ===== MAÇ BAŞLIK KARTI ===== */}
    {(paramHome || nextMatch?.home) ? (
      <View style={{ borderRadius: 14, backgroundColor: "#0f172a", borderWidth: 1, borderColor: "#1e3a5f", padding: 16, alignItems: "center", gap: 4 }}>
        <Text style={{ color: "#94a3b8", fontSize: 10, fontWeight: "700", letterSpacing: 1 }}>
          {(paramLeague || nextMatch?.home) ? (paramLeague || "") : "MAÇ"}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 }}>
          <Text style={{ color: "#f1f5f9", fontWeight: "800", fontSize: 16, flex: 1, textAlign: "right" }} numberOfLines={1}>
            {paramHome || nextMatch?.home}
          </Text>
          <View style={{ backgroundColor: "#1e293b", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ color: "#64748b", fontWeight: "900", fontSize: 13 }}>VS</Text>
          </View>
          <Text style={{ color: "#f1f5f9", fontWeight: "800", fontSize: 16, flex: 1, textAlign: "left" }} numberOfLines={1}>
            {paramAway || nextMatch?.away}
          </Text>
        </View>
        {(paramKickoff || nextMatch?.kickoffISO) ? (
          <Text style={{ color: "#60a5fa", fontSize: 12, fontWeight: "600", marginTop: 4 }}>
            🕐 {new Date(paramKickoff || nextMatch?.kickoffISO || "").toLocaleString("tr-TR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </Text>
        ) : null}

        {/* Duello butonu */}
        {fixtureId ? (
          <TouchableOpacity
            onPress={() => router.push({
              pathname: "/duel/[fixtureId]",
              params: {
                fixtureId,
                home: paramHome || nextMatch?.home || "",
                away: paramAway || nextMatch?.away || "",
                league: paramLeague || "",
                kickoffISO: paramKickoff || nextMatch?.kickoffISO || "",
              },
            })}
            style={{
              marginTop: 6, flexDirection: "row", alignItems: "center", gap: 6,
              backgroundColor: "#1e293b", borderRadius: 999,
              paddingHorizontal: 14, paddingVertical: 7, alignSelf: "center",
            }}
          >
            <Text style={{ fontSize: 14 }}>⚔️</Text>
            <Text style={{ color: "#f59e0b", fontWeight: "700", fontSize: 12 }}>Duello Modu</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    ) : (
      <Text style={{ fontSize: 20, fontWeight: "800", color: Colors.slate900, marginBottom: 4 }}>
        Tahmin Gönder
      </Text>
    )}

    {/* ===== ANALİZ KARTI ===== */}
    <View style={{ borderRadius: 14, backgroundColor: "#0f172a", borderWidth: 1, borderColor: "#1e3a5f", overflow: "hidden" }}>
      {/* Community dağılımı */}
      {communityStats && communityStats.total >= 2 ? (() => {
        const { total, H, D, A } = communityStats;
        const pct = (n: number) => total > 0 ? Math.round(n / total * 100) : 0;
        const oddsFmt = (n: number) => total > 0 && n > 0 ? (total / n).toFixed(2) : "—";
        const cols = [
          { label: "Ev Kazanır", key: "H" as const, n: H, color: "#3b82f6" },
          { label: "Berabere", key: "D" as const, n: D, color: "#f59e0b" },
          { label: "Dep Kazanır", key: "A" as const, n: A, color: "#ef4444" },
        ];
        return (
          <View style={{ padding: 12, gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: "#94a3b8", fontSize: 10, fontWeight: "700", letterSpacing: 1 }}>TOPLULUK TAHMİNİ</Text>
              <Text style={{ color: "#475569", fontSize: 10 }}>{total} katılımcı</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {cols.map(({ label, key, n, color }) => {
                const p = pct(n);
                const isSelected = outcome === key;
                const mult = getOutcomeMultiplier(key);
                const estPts = fmtPts(3 * mult);
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setOutcome(cur => cur === key ? null : key)}
                    style={{
                      flex: 1,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: isSelected ? color : "#1e293b",
                      backgroundColor: isSelected ? color + "22" : "#0f172a",
                      padding: 8,
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    <Text style={{ color, fontWeight: "900", fontSize: 15 }}>+{estPts}</Text>
                    <Text style={{ color: "#475569", fontSize: 9 }}>puan</Text>
                    <View style={{ width: "100%", height: 4, borderRadius: 2, backgroundColor: "#1e293b" }}>
                      <View style={{ width: `${p}%` as any, height: 4, borderRadius: 2, backgroundColor: color }} />
                    </View>
                    <Text style={{ color: "#94a3b8", fontSize: 10, fontWeight: "600" }}>{p}%</Text>
                    <Text style={{ color: "#64748b", fontSize: 9 }} numberOfLines={1}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      })() : (
        <View style={{ padding: 12 }}>
          <Text style={{ color: "#94a3b8", fontSize: 10, fontWeight: "700", letterSpacing: 1 }}>TAHMİN ANALİZİ</Text>
        </View>
      )}

      {/* Ayırıcı */}
      <View style={{ height: 1, backgroundColor: "#1e293b", marginHorizontal: 12 }} />

      {/* Puan tablosu */}
      <View style={{ padding: 12, gap: 6 }}>
        <Text style={{ color: "#94a3b8", fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 2 }}>PUAN REHBERİ</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {(() => {
            const hasScore = homeScore.trim() !== "" && awayScore.trim() !== "";
            const scoreMult = hasScore ? getScoreMultiplier(homeScore.trim(), awayScore.trim()) : 1.0;
            const scoreWin = hasScore ? `+${fmtPts(12 * scoreMult)}` : "+12×";
            const outMult = outcome ? getOutcomeMultiplier(outcome) : 1.0;
            const outWin = outcome ? `+${fmtPts(3 * outMult)}` : "+3×";
            return [
              { label: "Sonuç (1X2)", win: outWin, lose: "-1", highlight: outcome !== null },
              { label: "Tam Skor", win: scoreWin, lose: "-0.1", highlight: hasScore },
              { label: "İlk Gol", win: "+1", lose: "-0.2", highlight: firstGoal !== null },
              { label: "İlk Yarı", win: "+2", lose: "-0.4", highlight: firstHalf !== null },
              { label: "Kırmızı K.", win: "+1.5", lose: "-0.3", highlight: redAny !== null },
              { label: "Penaltı", win: "+1.5", lose: "-0.3", highlight: penaltyAny !== null },
            ];
          })().map(({ label, win, lose, highlight }) => (
            <View key={label} style={{
              flexDirection: "row", alignItems: "center", gap: 4,
              backgroundColor: highlight ? "#1e3a5f" : "#1e293b",
              borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
              borderWidth: highlight ? 1 : 0, borderColor: "#3b82f644",
            }}>
              <Text style={{ color: highlight ? "#cbd5e1" : "#94a3b8", fontSize: 10 }}>{label}</Text>
              <Text style={{ color: "#4ade80", fontSize: 10, fontWeight: "700" }}>{win}</Text>
              <Text style={{ color: "#64748b", fontSize: 10 }}>/</Text>
              <Text style={{ color: "#f87171", fontSize: 10 }}>{lose}</Text>
            </View>
          ))}
        </View>
        <Text style={{ color: "#475569", fontSize: 10, marginTop: 2 }}>
          × = topluluk nadir/kolay çarpanı · Ülke katsayısı da uygulanır
        </Text>
      </View>

      {/* Seçime göre potansiyel */}
      {sel.count > 0 && (
        <>
          <View style={{ height: 1, backgroundColor: "#1e293b", marginHorizontal: 12 }} />
          <View style={{ padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: "#94a3b8", fontSize: 11 }}>
              {sel.count} seçim
            </Text>
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={{ color: "#64748b", fontSize: 10 }}>✓ Kazanç</Text>
                <Text style={{ color: "#4ade80", fontWeight: "800", fontSize: 14 }}>+{sel.gain}</Text>
                <Text style={{ color: "#64748b", fontSize: 10 }}>puan</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={{ color: "#64748b", fontSize: 10 }}>✗ Risk</Text>
                <Text style={{ color: "#f87171", fontWeight: "700", fontSize: 13 }}>-{sel.risk}</Text>
                <Text style={{ color: "#64748b", fontSize: 10 }}>puan</Text>
              </View>
            </View>
          </View>
        </>
      )}
    </View>

    {/* Takım picker — sadece URL'den fixture gelmemişse göster */}
    {!paramHome && !fixtureId && (
      <View style={{ marginTop: 4, padding: 12, backgroundColor: "#020617", borderRadius: 12, borderWidth: 1, borderColor: Colors.border, gap: 8 }}>
        <Text style={{ color: "#e5e7eb", fontWeight: "700", fontSize: 13 }}>Takımını seç</Text>
        <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
          {(["GS", "FB", "BJK", "TS"] as TeamCode[]).map((code) => {
            const active = teamCode === code;
            return (
              <TouchableOpacity
                key={code}
                onPress={() => loadNextMatch(code)}
                style={{ flex: 1, paddingVertical: 8, borderRadius: 999, backgroundColor: active ? Colors.accent : Colors.headerBlue }}
              >
                <Text style={{ textAlign: "center", color: active ? "#fff" : Colors.slate900, fontWeight: active ? "700" : "500", fontSize: 12 }}>
                  {TEAM_LABELS[code]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {loadingMatch && (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <ActivityIndicator size="small" />
            <Text style={{ marginLeft: 8, color: Colors.muted, fontSize: 11 }}>Maç aranıyor...</Text>
          </View>
        )}
        {matchError ? <Text style={{ color: Colors.live, fontSize: 11 }}>{matchError}</Text> : null}
      </View>
    )}

      {/* Mini LC Cüzdan şeridi */}
      <View
        style={{
          marginTop: 4,
          padding: 10,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: Colors.border,
          backgroundColor: "#fff",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        {walletLoading ? (
          <>
            <ActivityIndicator size="small" />
            <Text style={{ color: Colors.muted, fontSize: 11, flex: 1 }}>
              LC cüzdanın yükleniyor...
            </Text>
          </>
        ) : wallet ? (
          <>
            <Text style={{ fontSize: 14, fontWeight: "700", color: Colors.accent }}>
              {wallet.user?.balance ?? 0} LC
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: Colors.muted, fontSize: 11 }} numberOfLines={2}>
                Günlük hak: {wallet.daily?.amount ?? 0} LC ·{" "}
                {wallet.daily?.canClaim
                  ? "Bugünkü günlük hakkını almadın."
                  : "Bugünkü günlük hak kullanıldı."}
              </Text>
              {wallet.pricing && (
                <Text
                  style={{ color: Colors.muted, fontSize: 11, marginTop: 2 }}
                  numberOfLines={2}
                >
                  Bu maç için giriş bedeli: {wallet.pricing.matchEntryCost} LC (ilk tahminde
                  kesilir).
                </Text>
              )}
            </View>
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/me",
                  params: { userId },
                })
              }
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: Colors.headerBlue,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: "700", color: Colors.slate900 }}>
                Cüzdan
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={{ color: Colors.muted, fontSize: 11, flex: 1 }}>
            LC cüzdan bilgisi alınamadı. Profil ekranından tekrar deneyebilirsin.
          </Text>
        )}
      </View>

      {/* LC uyarı metni */}
      {mustPayForMatch && (
        <Text
          style={{
            marginTop: 4,
            fontSize: 11,
            color: lcInsufficient ? Colors.live : Colors.muted,
          }}
        >
          Bu maçta ilk tahmin için giriş bedeli {matchCost} LC’dir.{" "}
          {lcInsufficient
            ? `Cüzdan bakiyen (${currentBalance} LC) yetersiz görünüyor.`
            : "Daha önce bu maç için tahmin gönderdiysen, yeni tahminde tekrar LC kesilmez."}
        </Text>
      )}

      {/* 🔒 Client-side kilit banner */}
      {predLock.locked && (
        <View
          style={{
            padding: 10,
            borderRadius: 8,
            backgroundColor: "#fee2e2",
            borderWidth: 1,
            borderColor: "#ef4444",
            marginTop: 8,
          }}
        >
          <Text style={{ color: "#991b1b", fontWeight: "700" }}>Tahmin Kilitli</Text>
          <Text style={{ fontSize: 11, color: "#7f1d1d" }}>
            {predLock.reason === "MATCH_STARTED"
              ? "Maç başladıktan sonra tahmin yapılamaz."
              : "Maç başlamasına 10 dakika kala tahminler kilitlenir."}
          </Text>
        </View>
      )}

      {/* Kullanıcı / Fixture girişleri */}
      <View
        style={{
          padding: 12,
          backgroundColor: "#fff",
          borderRadius: 12,
          borderWidth: 1,
          borderColor: Colors.border,
          gap: 8,
        }}
      >
        <Text style={{ fontWeight: "700" }}>Kullanıcı</Text>
        <View
          style={{
            borderWidth: 1,
            borderColor: Colors.border,
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 8,
            backgroundColor: "#f8fafc",
          }}
        >
          <Text style={{ color: Colors.muted, fontSize: 12 }} numberOfLines={1}>
            {userId}
          </Text>
        </View>

        <Text style={{ fontWeight: "700", marginTop: 8 }}>Fixture ID</Text>
        <TextInput
          value={fixtureId}
          onChangeText={setFixtureId}
          autoCapitalize="none"
          style={{
            borderWidth: 1,
            borderColor: Colors.border,
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 6,
          }}
        />
	
	{/* 🔔 Tahmin Durum Banner */}
	{checkingPred ? (
  	 <View
           style={{
             marginTop: 8,
             padding: 10,
             borderRadius: 8,
             backgroundColor: "#f1f5f9",
             borderWidth: 1,
             borderColor: Colors.border,
           }}
 	 >
           <Text style={{ fontSize: 11, color: Colors.muted }}>
             Tahmin durumu kontrol ediliyor...
           </Text>
         </View>
       ) : hasPredByMe === true ? (
         <View
           style={{
             marginTop: 8,
     	     padding: 10,
     	     borderRadius: 8,
    	     backgroundColor: "#ecfdf5",
     	     borderWidth: 1,
     	     borderColor: "#10b981",
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#065f46" }}>
            ✅ Bu maç için tahminin VAR
   	  </Text>
   	  <Text style={{ fontSize: 11, color: "#047857", marginTop: 2 }}>
      	    Tekrar tahmin gönderirsen LC yeniden kesilmez.
   	  </Text>
 	</View>
       ) : hasPredByMe === false ? (
  	 <View
  	  style={{
    	    marginTop: 8,
     	    padding: 10,
	    borderRadius: 8,
            backgroundColor: "#fffbeb",
            borderWidth: 1,
            borderColor: "#f59e0b",
       }}
      >
       <Text style={{ fontSize: 12, fontWeight: "700", color: "#92400e" }}>
         ⚠️ Bu maç için henüz tahminin YOK
       </Text>
       <Text style={{ fontSize: 11, color: "#b45309", marginTop: 2 }}>
         Gönderdiğinde giriş bedeli uygulanabilir.
       </Text>
     </View>
   ) : null}
   </View>  {/*  
     
      {/* Skor Tahmini (isteğe bağlı) */}
      <View
        style={{
          padding: 12,
          backgroundColor: "#fff",
          borderRadius: 12,
          borderWidth: 1,
          borderColor: Colors.border,
          gap: 8,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontWeight: "700" }}>Skor Tahmini</Text>
          <Text style={{ color: Colors.muted, fontSize: 11 }}>Boş bırakabilirsin</Text>
        </View>

        {/* Hızlı skor butonları */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
        >
          {QUICK_SCORES.map(({ h, a }) => {
            const isActive = homeScore === String(h) && awayScore === String(a);
            return (
              <TouchableOpacity
                key={`${h}-${a}`}
                onPress={() => {
                  if (isActive) {
                    setHomeScore("");
                    setAwayScore("");
                  } else {
                    setHomeScore(String(h));
                    setAwayScore(String(a));
                    if (outcome === null) {
                      setOutcome(h > a ? "H" : h < a ? "A" : "D");
                    }
                  }
                }}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 999,
                  borderWidth: 1.5,
                  borderColor: isActive ? Colors.accent : Colors.border,
                  backgroundColor: isActive ? Colors.accent : "#f8fafc",
                }}
              >
                <Text style={{
                  fontSize: 12,
                  fontWeight: isActive ? "800" : "600",
                  color: isActive ? "#fff" : "#334155",
                }}>
                  {h}-{a}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Manuel skor girişi */}
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: Colors.muted, fontSize: 11, marginBottom: 3 }}>Ev</Text>
            <TextInput
              value={homeScore}
              onChangeText={setHomeScore}
              keyboardType="numeric"
              style={{
                borderWidth: 1,
                borderColor: homeScore !== "" ? Colors.accent : Colors.border,
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 7,
                fontSize: 16,
                fontWeight: "700",
                textAlign: "center",
                backgroundColor: homeScore !== "" ? "#eff6ff" : "#fff",
              }}
            />
          </View>
          <Text style={{ fontSize: 18, fontWeight: "900", color: Colors.muted, marginTop: 16 }}>–</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: Colors.muted, fontSize: 11, marginBottom: 3 }}>Deplasman</Text>
            <TextInput
              value={awayScore}
              onChangeText={setAwayScore}
              keyboardType="numeric"
              style={{
                borderWidth: 1,
                borderColor: awayScore !== "" ? Colors.accent : Colors.border,
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 7,
                fontSize: 16,
                fontWeight: "700",
                textAlign: "center",
                backgroundColor: awayScore !== "" ? "#eff6ff" : "#fff",
              }}
            />
          </View>
          {(homeScore !== "" || awayScore !== "") && (
            <TouchableOpacity
              onPress={() => { setHomeScore(""); setAwayScore(""); }}
              style={{ marginTop: 16, padding: 6 }}
            >
              <Text style={{ fontSize: 16, color: Colors.muted }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Maç Sonucu (H/D/A) */}
      <View
        style={{
          padding: 12,
          backgroundColor: "#fff",
          borderRadius: 12,
          borderWidth: 1,
          borderColor: Colors.border,
          gap: 8,
        }}
      >
        <Text style={{ fontWeight: "700" }}>Maç Sonucu</Text>
        <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
          {(["H", "D", "A"] as Outcome[]).map((v) => {
            const active = outcome === v;
            const labels: any = { H: "Ev kazanır", D: "Berabere", A: "Dep kazanır" };
            return (
              <TouchableOpacity
                key={v ?? "N"}
                onPress={() => setOutcome((cur) => (cur === v ? null : v))}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor: active ? Colors.accent : Colors.headerBlue,
                }}
              >
                <Text
                  style={{
                    textAlign: "center",
                    color: active ? "#fff" : Colors.slate900,
                    fontWeight: active ? "700" : "500",
                    fontSize: 12,
                  }}
                >
                  {labels[v!]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* İlk gol, ilk yarı */}
      <View
        style={{
          padding: 12,
          backgroundColor: "#fff",
          borderRadius: 12,
          borderWidth: 1,
          borderColor: Colors.border,
          gap: 8,
        }}
      >
        <Text style={{ fontWeight: "700" }}>İlk Gol</Text>
        <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
          <TouchableOpacity
            onPress={() => setFirstGoal((cur) => (cur === "H" ? null : "H"))}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: firstGoal === "H" ? Colors.accent : Colors.headerBlue,
            }}
          >
            <Text
              style={{
                textAlign: "center",
                color: firstGoal === "H" ? "#fff" : Colors.slate900,
                fontWeight: firstGoal === "H" ? "700" : "500",
                fontSize: 12,
              }}
            >
              Ev
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFirstGoal((cur) => (cur === "A" ? null : "A"))}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: firstGoal === "A" ? Colors.accent : Colors.headerBlue,
            }}
          >
            <Text
              style={{
                textAlign: "center",
                color: firstGoal === "A" ? "#fff" : Colors.slate900,
                fontWeight: firstGoal === "A" ? "700" : "500",
                fontSize: 12,
              }}
            >
              Dep
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={{ fontWeight: "700", marginTop: 8 }}>İlk Yarı Sonucu</Text>
        <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
          {(["H", "D", "A"] as Outcome[]).map((v) => {
            const active = firstHalf === v;
            const labels: any = { H: "Ev önde", D: "Berabere", A: "Dep önde" };
            return (
              <TouchableOpacity
                key={v || "FH"}
                onPress={() => setFirstHalf((cur) => (cur === v ? null : v))}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor: active ? Colors.accent : Colors.headerBlue,
                }}
              >
                <Text
                  style={{
                    textAlign: "center",
                    color: active ? "#fff" : Colors.slate900,
                    fontWeight: active ? "700" : "500",
                    fontSize: 12,
                  }}
                >
                  {labels[v!]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Kırmızı kart tahmini */}
      <View
        style={{
          padding: 12,
          backgroundColor: "#fff",
          borderRadius: 12,
          borderWidth: 1,
          borderColor: Colors.border,
          gap: 8,
        }}
      >
        <Text style={{ fontWeight: "700" }}>Kırmızı Kart</Text>

        <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
          <TouchableOpacity
            onPress={() =>
              setRedAny((cur) => {
                const next = cur === true ? null : true;
                if (next !== true) setRedSide(null);
                return next;
              })
            }
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: Colors.headerBlue,
            }}
          >
            <Text
              style={{
                textAlign: "center",
                color: redAny === true ? Colors.accent : Colors.slate900,
                fontWeight: redAny === true ? "700" : "500",
              }}
            >
              Kırmızı VAR
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() =>
              setRedAny((cur) => {
                const next = cur === false ? null : false;
                setRedSide(null);
                return next;
              })
            }
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: Colors.headerBlue,
            }}
          >
            <Text
              style={{
                textAlign: "center",
                color: redAny === false ? Colors.accent : Colors.slate900,
                fontWeight: redAny === false ? "700" : "500",
              }}
            >
              Kırmızı YOK
            </Text>
          </TouchableOpacity>
        </View>

        {redAny === true && (
          <>
            <Text style={{ fontWeight: "700", marginTop: 8 }}>Kırmızıyı kim görür?</Text>
            <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
              <TouchableOpacity
                onPress={() => setRedSide((cur) => (cur === "H" ? null : "H"))}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor: redSide === "H" ? Colors.accent : Colors.headerBlue,
                }}
              >
                <Text
                  style={{
                    textAlign: "center",
                    color: redSide === "H" ? "#fff" : Colors.slate900,
                    fontWeight: redSide === "H" ? "700" : "500",
                  }}
                >
                  Ev görür
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setRedSide((cur) => (cur === "A" ? null : "A"))}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor: redSide === "A" ? Colors.accent : Colors.headerBlue,
                }}
              >
                <Text
                  style={{
                    textAlign: "center",
                    color: redSide === "A" ? "#fff" : Colors.slate900,
                    fontWeight: redSide === "A" ? "700" : "500",
                  }}
                >
                  Dep görür
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Penaltı tahmini */}
      <View
        style={{
          padding: 12,
          backgroundColor: "#fff",
          borderRadius: 12,
          borderWidth: 1,
          borderColor: Colors.border,
          gap: 8,
        }}
      >
        <Text style={{ fontWeight: "700" }}>Penaltı Tahmini</Text>

        <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
          <TouchableOpacity
            onPress={() =>
              setPenaltyAny((cur) => {
                const next = cur === true ? null : true;
                if (next !== true) setPenaltySide(null);
                return next;
              })
            }
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: penaltyAny === true ? Colors.accent : Colors.headerBlue,
            }}
          >
            <Text
              style={{
                textAlign: "center",
                color: penaltyAny === true ? "#fff" : Colors.slate900,
                fontWeight: penaltyAny === true ? "700" : "500",
                fontSize: 12,
              }}
            >
              Penaltı VAR
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() =>
              setPenaltyAny((cur) => {
                const next = cur === false ? null : false;
                setPenaltySide(null);
                return next;
              })
            }
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: penaltyAny === false ? Colors.accent : Colors.headerBlue,
            }}
          >
            <Text
              style={{
                textAlign: "center",
                color: penaltyAny === false ? "#fff" : Colors.slate900,
                fontWeight: penaltyAny === false ? "700" : "500",
                fontSize: 12,
              }}
            >
              Penaltı YOK
            </Text>
          </TouchableOpacity>
        </View>

        {penaltyAny === true && (
          <>
            <Text style={{ fontWeight: "700", marginTop: 8 }}>Penaltıyı kim kullanır?</Text>
            <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
              <TouchableOpacity
                onPress={() => setPenaltySide((cur) => (cur === "H" ? null : "H"))}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor: penaltySide === "H" ? Colors.accent : Colors.headerBlue,
                }}
              >
                <Text
                  style={{
                    textAlign: "center",
                    color: penaltySide === "H" ? "#fff" : Colors.slate900,
                    fontWeight: penaltySide === "H" ? "700" : "500",
                    fontSize: 12,
                  }}
                >
                  Ev kullanır
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setPenaltySide((cur) => (cur === "A" ? null : "A"))}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor: penaltySide === "A" ? Colors.accent : Colors.headerBlue,
                }}
              >
                <Text
                  style={{
                    textAlign: "center",
                    color: penaltySide === "A" ? "#fff" : Colors.slate900,
                    fontWeight: penaltySide === "A" ? "700" : "500",
                    fontSize: 12,
                  }}
                >
                  Dep kullanır
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Formu Temizle + Tahmini İptal Et */}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
        <TouchableOpacity
          onPress={clearForm}
          style={{ flex: 1, padding: 12, borderRadius: 999, borderWidth: 1, borderColor: Colors.muted }}
        >
          <Text style={{ textAlign: "center", color: Colors.muted, fontWeight: "700", fontSize: 13 }}>
            🧹 Formu Temizle
          </Text>
        </TouchableOpacity>
        {hasPredByMe && (
          <TouchableOpacity
            onPress={cancelPrediction}
            style={{ flex: 1, padding: 12, borderRadius: 999, borderWidth: 1, borderColor: "#ef4444" }}
          >
            <Text style={{ textAlign: "center", color: "#ef4444", fontWeight: "700", fontSize: 13 }}>
              🗑 Tahmini İptal Et
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Gönder butonu */}
      <TouchableOpacity
        onPress={submitPrediction}
        disabled={sending || lcInsufficient || predLock.locked}
        style={{
          marginTop: 8,
          padding: 14,
          borderRadius: 999,
          backgroundColor:
            sending || lcInsufficient || predLock.locked ? Colors.muted : Colors.primary,
        }}
      >
        <Text
          style={{
            textAlign: "center",
            color: "#fff",
            fontWeight: "800",
            fontSize: 16,
          }}
        >
          {sending
            ? "Gönderiliyor..."
            : predLock.locked
            ? "Tahmin Kilitli"
            : lcInsufficient
            ? "LC Yetersiz"
            : "Tahmini Gönder"}
        </Text>
      </TouchableOpacity>

      {/* ===== TAHMİNİM PANELİ ===== */}
      {myPredDetail && (
        <View style={{ marginTop: 20, borderRadius: 14, borderWidth: 1, borderColor: "#3b82f644", backgroundColor: "#0f1f2a", overflow: "hidden" }}>
          <TouchableOpacity
            onPress={() => setShowMyPred((v) => !v)}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12 }}
          >
            <Text style={{ color: "#3b82f6", fontWeight: "800", fontSize: 14 }}>📋 Mevcut Tahminim</Text>
            <Text style={{ color: "#3b82f6", fontSize: 13 }}>{showMyPred ? "▲" : "▼"}</Text>
          </TouchableOpacity>

          {showMyPred && (() => {
            const d = myPredDetail;
            const oc = String(d.outcome || "").toUpperCase();
            const ocColor = oc === "H" ? "#3b82f6" : oc === "D" ? "#f59e0b" : oc === "A" ? "#ef4444" : "#94a3b8";
            const ocLabel = oc === "H" ? "Ev Sahibi Kazanır" : oc === "D" ? "Beraberlik" : oc === "A" ? "Deplasman Kazanır" : "—";
            const rows: { label: string; value: string; color?: string }[] = [];

            if (oc) rows.push({ label: "Sonuç", value: `${oc} — ${ocLabel}`, color: ocColor });
            if (d.homeScore != null && d.awayScore != null)
              rows.push({ label: "Skor", value: `${d.homeScore} – ${d.awayScore}`, color: "#a3e635" });
            if (d.firstGoal) rows.push({ label: "İlk Gol", value: d.firstGoal === "H" ? "Ev Sahibi" : "Deplasman" });
            if (d.firstHalf) {
              const fh = String(d.firstHalf).toUpperCase();
              rows.push({ label: "İlk Yarı", value: fh === "H" ? "Ev Sahibi" : fh === "D" ? "Beraberlik" : "Deplasman" });
            }
            if (d.redAny != null)
              rows.push({ label: "Kırmızı Kart", value: d.redAny ? (d.redSide === "H" ? "Ev Sahibi'ne" : d.redSide === "A" ? "Deplasana" : "Var") : "Yok", color: d.redAny ? "#ef4444" : "#94a3b8" });
            if (d.penaltyAny != null)
              rows.push({ label: "Penaltı", value: d.penaltyAny ? (d.penaltySide === "H" ? "Ev Sahibi'ne" : d.penaltySide === "A" ? "Deplasana" : "Var") : "Yok", color: d.penaltyAny ? "#f59e0b" : "#94a3b8" });

            return (
              <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 8 }}>
                {rows.map((r) => (
                  <View key={r.label} style={{ flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#1e293b", paddingBottom: 6 }}>
                    <Text style={{ color: "#64748b", fontSize: 13 }}>{r.label}</Text>
                    <Text style={{ color: r.color || "#e2e8f0", fontWeight: "700", fontSize: 13 }}>{r.value}</Text>
                  </View>
                ))}
                {rows.length === 0 && <Text style={{ color: "#64748b", fontSize: 12 }}>Detay bulunamadı.</Text>}
              </View>
            );
          })()}
        </View>
      )}
    </ScrollView>
  );
}
