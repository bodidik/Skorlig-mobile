import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Colors from "../../constants/colors";
import { getApiBase, resetApiBase, syncServerTime, nowFromServer } from "../../lib/apiBase";
import { getAuthHeaders } from "../../lib/apiFetch";
import { useUserId } from "../../lib/useUserId";
import { useAuth } from "../../contexts/AuthContext";
import { sharePrediction } from "../../lib/share";

type Outcome = "H" | "D" | "A" | null;
type Side = "H" | "A" | null;

type TeamCode = "GS" | "FB" | "BJK" | "TS";

/** /api/pred/weights yanıtı — settle'ın kullanacağı çarpanlar. */
type MatchWeights = {
  odds: { home: number; draw: number; away: number };
  outcomeMult: { H: number; D: number; A: number };
  matchDifficulty: number;
  countryWeight: number;
  basePoints: {
    outcome: number; exactScore: number;
    firstGoal: number; firstHalf: number;
    redAny: number; redSide: number;
    penaltyAny: number; penaltySide: number;
  };
};

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
  const [matchNote, setMatchNote] = useState<string | null>(null);

  // Seri (streak) durumu
  const [streak, setStreak] = useState<{
    seriesCount: number;
    seriesCumOdds: number;
    activeSeries: boolean;
    bestSeries: number;
    currentTier: { label: string; badge: string | null } | null;
  } | null>(null);

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
  const [justSubmitted, setJustSubmitted] = useState<{ wasUpdate: boolean; gain: number } | null>(null);

  // LC mini şerit durumu
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);

  // Bu maç için daha önce tahmini var mı?
  const [hasPredByMe, setHasPredByMe] = useState<boolean | null>(null);
  const [checkingPred, setCheckingPred] = useState(false);
  const [myPredDetail, setMyPredDetail] = useState<any | null>(null);
  const [showMyPred, setShowMyPred] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);

  // Topluluk istatistikleri (sonuç + skor dağılımı)
  const [communityStats, setCommunityStats] = useState<{
    total: number; H: number; D: number; A: number;
  } | null>(null);
  const [scoreDist, setScoreDist] = useState<Map<string, number>>(new Map());

  // Puanlama ağırlıkları — sunucudan (tek doğruluk kaynağı)
  const [weights, setWeights] = useState<MatchWeights | null>(null);
  const [weightsError, setWeightsError] = useState(false);

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

  // Seri bilgisini çek
  useEffect(() => {
    const uid = userId.trim();
    if (!uid) { setStreak(null); return; }
    let alive = true;
    (async () => {
      try {
        const r = await apiFetch(`/api/live/streak?userId=${encodeURIComponent(uid)}`).then(x => x.json());
        if (alive && r?.ok) {
          setStreak({
            seriesCount: r.seriesCount ?? 0,
            seriesCumOdds: r.seriesCumOdds ?? 0,
            activeSeries: r.activeSeries ?? false,
            bestSeries: r.bestSeries ?? 0,
            currentTier: r.currentTier ?? null,
          });
        }
      } catch {
        if (alive) setStreak(null);
      }
    })();
    return () => { alive = false; };
  }, [userId]);

  // Puanlama ağırlıklarını çek — takım adları belli olur olmaz.
  // Topluluk verisini BEKLEMEZ: odds ilk andan itibaren hazır olduğu için
  // yeni açılmış maçta da doğru puan gösterilir (soğuk başlangıç yok).
  useEffect(() => {
    const fx = String(fixtureId || "").trim();
    const h = paramHome || nextMatch?.home || "";
    const a = paramAway || nextMatch?.away || "";
    if (!fx && (!h || !a)) { setWeights(null); return; }

    let alive = true;
    setWeightsError(false);
    (async () => {
      try {
        const qs = new URLSearchParams();
        if (fx) qs.set("fixtureId", fx);
        if (h) qs.set("home", h);
        if (a) qs.set("away", a);
        // country göndermiyoruz: sunucu fixtureId'den takvimdeki ülkeyi çözüyor

        const r = await apiFetch(`/api/pred/weights?${qs.toString()}`).then((x) => x.json());
        if (!alive) return;
        if (r?.ok && r.basePoints && r.outcomeMult) {
          setWeights(r as MatchWeights);
        } else {
          setWeights(null);
          setWeightsError(true);
        }
      } catch {
        if (alive) { setWeights(null); setWeightsError(true); }
      }
    })();
    return () => { alive = false; };
  }, [fixtureId, paramHome, paramAway, nextMatch?.home, nextMatch?.away]);

  // Admin'in bu maça yazdığı herkese açık notu çek
  useEffect(() => {
    const fx = String(fixtureId || "").trim();
    if (!fx) { setMatchNote(null); return; }
    let alive = true;
    (async () => {
      try {
        const r = await apiFetch(`/api/live/match-notes?ids=${encodeURIComponent(fx)}`).then(x => x.json());
        const n = r?.notes?.[fx]?.note;
        if (alive) setMatchNote(n ? String(n) : null);
      } catch {
        if (alive) setMatchNote(null);
      }
    })();
    return () => { alive = false; };
  }, [fixtureId]);

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

  /**
   * Günlük hakkı BURADAN al — profil sekmesine gitmeden.
   *
   * ⚠️ NEDEN BURADA: bakiye yetmediğinde ekran tam bir çıkmazdı ("bakiye
   * yetersiz" + kapalı buton). Günlük hak yalnızca profil sekmesindeydi, yani
   * kullanıcı: sorunu anla → sekme değiştir → butonu bul → al → maça geri dön.
   * Dört adım, hem de sinirli anında. Engelin çözümü engelin yanında olmalı.
   */
  const [dailyBusy, setDailyBusy] = useState(false);

  async function claimDailyHere() {
    const uid = userId.trim();
    if (!uid || dailyBusy) return;
    setDailyBusy(true);
    try {
      const r = await apiFetch(`/api/rt/lc-wallet/daily-claim`, {
        method: "POST",
        body: JSON.stringify({ userId: uid }),
      });
      const j = await r.json();
      if (j?.ok) {
        await loadWalletSummary(uid);
      } else {
        Alert.alert(
          "SkorLig",
          j?.error === "DAILY_ALREADY_CLAIMED"
            ? "Günlük hakkını bugün zaten aldın. Yarın tekrar."
            : "Günlük hak alınamadı."
        );
      }
    } catch {
      Alert.alert("SkorLig", "Bağlantı kurulamadı.");
    } finally {
      setDailyBusy(false);
    }
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

  /* ── Puan önizlemesi ───────────────────────────────────────────────────────
   * Maç sonucu çarpanı, maç zorluğu ve ülke ağırlığı SUNUCUDAN gelir
   * (/api/pred/weights → services/match-weights.cjs). Burada yeniden
   * hesaplanmaz.
   *
   * NEDEN: Bu ekran bir dönem maç sonucu çarpanını topluluk dağılımından
   * hesaplıyordu, sunucu ise maç oddsından. Farklı girdiler olduğu için
   * ekranda "3 puan" yazarken sunucu 12 puan veriyordu — %823'e varan sapma.
   * Aynı sayıyı iki yerde hesaplamak yerine tek kaynaktan okunuyor.
   *
   * Ağırlıklar gelmediyse gösterim yapılmaz (aşağıda weightsReady) —
   * yanlış sayı göstermek, hiç göstermemekten kötü.
   */
  const BASE = weights?.basePoints ?? null;

  // Skor çarpanı topluluk nadirliğine bağlı: her dokunuşta yerel hesaplanır,
  // formül sunucudaki match-weights.scoreMultiplier ile birebir aynı.
  function getScoreMultiplier(h: string, a: string): number {
    if (!communityStats || communityStats.total < 2) return 1.0;
    const conf = Math.min(1, communityStats.total / 5);
    const n = scoreDist.get(`${h}-${a}`) || 0;
    const fairShare = communityStats.total * 0.05;
    const raw = !n ? 2.5 : fairShare / n;
    const damped = 1 + (raw - 1) * conf;
    return Math.max(0.6, Math.min(2.5, damped));
  }
  function getOutcomeMultiplier(oc: "H" | "D" | "A"): number {
    return weights?.outcomeMult?.[oc] ?? 1.0;
  }
  function fmtPts(n: number) { return Math.round(n * 10) / 10; }

  /**
   * Seçim özeti. `count` ve `risk` ağırlıklardan BAĞIMSIZ hesaplanır —
   * ağırlık isteği başarısız olsa bile kullanıcı tahminini gönderebilmeli.
   * Yalnızca `gain` ağırlık gerektirir; yoksa null döner ve gösterilmez.
   */
  function calcSelection() {
    const hasScore = homeScore.trim() !== "" && awayScore.trim() !== "";
    let risk = 0;
    if (outcome !== null) risk += 1;
    if (hasScore) risk += 0.1;
    if (firstGoal !== null) risk += 0.2;
    if (firstHalf !== null) risk += 0.4;
    if (redAny !== null) risk += 0.3;
    if (redAny === true && redSide !== null) risk += 0.2;
    if (penaltyAny !== null) risk += 0.3;
    if (penaltyAny === true && penaltySide !== null) risk += 0.2;

    const count = (outcome !== null ? 1 : 0) + (hasScore ? 1 : 0) +
      (firstGoal !== null ? 1 : 0) + (firstHalf !== null ? 1 : 0) +
      (redAny !== null ? 1 : 0) + (penaltyAny !== null ? 1 : 0);

    if (!BASE || !weights) return { gain: null as number | null, risk: fmtPts(risk), count };

    const diff = weights.matchDifficulty ?? 1;
    // Sunucu HER KALEMİ ayrı yuvarlayıp topluyor (settle2: Math.round(x*10)/10).
    // Aynı sırayı izlemezsek 0.1'lik sapmalar çıkar.
    let gain = 0;
    if (outcome !== null) gain += fmtPts(BASE.outcome * getOutcomeMultiplier(outcome));
    if (hasScore) gain += fmtPts(BASE.exactScore * getScoreMultiplier(homeScore.trim(), awayScore.trim()));
    // Yan kalemler maç zorluğuyla çarpılır — sunucu da böyle yapıyor
    if (firstGoal !== null)  gain += fmtPts(BASE.firstGoal  * diff);
    if (firstHalf !== null)  gain += fmtPts(BASE.firstHalf  * diff);
    if (redAny !== null)     gain += fmtPts(BASE.redAny     * diff);
    if (redAny === true && redSide !== null)         gain += fmtPts(BASE.redSide     * diff);
    if (penaltyAny !== null) gain += fmtPts(BASE.penaltyAny * diff);
    if (penaltyAny === true && penaltySide !== null) gain += fmtPts(BASE.penaltySide * diff);

    // Toplam ülke/lig ağırlığıyla ölçeklenir (settle2: pts * w)
    gain *= weights.countryWeight ?? 1;

    return { gain: fmtPts(gain), risk: fmtPts(risk), count };
  }
  // Misafir kullanıcı tahmin denediğinde girişe DÖNÜŞTÜR (bkz. aşağıda).
  const { user, signInWithGoogle } = useAuth();

  const sel = calcSelection();

  async function submitPrediction() {
  const fx = fixtureId.trim();
  const uid = userId.trim();
  if (!uid || !user) {
    // ⚠️ MİSAFİRİN NİYET ANI — en değerli dönüşüm noktası.
    // Eski mesaj "FixtureId ve kullanıcı zorunlu." idi: geliştirici jargonu,
    // ne olduğunu söylemiyor, çıkış yolu vermiyor. Giriş duvarı kaldırıldığı
    // için (bkz. app/_layout.tsx) artık buraya gerçekten misafirler geliyor.
    Alert.alert(
      "Tahmin için giriş gerekli",
      "Puanların ve LC'n hesabına kaydedilsin diye giriş yapman gerekiyor. Tek dokunuş.",
      [
        { text: "Şimdi değil", style: "cancel" },
        { text: "Google ile giriş yap", onPress: () => { signInWithGoogle().catch(() => {}); } },
      ]
    );
    return;
  }
  if (!fx) {
    Alert.alert("SkorLig", "Maç bilgisi okunamadı, listeye dönüp tekrar dene.");
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

  // ⚠️ SKOR ARTIK ZORUNLU DEĞİL — en büyük giriş engeliydi.
  //
  // "Galatasaray kazanır" demek isteyen kullanıcı, 2-1 mi 3-1 mi diye
  // uğraşmak zorunda kalıyordu. Skor tahmin edilmesi EN ZOR alan ve tek
  // zorunlu alandı; yani oyuna girmenin bedeli en zor soruyu cevaplamaktı.
  //
  // Zorunluluk yalnızca ARAYÜZDE vardı: backend `/pred/submit` sadece
  // fixtureId + kullanıcı istiyor ve `base` bağımsız bileşenlerin toplamı —
  // sonuç tahmini TEK BAŞINA puan getiriyor (3 × odds çarpanı).
  // Ekonomiye etkisi de sağlıklı: favoride ~3 base (net −1), sürprizde ~7
  // base (net +4). Yani kolay yol otomatik kârlı değil.
  const hasHome = homeScore.trim() !== "";
  const hasAway = awayScore.trim() !== "";
  const skorVar = hasHome && hasAway;

  // Tek kural: BOŞ tahmin gönderilmesin. Sonuç ya da skor, biri yeter.
  if (!skorVar && outcome === null) {
    Alert.alert(
      "SkorLig",
      "En az bir tahmin gir: kazananı seç ya da skor yaz. İkisini birden girersen daha çok puan."
    );
    return;
  }

  let h: number | null = null;
  let a: number | null = null;
  if (skorVar) {
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

  // Skor girilmediyse ALAN HİÇ GÖNDERİLMEZ (null göndermek 0-0 tahmini gibi
  // yorumlanır ve maç yarışında yanlış yere koyar).
  if (h !== null && a !== null) {
    body.home = h;
    body.away = a;
  }
  if (outcome !== null) body.outcome = outcome;
  if (firstGoal !== null) body.firstGoal = firstGoal;
  if (firstHalf !== null) body.firstHalf = firstHalf;

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

    const wasUpdate = hasPredByMe === true;
    const gain = sel.gain;
    setJustSubmitted({ wasUpdate, gain });
  } catch (e: any) {
    Alert.alert("Hata", String(e?.message || e));
  } finally {
    setSending(false);
  }
}

  const hasExtras = firstGoal !== null || firstHalf !== null || redAny !== null || penaltyAny !== null;
  const homeName = paramHome || nextMatch?.home || "Ev";
  const awayName = paramAway || nextMatch?.away || "Dep";
  const hasScore = homeScore.trim() !== "" && awayScore.trim() !== "";

  // Skordan türetilen sonuç (outcome’u override etmez, sadece gösterim için)
  const derivedOutcomeFromScore: Outcome | null = hasScore
    ? (Number(homeScore) > Number(awayScore) ? "H" : Number(homeScore) < Number(awayScore) ? "A" : "D")
    : null;

  // Maç yok → maç listesine yönlendir
  const noMatchContext = !paramHome && !nextMatch?.home && !fixtureId;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}
    >
      {/* ── MAÇ YOK: yönlendirme ── */}
      {noMatchContext && (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 16 }}>
          <Text style={{ fontSize: 40 }}>⚽</Text>
          <Text style={{ color: "#e2e8f0", fontSize: 18, fontWeight: "800", textAlign: "center" }}>
            Tahmin yapmak için önce bir maç seç
          </Text>
          <Text style={{ color: Colors.muted, fontSize: 13, textAlign: "center" }}>
            "Maçlar" sekmesinden oynayacak bir maça tıkla, buraya otomatik gelirsin.
          </Text>
          <TouchableOpacity
            onPress={() => router.replace("/(tabs)/live")}
            style={{ paddingHorizontal: 24, paddingVertical: 13, borderRadius: 999, backgroundColor: Colors.primary }}
          >
            <Text style={{ color: Colors.onAccent, fontWeight: "800", fontSize: 15 }}>Maçlara Git</Text>
          </TouchableOpacity>
        </View>
      )}

      {!noMatchContext && <>
        {/* ── MAÇ BAŞLIĞI ── */}
        <View style={{ borderRadius: 14, backgroundColor: "#0f172a", borderWidth: 1, borderColor: "#1e3a5f", padding: 16, alignItems: "center", gap: 4 }}>
          {paramLeague ? (
            <Text style={{ color: "#94a3b8", fontSize: 10, fontWeight: "700", letterSpacing: 1 }}>
              {paramLeague.toUpperCase()}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 }}>
            <Text style={{ color: "#f1f5f9", fontWeight: "800", fontSize: 16, flex: 1, textAlign: "right" }} numberOfLines={1}>
              {homeName}
            </Text>
            <View style={{ backgroundColor: "#1e293b", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ color: "#64748b", fontWeight: "900", fontSize: 13 }}>VS</Text>
            </View>
            <Text style={{ color: "#f1f5f9", fontWeight: "800", fontSize: 16, flex: 1, textAlign: "left" }} numberOfLines={1}>
              {awayName}
            </Text>
          </View>
          {(paramKickoff || nextMatch?.kickoffISO) ? (
            <Text style={{ color: "#60a5fa", fontSize: 12, fontWeight: "600", marginTop: 4 }}>
              🕐 {new Date(paramKickoff || nextMatch?.kickoffISO || "").toLocaleString("tr-TR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </Text>
          ) : null}
          {fixtureId ? (
            // Üç mod, üç amaç (bkz. docs/ekonomi-tasarim.md §4.2):
            //   Tahmin = puan/sıralama · Havuz = para · Düello = kişisel meydan okuma
            <View style={{ marginTop: 6, flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "center" }}>
              <TouchableOpacity
                onPress={() => router.push({
                  pathname: "/duel/[fixtureId]",
                  params: { fixtureId, home: homeName, away: awayName, league: paramLeague || "", kickoffISO: paramKickoff || nextMatch?.kickoffISO || "" },
                })}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#1e293b", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 }}
              >
                <Text style={{ fontSize: 14 }}>⚔️</Text>
                <Text style={{ color: "#f59e0b", fontWeight: "700", fontSize: 12 }}>Duello Modu</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.push({
                  pathname: "/pool/[fixtureId]",
                  params: { fixtureId },
                })}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#1e293b", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 }}
              >
                <Text style={{ fontSize: 14 }}>💰</Text>
                <Text style={{ color: "#f59e0b", fontWeight: "700", fontSize: 12 }}>Havuz</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {/* ── KİLİT BANNER (en üstte, görünür olsun) ── */}
        {predLock.locked && (
          <View style={{ padding: 12, borderRadius: 10, backgroundColor: "#1a0606", borderWidth: 1, borderColor: "#ef4444", flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ fontSize: 18 }}>🔒</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#fca5a5", fontWeight: "800", fontSize: 13 }}>Tahmin Kilitli</Text>
              <Text style={{ fontSize: 11, color: "#f87171", marginTop: 2 }}>
                {predLock.reason === "MATCH_STARTED"
                  ? "Maç başladıktan sonra tahmin yapılamaz."
                  : "Maç başlamasına 10 dakika kala tahminler kilitlenir."}
              </Text>
            </View>
          </View>
        )}

        {/* ── ADMIN NOTU ── */}
        {matchNote ? (
          <View style={{ flexDirection: "row", gap: 8, borderRadius: 12, backgroundColor: "#1a1600", borderWidth: 1, borderColor: "#ca8a0455", padding: 12 }}>
            <Text style={{ fontSize: 15 }}>📌</Text>
            <Text style={{ flex: 1, color: "#fcd34d", fontSize: 13, lineHeight: 19 }}>{matchNote}</Text>
          </View>
        ) : null}

        {/* ── LC + SERİ ŞERİDİ (tek satır) ── */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 }}>
          {/* Bakiye */}
          <TouchableOpacity
            onPress={() => router.push({ pathname: "/me", params: { userId } })}
            style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#0f172a", borderWidth: 1, borderColor: Colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}
          >
            <Text style={{ fontSize: 13, fontWeight: "800", color: Colors.accent }}>
              {walletLoading ? "…" : `${wallet?.user?.balance ?? 0} LC`}
            </Text>
            {wallet?.daily?.canClaim && (
              <View style={{ backgroundColor: "#f59e0b33", borderRadius: 999, paddingHorizontal: 5, paddingVertical: 1 }}>
                <Text style={{ fontSize: 9, color: "#fbbf24", fontWeight: "700" }}>+{wallet.daily.amount}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* LC yetersiz uyarısı */}
          {lcInsufficient && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
              <Text style={{ fontSize: 11, color: "#f87171", flex: 1 }}>
                Giriş bedeli {matchCost} LC — bakiye yetersiz
              </Text>
              {/* Çıkmazı eyleme çevir: hak varsa tek dokunuş, yoksa ne zaman
                  geleceğini söyle. Sessiz bir "yetersiz" kullanıcıyı kaybettirir. */}
              {wallet?.daily?.canClaim ? (
                <TouchableOpacity
                  onPress={claimDailyHere}
                  disabled={dailyBusy}
                  style={{
                    backgroundColor: Colors.primary, borderRadius: 999,
                    paddingHorizontal: 12, paddingVertical: 5, opacity: dailyBusy ? 0.6 : 1,
                  }}
                >
                  <Text style={{ color: Colors.onAccent, fontWeight: "800", fontSize: 11 }}>
                    {dailyBusy ? "..." : `Günlük +${wallet.daily.amount} LC al`}
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text style={{ fontSize: 10, color: "#64748b" }}>Günlük hak yarın</Text>
              )}
            </View>
          )}

          {/* Seri rozeti */}
          {streak?.activeSeries && streak.seriesCount > 0 && !lcInsufficient && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, flex: 1 }}>
              <Text style={{ fontSize: 14 }}>
                {streak.currentTier?.label === "Durdurulamıyor" ? "💥" : "🔥"}
              </Text>
              <Text style={{ color: streak.currentTier ? "#fbbf24" : "#60a5fa", fontWeight: "800", fontSize: 12 }}>
                {streak.seriesCount} maçlık seri
              </Text>
              {streak.currentTier && (
                <View style={{ backgroundColor: "#f59e0b33", borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ color: "#fbbf24", fontSize: 9, fontWeight: "800" }}>{streak.currentTier.label}</Text>
                </View>
              )}
            </View>
          )}

          {/* Sağa it: yarış takip et (zaten tahmini varsa) */}
          {hasPredByMe && fixtureId && (
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/match-race/[fixtureId]", params: { fixtureId, userId } } as any)}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#065f46", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}
            >
              <Text style={{ fontSize: 11, color: "#a7f3d0", fontWeight: "700" }}>🏁 Yarış</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── ANA TAHMIN KARTI: SKOR + SONUÇ ── */}
        <View style={{ backgroundColor: "#0f172a", borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 10 }}>

          {/* Topluluk çubukları (varsa, kompakt) */}
          {/* 1X2 seçici + tahmini puan.
              Puanlar maç oddsından gelir, topluluk beklemez — yeni açılmış
              maçta da doğru değer görünür (soğuk başlangıç çözümü).
              Topluluk yüzdeleri ise ancak 2+ tahmin varsa anlamlı. */}
          {weights && (() => {
            const total = communityStats?.total ?? 0;
            const showPct = total >= 2;
            const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
            const cols = [
              { key: "H" as const, label: "Ev",  n: communityStats?.H ?? 0, color: "#3b82f6" },
              { key: "D" as const, label: "Ber", n: communityStats?.D ?? 0, color: "#f59e0b" },
              { key: "A" as const, label: "Dep", n: communityStats?.A ?? 0, color: "#ef4444" },
            ];
            return (
              <View style={{ gap: 4 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: "#94a3b8", fontSize: 10, fontWeight: "700", letterSpacing: 0.5 }}>
                    MAÇ SONUCU
                  </Text>
                  <Text style={{ color: "#475569", fontSize: 10 }}>
                    {showPct ? `${total} tahmin` : "ilk tahminlerden biri ol"}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 5 }}>
                  {cols.map(({ key, label, n, color }) => {
                    const p = pct(n);
                    const isSelected = outcome === key;
                    const estPts = fmtPts(
                      (BASE?.outcome ?? 3) * getOutcomeMultiplier(key) * (weights.countryWeight ?? 1)
                    );
                    return (
                      <TouchableOpacity
                        key={key}
                        onPress={() => setOutcome(cur => cur === key ? null : key)}
                        style={{ flex: 1, borderRadius: 8, borderWidth: 1.5, borderColor: isSelected ? color : "#1e293b", backgroundColor: isSelected ? color + "22" : "#0f172a", padding: 7, alignItems: "center", gap: 2 }}
                      >
                        <Text style={{ color, fontWeight: "900", fontSize: 13 }}>+{estPts}</Text>
                        {showPct ? (
                          <>
                            <View style={{ width: "100%", height: 3, borderRadius: 2, backgroundColor: "#1e293b" }}>
                              <View style={{ width: `${p}%` as any, height: 3, borderRadius: 2, backgroundColor: color }} />
                            </View>
                            <Text style={{ color: "#94a3b8", fontSize: 10, fontWeight: "600" }}>{p}% {label}</Text>
                          </>
                        ) : (
                          <Text style={{ color: "#94a3b8", fontSize: 10, fontWeight: "600" }}>{label}</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })()}

          {/* Skor girişi */}
          <View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              {/* Skor artık zorunlu değil — başlık bunu söylemeli, yoksa
                  kullanıcı yine "girmem lazım" sanır. */}
              <Text style={{ fontWeight: "800", color: "#e2e8f0", fontSize: 14 }}>
                Skor Tahmini <Text style={{ fontWeight: "600", color: "#64748b", fontSize: 12 }}>· isteğe bağlı</Text>
              </Text>
              {/* Sonuç chip — skordan türetilmiş */}
              {derivedOutcomeFromScore && (
                <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: derivedOutcomeFromScore === "H" ? "#1d4ed822" : derivedOutcomeFromScore === "D" ? "#92400e22" : "#7f1d1d22", borderWidth: 1, borderColor: derivedOutcomeFromScore === "H" ? "#3b82f644" : derivedOutcomeFromScore === "D" ? "#f59e0b44" : "#ef444444" }}>
                  <Text style={{ fontSize: 10, fontWeight: "800", color: derivedOutcomeFromScore === "H" ? "#60a5fa" : derivedOutcomeFromScore === "D" ? "#fbbf24" : "#f87171" }}>
                    {derivedOutcomeFromScore === "H" ? "Ev kazanır" : derivedOutcomeFromScore === "D" ? "Berabere" : "Dep kazanır"}
                  </Text>
                </View>
              )}
            </View>

            {/* Hızlı skor pilleri */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 4 }}>
              {QUICK_SCORES.map(({ h, a }) => {
                const isActive = homeScore === String(h) && awayScore === String(a);
                return (
                  <TouchableOpacity
                    key={`${h}-${a}`}
                    onPress={() => {
                      if (isActive) { setHomeScore(""); setAwayScore(""); }
                      else {
                        setHomeScore(String(h));
                        setAwayScore(String(a));
                        if (outcome === null) setOutcome(h > a ? "H" : h < a ? "A" : "D");
                      }
                    }}
                    style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1.5, borderColor: isActive ? Colors.accent : Colors.border, backgroundColor: isActive ? Colors.accent : "#1e293b" }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: isActive ? "800" : "600", color: isActive ? "#fff" : "#cbd5e1" }}>
                      {h}-{a}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Manuel giriş */}
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center", marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.muted, fontSize: 10, marginBottom: 3, textAlign: "center" }}>{homeName}</Text>
                <TextInput
                  value={homeScore}
                  onChangeText={setHomeScore}
                  keyboardType="numeric"
                  style={{ borderWidth: 1.5, borderColor: homeScore !== "" ? Colors.accent : Colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, fontSize: 22, fontWeight: "800", textAlign: "center", color: "#e2e8f0", backgroundColor: homeScore !== "" ? "#0f2040" : "#0a1120" }}
                />
              </View>
              <Text style={{ fontSize: 20, fontWeight: "900", color: "#334155", marginTop: 16 }}>–</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.muted, fontSize: 10, marginBottom: 3, textAlign: "center" }}>{awayName}</Text>
                <TextInput
                  value={awayScore}
                  onChangeText={setAwayScore}
                  keyboardType="numeric"
                  style={{ borderWidth: 1.5, borderColor: awayScore !== "" ? Colors.accent : Colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, fontSize: 22, fontWeight: "800", textAlign: "center", color: "#e2e8f0", backgroundColor: awayScore !== "" ? "#0f2040" : "#0a1120" }}
                />
              </View>
              {hasScore && (
                <TouchableOpacity onPress={() => { setHomeScore(""); setAwayScore(""); }} style={{ padding: 8, marginTop: 16 }}>
                  <Text style={{ fontSize: 16, color: Colors.muted }}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Maç sonucu — yalnızca skor girilmemişse göster */}
          {!hasScore && (
            <View style={{ gap: 6 }}>
              <Text style={{ fontWeight: "700", color: "#94a3b8", fontSize: 12 }}>veya sadece sonuç</Text>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {(["H", "D", "A"] as Outcome[]).map((v) => {
                  const active = outcome === v;
                  const colors = { H: "#3b82f6", D: "#f59e0b", A: "#ef4444" };
                  const labels = { H: "Ev kazanır", D: "Berabere", A: "Dep kazanır" };
                  return (
                    <TouchableOpacity
                      key={v!}
                      onPress={() => setOutcome(cur => cur === v ? null : v)}
                      style={{ flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1.5, borderColor: active ? colors[v!] : "#1e293b", backgroundColor: active ? colors[v!] + "22" : "#0a1120", alignItems: "center" }}
                    >
                      <Text style={{ color: active ? colors[v!] : "#64748b", fontWeight: active ? "800" : "500", fontSize: 12 }}>
                        {labels[v!]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Kazanç özeti (seçim varsa) */}
          {sel.count > 0 && (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 6, borderTopWidth: 1, borderTopColor: "#1e293b" }}>
              <Text style={{ color: "#64748b", fontSize: 11 }}>{sel.count} seçim</Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                {sel.gain !== null ? (
                  <Text style={{ color: "#4ade80", fontWeight: "900", fontSize: 15 }}>+{sel.gain} <Text style={{ fontWeight: "400", fontSize: 11, color: "#64748b" }}>puan</Text></Text>
                ) : (
                  <Text style={{ color: "#64748b", fontSize: 11 }}>puan hesaplanıyor…</Text>
                )}
                <Text style={{ color: "#f87171", fontWeight: "700", fontSize: 13 }}>-{sel.risk} <Text style={{ fontWeight: "400", fontSize: 11, color: "#64748b" }}>risk</Text></Text>
              </View>
            </View>
          )}
        </View>

        {/* ── GÖNDER BUTONU ── en üstte, skorun hemen altında ── */}
        {!justSubmitted && (
          <TouchableOpacity
            onPress={submitPrediction}
            disabled={sending || lcInsufficient || predLock.locked || sel.count === 0}
            style={{
              padding: 16, borderRadius: 999,
              backgroundColor: sending || lcInsufficient || predLock.locked || sel.count === 0 ? "#1e293b" : Colors.primary,
            }}
          >
            <Text style={{ textAlign: "center", fontWeight: "800", fontSize: 16, color: sending || lcInsufficient || predLock.locked || sel.count === 0 ? Colors.muted : Colors.onAccent }}>
              {sending ? "Gönderiliyor…"
                : predLock.locked ? "🔒 Tahmin Kilitli"
                : lcInsufficient ? "LC Yetersiz"
                : sel.count === 0 ? "Kazananı seç ya da skor gir"
                : hasPredByMe
                  ? (sel.gain !== null ? `Tahmini Güncelle  +${sel.gain} puana kadar` : "Tahmini Güncelle")
                  : (sel.gain !== null ? `Tahmini Gönder  +${sel.gain} puana kadar` : "Tahmini Gönder")}
            </Text>
          </TouchableOpacity>
        )}

        {/* İkincil eylemler */}
        {!justSubmitted && (
          <View style={{ flexDirection: "row", gap: 6, justifyContent: "center" }}>
            {sel.count > 0 && (
              <TouchableOpacity onPress={clearForm} style={{ paddingHorizontal: 14, paddingVertical: 8 }}>
                <Text style={{ color: Colors.muted, fontWeight: "600", fontSize: 12 }}>🧹 Temizle</Text>
              </TouchableOpacity>
            )}
            {hasPredByMe && (
              <TouchableOpacity onPress={cancelPrediction} style={{ paddingHorizontal: 14, paddingVertical: 8 }}>
                <Text style={{ color: "#f87171", fontWeight: "600", fontSize: 12 }}>🗑 İptal et</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── EKSTRA TAHMİNLER ACCORDION ── */}
        <View style={{ backgroundColor: "#0f172a", borderRadius: 14, borderWidth: 1, borderColor: hasExtras ? "#2563eb55" : Colors.border, overflow: "hidden" }}>
          <TouchableOpacity
            onPress={() => setExtrasOpen(v => !v)}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 14 }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ color: "#e2e8f0", fontWeight: "700", fontSize: 13 }}>Ekstra Tahminler</Text>
              <Text style={{ color: "#64748b", fontSize: 11 }}>isteğe bağlı · +6 puana kadar</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {hasExtras && (
                <View style={{ backgroundColor: "#2563eb33", borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Text style={{ color: "#60a5fa", fontSize: 10, fontWeight: "800" }}>seçildi</Text>
                </View>
              )}
              <Text style={{ color: "#64748b", fontSize: 14 }}>{extrasOpen ? "▲" : "▼"}</Text>
            </View>
          </TouchableOpacity>

          {extrasOpen && (
            <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 12, borderTopWidth: 1, borderTopColor: "#1e293b" }}>
              {/* İlk Gol */}
              <View style={{ gap: 6, marginTop: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontWeight: "700", color: "#e2e8f0", fontSize: 13 }}>İlk Golü Kim Atar?</Text>
                  <Text style={{ color: "#4ade80", fontSize: 11 }}>+1 puan</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {(["H", "A"] as Side[]).map((v) => (
                    <TouchableOpacity key={v!} onPress={() => setFirstGoal(cur => cur === v ? null : v)}
                      style={{ flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1.5, borderColor: firstGoal === v ? Colors.accent : "#1e293b", backgroundColor: firstGoal === v ? "#1d4ed822" : "#0a1120", alignItems: "center" }}>
                      <Text style={{ color: firstGoal === v ? "#60a5fa" : "#64748b", fontWeight: firstGoal === v ? "800" : "500", fontSize: 12 }}>
                        {v === "H" ? homeName : awayName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* İlk Yarı */}
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontWeight: "700", color: "#e2e8f0", fontSize: 13 }}>İlk Yarı Sonucu</Text>
                  <Text style={{ color: "#4ade80", fontSize: 11 }}>+2 puan</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {(["H", "D", "A"] as Outcome[]).map((v) => {
                    const labels = { H: "Ev önde", D: "Berabere", A: "Dep önde" };
                    return (
                      <TouchableOpacity key={v!} onPress={() => setFirstHalf(cur => cur === v ? null : v)}
                        style={{ flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1.5, borderColor: firstHalf === v ? Colors.accent : "#1e293b", backgroundColor: firstHalf === v ? "#1d4ed822" : "#0a1120", alignItems: "center" }}>
                        <Text style={{ color: firstHalf === v ? "#60a5fa" : "#64748b", fontWeight: firstHalf === v ? "800" : "500", fontSize: 12 }}>
                          {labels[v!]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Kırmızı Kart */}
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontWeight: "700", color: "#e2e8f0", fontSize: 13 }}>Kırmızı Kart</Text>
                  <Text style={{ color: "#4ade80", fontSize: 11 }}>+1.5 puan</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {([true, false] as const).map((v) => (
                    <TouchableOpacity key={String(v)} onPress={() => setRedAny(cur => { const n = cur === v ? null : v; if (n !== true) setRedSide(null); return n; })}
                      style={{ flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1.5, borderColor: redAny === v ? (v ? "#ef4444" : Colors.accent) : "#1e293b", backgroundColor: redAny === v ? (v ? "#7f1d1d22" : "#1d4ed822") : "#0a1120", alignItems: "center" }}>
                      <Text style={{ color: redAny === v ? (v ? "#f87171" : "#60a5fa") : "#64748b", fontWeight: redAny === v ? "800" : "500", fontSize: 12 }}>
                        {v ? "Kırmızı VAR" : "Kırmızı YOK"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {redAny === true && (
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {(["H", "A"] as Side[]).map((v) => (
                      <TouchableOpacity key={v!} onPress={() => setRedSide(cur => cur === v ? null : v)}
                        style={{ flex: 1, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: redSide === v ? "#ef4444" : "#1e293b", backgroundColor: redSide === v ? "#7f1d1d22" : "#0a1120", alignItems: "center" }}>
                        <Text style={{ color: redSide === v ? "#f87171" : "#64748b", fontWeight: redSide === v ? "700" : "500", fontSize: 11 }}>
                          {v === "H" ? `${homeName} görür` : `${awayName} görür`}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Penaltı */}
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontWeight: "700", color: "#e2e8f0", fontSize: 13 }}>Penaltı</Text>
                  <Text style={{ color: "#4ade80", fontSize: 11 }}>+1.5 puan</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {([true, false] as const).map((v) => (
                    <TouchableOpacity key={String(v)} onPress={() => setPenaltyAny(cur => { const n = cur === v ? null : v; if (n !== true) setPenaltySide(null); return n; })}
                      style={{ flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1.5, borderColor: penaltyAny === v ? (v ? "#f59e0b" : Colors.accent) : "#1e293b", backgroundColor: penaltyAny === v ? (v ? "#92400e22" : "#1d4ed822") : "#0a1120", alignItems: "center" }}>
                      <Text style={{ color: penaltyAny === v ? (v ? "#fbbf24" : "#60a5fa") : "#64748b", fontWeight: penaltyAny === v ? "800" : "500", fontSize: 12 }}>
                        {v ? "Penaltı VAR" : "Penaltı YOK"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {penaltyAny === true && (
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {(["H", "A"] as Side[]).map((v) => (
                      <TouchableOpacity key={v!} onPress={() => setPenaltySide(cur => cur === v ? null : v)}
                        style={{ flex: 1, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: penaltySide === v ? "#f59e0b" : "#1e293b", backgroundColor: penaltySide === v ? "#92400e22" : "#0a1120", alignItems: "center" }}>
                        <Text style={{ color: penaltySide === v ? "#fbbf24" : "#64748b", fontWeight: penaltySide === v ? "700" : "500", fontSize: 11 }}>
                          {v === "H" ? `${homeName} kullanır` : `${awayName} kullanır`}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Puan rehberi */}
              <View style={{ marginTop: 4, padding: 10, backgroundColor: "#0a1120", borderRadius: 8 }}>
                <Text style={{ color: "#475569", fontSize: 10, marginBottom: 4 }}>💡 Az kişinin tuttuğu sonucu bilirsen daha çok puan kazanırsın</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                  {[
                    { label: "İlk Gol", pts: "+1", risk: "-0.2" },
                    { label: "İlk Yarı", pts: "+2", risk: "-0.4" },
                    { label: "Kırmızı", pts: "+1.5", risk: "-0.3" },
                    { label: "Penaltı", pts: "+1.5", risk: "-0.3" },
                  ].map(({ label, pts, risk }) => (
                    <View key={label} style={{ flexDirection: "row", gap: 3, backgroundColor: "#1e293b", borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3 }}>
                      <Text style={{ color: "#64748b", fontSize: 9 }}>{label}</Text>
                      <Text style={{ color: "#4ade80", fontSize: 9, fontWeight: "700" }}>{pts}</Text>
                      <Text style={{ color: "#f87171", fontSize: 9 }}>{risk}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          )}
        </View>

        {/* ── BAŞARILI GÖNDERİM ── */}
        {justSubmitted && (
          <View style={{ padding: 16, borderRadius: 14, backgroundColor: "#052e16", borderWidth: 1, borderColor: "#22c55e66", gap: 10, alignItems: "center" }}>
            <Text style={{ color: "#4ade80", fontWeight: "900", fontSize: 18 }}>
              {justSubmitted.wasUpdate ? "✅ Güncellendi!" : "🎉 Kaydedildi!"}
            </Text>
            {justSubmitted.gain > 0 && (
              <Text style={{ color: "#86efac", fontSize: 13, textAlign: "center" }}>
                Bu maçtan en fazla <Text style={{ fontWeight: "900" }}>+{justSubmitted.gain} puan</Text> kazanabilirsin.
              </Text>
            )}
            {/* Paylaşım — en görünür yer burası: kullanıcı tahminini yeni
                yaptı, sonucu merak ediyor, rakip arıyor. */}
            <TouchableOpacity
              onPress={() => sharePrediction({
                match: { fixtureId, home: homeName, away: awayName, league: paramLeague || null },
                homeScore, awayScore,
                maxGain: justSubmitted.gain > 0 ? justSubmitted.gain : null,
                userId,
              })}
              style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 999, backgroundColor: Colors.accent }}
            >
              <Text style={{ fontSize: 15 }}>📣</Text>
              <Text style={{ color: Colors.onAccent, fontWeight: "900", fontSize: 14 }}>
                Arkadaşına Meydan Oku
              </Text>
            </TouchableOpacity>

            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              {fixtureId && (
                <TouchableOpacity
                  onPress={() => router.push({ pathname: "/match-race/[fixtureId]", params: { fixtureId, userId } } as any)}
                  style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: "#065f46" }}
                >
                  <Text style={{ color: "#a7f3d0", fontWeight: "700", fontSize: 13 }}>🏁 Yarışı Takip Et</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => router.replace({ pathname: "/(tabs)/live", params: { tab: "open" } })}
                style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: "#1e293b" }}
              >
                <Text style={{ color: "#e2e8f0", fontWeight: "700", fontSize: 13 }}>⚽ Maçlara Dön</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── MEVcut TAHMİNİM (kompakt, en altta) ── */}
        {myPredDetail && !justSubmitted && (() => {
          const d = myPredDetail;
          const oc = String(d.outcome || "").toUpperCase();
          const ocLabel = oc === "H" ? "Ev Kazanır" : oc === "D" ? "Beraberlik" : oc === "A" ? "Dep Kazanır" : null;
          const ocColor = oc === "H" ? "#3b82f6" : oc === "D" ? "#f59e0b" : oc === "A" ? "#ef4444" : "#94a3b8";
          return (
            <View style={{ borderRadius: 12, borderWidth: 1, borderColor: "#3b82f622", backgroundColor: "#0f1f2a", overflow: "hidden" }}>
              <TouchableOpacity
                onPress={() => setShowMyPred(v => !v)}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 11 }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: "#3b82f6", fontWeight: "800", fontSize: 13 }}>📋 Mevcut Tahminim</Text>
                  {(d.homeScore != null || d.home != null) && (d.awayScore != null || d.away != null) && (
                    <View style={{ backgroundColor: "#1e3a5f", borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 }}>
                      <Text style={{ color: "#93c5fd", fontSize: 11, fontWeight: "800" }}>{d.homeScore ?? d.home}–{d.awayScore ?? d.away}</Text>
                    </View>
                  )}
                  {ocLabel && <Text style={{ color: ocColor, fontSize: 11, fontWeight: "700" }}>{ocLabel}</Text>}
                </View>
                <Text style={{ color: "#3b82f6", fontSize: 13 }}>{showMyPred ? "▲" : "▼"}</Text>
              </TouchableOpacity>
              {showMyPred && (() => {
                const rows: { label: string; value: string; color?: string }[] = [];
                if (ocLabel) rows.push({ label: "Sonuç", value: `${oc} — ${ocLabel}`, color: ocColor });
                const hs = d.homeScore ?? d.home; const as2 = d.awayScore ?? d.away;
                if (hs != null && as2 != null) rows.push({ label: "Skor", value: `${hs} – ${as2}`, color: "#a3e635" });
                if (d.firstGoal) rows.push({ label: "İlk Gol", value: d.firstGoal === "H" ? homeName : awayName });
                if (d.firstHalf) { const fh = String(d.firstHalf).toUpperCase(); rows.push({ label: "İlk Yarı", value: fh === "H" ? "Ev önde" : fh === "D" ? "Berabere" : "Dep önde" }); }
                if (d.redAny != null) rows.push({ label: "Kırmızı", value: d.redAny ? (d.redSide === "H" ? `${homeName}’e` : d.redSide === "A" ? `${awayName}’a` : "Var") : "Yok", color: d.redAny ? "#ef4444" : "#94a3b8" });
                if (d.penaltyAny != null) rows.push({ label: "Penaltı", value: d.penaltyAny ? (d.penaltySide === "H" ? `${homeName}` : d.penaltySide === "A" ? `${awayName}` : "Var") : "Yok", color: d.penaltyAny ? "#f59e0b" : "#94a3b8" });
                return (
                  <View style={{ paddingHorizontal: 14, paddingBottom: 12, gap: 6, borderTopWidth: 1, borderTopColor: "#1e293b" }}>
                    {rows.map(r => (
                      <View key={r.label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: "#1e293b11" }}>
                        <Text style={{ color: "#64748b", fontSize: 12 }}>{r.label}</Text>
                        <Text style={{ color: r.color || "#e2e8f0", fontWeight: "700", fontSize: 12 }}>{r.value}</Text>
                      </View>
                    ))}
                  </View>
                );
              })()}
            </View>
          );
        })()}
      </>}
    </ScrollView>
  );
}
