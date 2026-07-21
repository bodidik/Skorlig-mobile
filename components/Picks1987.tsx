import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet, ScrollView, RefreshControl, Switch,
} from "react-native";
import Constants from "expo-constants";
import { getAuth } from "@react-native-firebase/auth";

const API = Constants.expoConfig?.extra?.apiBase ?? "https://skorlig87.onrender.com";

type Outcome = "H" | "D" | "A";

interface MicroPred {
  outcome:    Outcome | null;
  firstGoal:  "H" | "A" | null;
  firstHalf:  Outcome | null;
  redAny:     boolean | null;
  penaltyAny: boolean | null;
}

interface Pick {
  fixtureId:    string;
  home:         string;
  away:         string;
  kickoffISO:   string;
  league:       string;
  country:      string;
  status:       string;
  score:        { home: number; away: number } | null;
  htScore:      { home: number; away: number } | null;
  open:         boolean;
  minutesUntil: number;
  pred:         MicroPred | null;
  result: {
    outcome:    Outcome;
    score:      { home: number; away: number };
    firstGoal:  string | null;
    redAny:     boolean;
    penaltyAny: boolean;
  } | null;
}

interface LeaderEntry { rank: number; userId: string; points: number; matches: number; correct: number; }

function countdown(min: number) {
  if (min <= 0) return "Başladı";
  if (min < 60) return `${min} dk`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} sa ${m} dk` : `${h} saat`;
}

// ─── MikroPanel ──────────────────────────────────────────────
function MicroPanel({
  pick, draft, setDraft, submitting, onSubmit,
}: {
  pick: Pick;
  draft: MicroPred;
  setDraft: (d: MicroPred) => void;
  submitting: boolean;
  onSubmit: () => void;
}) {
  const set = (key: keyof MicroPred, val: any) => setDraft({ ...draft, [key]: val });
  const isDirty = draft.outcome !== null;

  return (
    <View style={mp.wrap}>
      {/* 1X2 */}
      <Text style={mp.label}>Maç Sonucu</Text>
      <View style={mp.row}>
        {(["H", "D", "A"] as Outcome[]).map(o => {
          const lbl = o === "H" ? `1  ${pick.home.split(" ")[0]}` : o === "D" ? "X  Beraberlik" : `2  ${pick.away.split(" ")[0]}`;
          const on  = draft.outcome === o;
          return (
            <TouchableOpacity key={o} style={[mp.btn, on && mp.btnOn]} onPress={() => set("outcome", on ? null : o)}>
              <Text style={[mp.btnTxt, on && mp.btnTxtOn]}>{lbl}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* İlk gol */}
      <Text style={mp.label}>İlk Golü Kim Atar?</Text>
      <View style={mp.row}>
        {(["H", "A"] as const).map(s => {
          const lbl = s === "H" ? pick.home.split(" ")[0] : pick.away.split(" ")[0];
          const on  = draft.firstGoal === s;
          return (
            <TouchableOpacity key={s} style={[mp.btn, on && mp.btnOn]} onPress={() => set("firstGoal", on ? null : s)}>
              <Text style={[mp.btnTxt, on && mp.btnTxtOn]}>{lbl}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* İlk yarı */}
      <Text style={mp.label}>İlk Yarı Sonucu</Text>
      <View style={mp.row}>
        {(["H", "D", "A"] as Outcome[]).map(o => {
          const lbl = o === "H" ? "1" : o === "D" ? "X" : "2";
          const on  = draft.firstHalf === o;
          return (
            <TouchableOpacity key={o} style={[mp.btn, mp.btnSmall, on && mp.btnOn]} onPress={() => set("firstHalf", on ? null : o)}>
              <Text style={[mp.btnTxt, on && mp.btnTxtOn]}>{lbl}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Toggle'lar */}
      <View style={mp.toggleRow}>
        <View style={mp.toggleItem}>
          <Text style={mp.label}>Kırmızı Kart?</Text>
          <Switch
            value={draft.redAny === true}
            onValueChange={v => set("redAny", draft.redAny === null ? true : draft.redAny === true ? false : null)}
            trackColor={{ true: "#E8102A", false: "#ccc" }}
            thumbColor="#fff"
          />
          <Text style={mp.toggleSub}>{draft.redAny === true ? "Var" : draft.redAny === false ? "Yok" : "—"}</Text>
        </View>
        <View style={mp.toggleItem}>
          <Text style={mp.label}>Penaltı?</Text>
          <Switch
            value={draft.penaltyAny === true}
            onValueChange={v => set("penaltyAny", draft.penaltyAny === null ? true : draft.penaltyAny === true ? false : null)}
            trackColor={{ true: "#E8102A", false: "#ccc" }}
            thumbColor="#fff"
          />
          <Text style={mp.toggleSub}>{draft.penaltyAny === true ? "Var" : draft.penaltyAny === false ? "Yok" : "—"}</Text>
        </View>
      </View>

      {isDirty && (
        <TouchableOpacity style={mp.submit} onPress={onSubmit} disabled={submitting}>
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={mp.submitTxt}>{pick.pred ? "Güncelle" : "Tahmin Gönder"}</Text>
          }
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Ana bileşen ──────────────────────────────────────────────
export default function Picks1987() {
  const [tab,        setTab]        = useState<"picks" | "board">("picks");
  const [picks,      setPicks]      = useState<Pick[]>([]);
  const [board,      setBoard]      = useState<LeaderEntry[]>([]);
  const [myRank,     setMyRank]     = useState<LeaderEntry | null>(null);
  const [total1987,  setTotal1987]  = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded,   setExpanded]   = useState<string | null>(null);
  const [drafts,     setDrafts]     = useState<Record<string, MicroPred>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  const uid = getAuth().currentUser?.uid ?? null;

  const emptyDraft = (): MicroPred => ({
    outcome: null, firstGoal: null, firstHalf: null, redAny: null, penaltyAny: null,
  });

  const fetchPicks = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/weekly-picks${uid ? `?userId=${uid}` : ""}`);
      const j   = await res.json();
      if (j.ok) {
        setPicks(j.picks ?? []);
        // Mevcut tahminleri draft olarak yükle
        const d: Record<string, MicroPred> = {};
        for (const p of j.picks ?? []) {
          if (p.pred) {
            d[p.fixtureId] = {
              outcome:    p.pred.outcome    ?? null,
              firstGoal:  p.pred.firstGoal  ?? null,
              firstHalf:  p.pred.firstHalf  ?? null,
              redAny:     p.pred.redAny     ?? null,
              penaltyAny: p.pred.penaltyAny ?? null,
            };
          } else {
            d[p.fixtureId] = emptyDraft();
          }
        }
        setDrafts(d);
      }
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [uid]);

  const fetchBoard = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/weekly-picks/leaderboard?limit=50${uid ? `&userId=${uid}` : ""}`);
      const j   = await res.json();
      if (j.ok) {
        setBoard(j.items ?? []);
        setMyRank(j.me ?? null);
        setTotal1987(j.total1987 ?? 0);
      }
    } catch {}
  }, [uid]);

  useEffect(() => { fetchPicks(); }, [fetchPicks]);
  useEffect(() => { if (tab === "board") fetchBoard(); }, [tab, fetchBoard]);

  const handleSubmit = async (pick: Pick) => {
    if (!uid) return;
    const draft = drafts[pick.fixtureId];
    if (!draft?.outcome) return;
    setSubmitting(pick.fixtureId);
    try {
      const token = await getAuth().currentUser?.getIdToken();
      await fetch(`${API}/api/weekly-picks/predict`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ fixtureId: pick.fixtureId, ...draft }),
      });
      await fetchPicks();
      setExpanded(null);
    } catch {}
    setSubmitting(null);
  };

  const setDraft = (fid: string, d: MicroPred) =>
    setDrafts(prev => ({ ...prev, [fid]: d }));

  if (loading) return <ActivityIndicator style={{ margin: 32 }} color="#E8102A" />;

  return (
    <View style={s.root}>
      {/* Tab bar */}
      <View style={s.tabs}>
        <TouchableOpacity style={[s.tab, tab === "picks" && s.tabOn]} onPress={() => setTab("picks")}>
          <Text style={[s.tabTxt, tab === "picks" && s.tabTxtOn]}>Maçlar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, tab === "board" && s.tabOn]} onPress={() => setTab("board")}>
          <Text style={[s.tabTxt, tab === "board" && s.tabTxtOn]}>1987 Sıralaması</Text>
        </TouchableOpacity>
      </View>

      {tab === "picks" ? (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchPicks(); }} tintColor="#E8102A" />}
          showsVerticalScrollIndicator={false}
        >
          {picks.length === 0 && (
            <View style={s.empty}>
              <Text style={s.emptyT}>Bu hafta maç bulunamadı</Text>
              <Text style={s.emptyS}>Maçtan 24 saat önce burada görünür</Text>
            </View>
          )}

          {picks.map(pick => {
            const isOpen  = pick.open && pick.status !== "FT";
            const isFT    = pick.status === "FT";
            const isLive  = !isFT && pick.score != null;
            const isExp   = expanded === pick.fixtureId;
            const hasPred = !!pick.pred?.outcome;
            const correct = isFT && pick.pred && pick.result
              ? pick.pred.outcome === pick.result.outcome : null;

            return (
              <View key={pick.fixtureId} style={[s.card, isFT && s.cardDone]}>
                {/* Başlık */}
                <View style={s.cardHead}>
                  <Text style={s.cardLeague}>{pick.country} · {pick.league}</Text>
                  {isLive
                    ? <View style={s.livePill}><Text style={s.liveTxt}>● CANLI</Text></View>
                    : isFT
                    ? <Text style={s.ftLabel}>Bitti</Text>
                    : <Text style={s.cdLabel}>{countdown(pick.minutesUntil)}</Text>
                  }
                </View>

                {/* Takımlar */}
                <View style={s.matchRow}>
                  <Text style={s.team} numberOfLines={1}>{pick.home}</Text>
                  <View style={s.scoreWrap}>
                    {(isLive || isFT) && pick.score
                      ? <Text style={s.score}>{pick.score.home}–{pick.score.away}</Text>
                      : <Text style={s.vs}>VS</Text>
                    }
                    {pick.htScore && <Text style={s.ht}>(İY {pick.htScore.home}-{pick.htScore.away})</Text>}
                  </View>
                  <Text style={[s.team, { textAlign: "right" }]} numberOfLines={1}>{pick.away}</Text>
                </View>

                {/* Tahmin özeti veya buton */}
                {isFT ? (
                  hasPred ? (
                    <View style={[s.predSummary, correct === true ? s.correct : correct === false ? s.wrong : s.neutral]}>
                      <Text style={s.predSummaryTxt}>
                        {correct === true ? "✓ Doğru" : correct === false ? "✗ Yanlış" : "—"}
                        {" · "}
                        {pick.pred!.outcome === "H" ? "Ev Kazanır" : pick.pred!.outcome === "D" ? "Beraberlik" : "Dep Kazanır"}
                        {pick.pred!.firstGoal ? ` · İG: ${pick.pred!.firstGoal === "H" ? pick.home.split(" ")[0] : pick.away.split(" ")[0]}` : ""}
                      </Text>
                    </View>
                  ) : (
                    <Text style={s.noPred}>Tahmin yapılmadı</Text>
                  )
                ) : isOpen ? (
                  <>
                    {hasPred && !isExp && (
                      <View style={s.predSummary}>
                        <Text style={s.predSummaryTxt}>
                          ✓ {pick.pred!.outcome === "H" ? "Ev" : pick.pred!.outcome === "D" ? "Ber." : "Dep"}
                          {pick.pred!.firstGoal ? ` · İG: ${pick.pred!.firstGoal}` : ""}
                          {pick.pred!.firstHalf ? ` · İY: ${pick.pred!.firstHalf}` : ""}
                        </Text>
                      </View>
                    )}
                    <TouchableOpacity
                      style={[s.expandBtn, isExp && s.expandBtnOn]}
                      onPress={() => setExpanded(isExp ? null : pick.fixtureId)}
                    >
                      <Text style={[s.expandTxt, isExp && s.expandTxtOn]}>
                        {isExp ? "Kapat" : hasPred ? "Güncelle" : "Tahmin Yap"}
                      </Text>
                    </TouchableOpacity>

                    {isExp && (
                      <MicroPanel
                        pick={pick}
                        draft={drafts[pick.fixtureId] ?? emptyDraft()}
                        setDraft={d => setDraft(pick.fixtureId, d)}
                        submitting={submitting === pick.fixtureId}
                        onSubmit={() => handleSubmit(pick)}
                      />
                    )}
                  </>
                ) : (
                  <Text style={s.notOpen}>Pencere {countdown(pick.minutesUntil)} sonra açılır</Text>
                )}
              </View>
            );
          })}
          <View style={{ height: 32 }} />
        </ScrollView>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchBoard} tintColor="#E8102A" />}
          showsVerticalScrollIndicator={false}
        >
          <View style={s.boardHead}>
            <Text style={s.boardTitle}>Bu Hafta 1987 Sıralaması</Text>
            <Text style={s.boardSub}>Toplam {total1987.toLocaleString()} üye</Text>
          </View>

          {myRank && (
            <View style={s.myRankCard}>
              <Text style={s.myRankLabel}>Senin Sıran</Text>
              <Text style={s.myRankNum}>#{myRank.rank}</Text>
              <Text style={s.myRankPts}>{myRank.points} puan · {myRank.matches} maç · {myRank.correct} doğru</Text>
            </View>
          )}

          {board.map(row => (
            <View key={row.userId} style={[s.boardRow, row.userId === uid && s.boardRowMe]}>
              <Text style={s.boardRank}>#{row.rank}</Text>
              <Text style={s.boardUser} numberOfLines={1}>{row.userId}</Text>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={s.boardPts}>{row.points} p</Text>
                <Text style={s.boardMatches}>{row.correct}/{row.matches}</Text>
              </View>
            </View>
          ))}

          {board.length === 0 && (
            <View style={s.empty}>
              <Text style={s.emptyT}>Henüz sıralama yok</Text>
              <Text style={s.emptyS}>Bu hafta tahmin yapıldıkça dolacak</Text>
            </View>
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </View>
  );
}

const RED = "#E8102A";

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: "#f5f5f7" },
  tabs:         { flexDirection: "row", backgroundColor: "#fff", borderBottomWidth: 1, borderColor: "#eee" },
  tab:          { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabOn:        { borderBottomWidth: 2, borderColor: RED },
  tabTxt:       { fontSize: 13, color: "#888", fontWeight: "600" },
  tabTxtOn:     { color: RED },

  empty:        { alignItems: "center", paddingTop: 60 },
  emptyT:       { fontSize: 15, fontWeight: "700", color: "#333" },
  emptyS:       { fontSize: 13, color: "#999", marginTop: 6 },

  card:         { backgroundColor: "#fff", borderRadius: 14, marginHorizontal: 12, marginTop: 10, padding: 14, elevation: 1, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  cardDone:     { opacity: 0.8 },
  cardHead:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  cardLeague:   { fontSize: 11, color: "#aaa", fontWeight: "600", textTransform: "uppercase" },
  livePill:     { backgroundColor: RED, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  liveTxt:      { fontSize: 10, color: "#fff", fontWeight: "700" },
  ftLabel:      { fontSize: 11, color: "#aaa" },
  cdLabel:      { fontSize: 12, color: RED, fontWeight: "700" },

  matchRow:     { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  team:         { flex: 1, fontSize: 14, fontWeight: "700", color: "#111" },
  scoreWrap:    { alignItems: "center", minWidth: 64 },
  score:        { fontSize: 20, fontWeight: "800", color: "#111" },
  vs:           { fontSize: 13, color: "#bbb", fontWeight: "600" },
  ht:           { fontSize: 10, color: "#aaa", marginTop: 2 },

  predSummary:  { backgroundColor: "#f0f0f0", borderRadius: 8, padding: 8, marginBottom: 6 },
  correct:      { backgroundColor: "#E8F5E9" },
  wrong:        { backgroundColor: "#FFEBEE" },
  neutral:      { backgroundColor: "#f0f0f0" },
  predSummaryTxt: { fontSize: 12, color: "#333", fontWeight: "600" },
  noPred:       { fontSize: 12, color: "#bbb", textAlign: "center", paddingVertical: 6 },
  notOpen:      { fontSize: 12, color: "#bbb", textAlign: "center", paddingVertical: 8 },

  expandBtn:    { borderRadius: 10, borderWidth: 1.5, borderColor: "#ddd", paddingVertical: 9, alignItems: "center" },
  expandBtnOn:  { borderColor: RED, backgroundColor: "#fff5f5" },
  expandTxt:    { fontSize: 13, fontWeight: "700", color: "#555" },
  expandTxtOn:  { color: RED },

  boardHead:    { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  boardTitle:   { fontSize: 16, fontWeight: "800", color: "#111" },
  boardSub:     { fontSize: 12, color: "#999", marginTop: 2 },

  myRankCard:   { backgroundColor: RED, borderRadius: 14, marginHorizontal: 12, marginVertical: 10, padding: 16, alignItems: "center" },
  myRankLabel:  { fontSize: 11, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: 1 },
  myRankNum:    { fontSize: 36, fontWeight: "900", color: "#fff", marginVertical: 4 },
  myRankPts:    { fontSize: 12, color: "rgba(255,255,255,0.85)" },

  boardRow:     { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", marginHorizontal: 12, marginBottom: 4, borderRadius: 10, padding: 12 },
  boardRowMe:   { borderWidth: 1.5, borderColor: RED },
  boardRank:    { width: 36, fontSize: 13, fontWeight: "800", color: "#888" },
  boardUser:    { flex: 1, fontSize: 13, fontWeight: "600", color: "#111" },
  boardPts:     { fontSize: 13, fontWeight: "800", color: RED },
  boardMatches: { fontSize: 11, color: "#aaa" },
});

const mp = StyleSheet.create({
  wrap:      { marginTop: 10, borderTopWidth: 1, borderColor: "#f0f0f0", paddingTop: 10 },
  label:     { fontSize: 11, color: "#999", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 10 },
  row:       { flexDirection: "row", gap: 6 },
  btn:       { flex: 1, borderRadius: 9, borderWidth: 1.5, borderColor: "#ddd", paddingVertical: 9, alignItems: "center" },
  btnSmall:  { paddingVertical: 7 },
  btnOn:     { backgroundColor: RED, borderColor: RED },
  btnTxt:    { fontSize: 12, fontWeight: "700", color: "#555" },
  btnTxtOn:  { color: "#fff" },
  toggleRow: { flexDirection: "row", gap: 16, marginTop: 10 },
  toggleItem:{ flex: 1, alignItems: "center", gap: 4 },
  toggleSub: { fontSize: 11, color: "#999" },
  submit:    { backgroundColor: RED, borderRadius: 11, paddingVertical: 12, alignItems: "center", marginTop: 14 },
  submitTxt: { fontSize: 14, fontWeight: "800", color: "#fff" },
});
