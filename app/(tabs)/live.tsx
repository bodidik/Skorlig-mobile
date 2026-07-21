import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useUserId } from "../../lib/useUserId";
import { useFocusEffect } from "@react-navigation/native";
import Colors from "../../constants/colors";
import { getApiBase, syncServerTime, nowFromServer } from "../../lib/apiBase";
import { getAuthHeaders } from "../../lib/apiFetch";
import DailyMenuStrip from "../../components/DailyMenuStrip";
import QuickPlaySection from "../../components/QuickPlaySection";
import TournamentCreate from "../../components/TournamentCreate";
import TournamentJoin from "../../components/TournamentJoin";
import Picks1987 from "../../components/Picks1987";

type FxStatus = "NS" | "LIVE" | "HT" | "FT" | "PEN" | "ABANDONED";

type Fx = {
  fixtureId: string;
  home: string;
  away: string;

  kickoffISO?: string | null;
  kickoffDate?: string | null;

  minute?: number | null;
  status?: FxStatus | string | null;

  score?: { home?: number | null; away?: number | null } | null;
  homeGoals?: number | null;
  awayGoals?: number | null;

  lock?: boolean | null;
  lockAtISO?: string | null;

  league?: string | null;
  country?: string | null;
  source?: string | null;
};

type OpenWindow = { backH?: number; fwdH?: number };
type WindowDays = { backDays?: number; fwdDays?: number };

type RuntimeMode = {
  profile?: string;
  maxTeams?: number | null;
  maxLeagues?: number | null;
  notes?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

type Live2Resp = {
  ok: boolean;
  error?: string | null;

  fixtures?: Fx[];
  items?: Fx[];
  count?: number;

  window?: OpenWindow;
  lockBeforeMin?: number;

  windowDays?: WindowDays;

  runtimeMode?: RuntimeMode;
  cap?: number;
};

type Mode = "schedule" | "open" | "mine" | "tournaments" | "gs1987";

type MyPredItem = {
  fixtureId: string;
  home: string | null;
  away: string | null;
  kickoffISO: string | null;
  league: string | null;
  status: string | null;
  score: { home: number; away: number } | null;
  pred: {
    outcome: string | null;
    home: number | null;
    away: number | null;
    firstGoal?: "H" | "A" | null;
    firstHalf?: string | null;
    redAny?: boolean | null;
    redSide?: "H" | "A" | null;
    penaltyAny?: boolean | null;
    penaltySide?: "H" | "A" | null;
  } | null;
};

type MiniTournament = {
  code: string;
  name: string;
  members: string[];
  status: string;
  createdAt: string;
  finalized?: boolean;
  winners?: string[];
};

const PREDICT_OPEN_AHEAD_HOURS = 96;
const SCHEDULE_BACK_HOURS = 8;
const SCHEDULE_FWD_DAYS = 60;

function pickList(j: Live2Resp): Fx[] {
  const list = Array.isArray(j.fixtures) ? j.fixtures : Array.isArray(j.items) ? j.items : [];
  return list.filter((x) => String(x?.fixtureId || "").trim().length > 0);
}

function formatDateTR(isoOrDate?: string | null) {
  if (!isoOrDate) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)) {
    const [y, m, d] = isoOrDate.split("-");
    return `${d}/${m}/${y}`;
  }
  try {
    const d = new Date(isoOrDate);
    if (!Number.isFinite(d.getTime())) return "-";
    const dd = d.getDate().toString().padStart(2, "0");
    const mm = (d.getMonth() + 1).toString().padStart(2, "0");
    const yy = d.getFullYear().toString();
    return `${dd}/${mm}/${yy}`;
  } catch {
    return "-";
  }
}

function formatTimeTR(iso?: string | null) {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return null;
    const h = d.getHours().toString().padStart(2, "0");
    const m = d.getMinutes().toString().padStart(2, "0");
    return `${h}:${m}`;
  } catch {
    return null;
  }
}

function kickoffLabel(fx: Fx) {
  const isoOrDate = (fx.kickoffISO as any) || (fx.kickoffDate as any) || null;
  const dateStr = formatDateTR(isoOrDate);
  const timeStr = formatTimeTR(fx.kickoffISO || null);
  if (timeStr) return `${dateStr} ${timeStr}`;
  if (dateStr !== "-") return `${dateStr} • saat belirsiz`;
  return "-";
}

function statusLabel(fx: Fx) {
  const st = String(fx.status || "").toUpperCase();
  if (st === "LIVE") {
    const m = fx.minute ?? null;
    if (typeof m === "number" && m > 0) return `${m}'. dk`;
    return "CANLI";
  }
  if (st === "HT") return "İY";
  if (st === "FT") return "Bitti";
  if (st === "NS") return "Başlamadı";
  if (st === "PEN") return "Penaltılar";
  return st || "-";
}

function scoreText(fx: Fx) {
  const h = fx.score?.home ?? (typeof fx.homeGoals === "number" ? fx.homeGoals : null);
  const a = fx.score?.away ?? (typeof fx.awayGoals === "number" ? fx.awayGoals : null);
  if (typeof h === "number" && typeof a === "number") return `${h} - ${a}`;
  return " - ";
}

// Tahmin detayını okunur çip listesine çevir
function buildPredChips(pred: MyPredItem["pred"]): { label: string; value: string; color: string }[] {
  if (!pred) return [];
  const chips: { label: string; value: string; color: string }[] = [];
  const oc = String(pred.outcome || "").toUpperCase();
  if (oc) {
    const c = oc === "H" ? "#3b82f6" : oc === "D" ? "#f59e0b" : "#ef4444";
    chips.push({ label: "Sonuç", value: oc === "H" ? "Ev" : oc === "D" ? "Beraberlik" : "Deplasman", color: c });
  }
  if (pred.home != null && pred.away != null)
    chips.push({ label: "Skor", value: `${pred.home}–${pred.away}`, color: "#a3e635" });
  if (pred.firstGoal)
    chips.push({ label: "İlk Gol", value: pred.firstGoal === "H" ? "Ev" : "Deplasman", color: "#22d3ee" });
  if (pred.firstHalf) {
    const fh = String(pred.firstHalf).toUpperCase();
    chips.push({ label: "İlk Yarı", value: fh === "H" ? "Ev" : fh === "D" ? "Beraberlik" : "Deplasman", color: "#a78bfa" });
  }
  if (pred.redAny != null)
    chips.push({ label: "🟥 Kırmızı", value: pred.redAny ? (pred.redSide === "H" ? "Ev" : pred.redSide === "A" ? "Deplasman" : "Var") : "Yok", color: pred.redAny ? "#ef4444" : "#64748b" });
  if (pred.penaltyAny != null)
    chips.push({ label: "⚽ Penaltı", value: pred.penaltyAny ? (pred.penaltySide === "H" ? "Ev" : pred.penaltySide === "A" ? "Deplasman" : "Var") : "Yok", color: pred.penaltyAny ? "#f59e0b" : "#64748b" });
  return chips;
}

// Settle sonrası kategori kırılımı: detail -> mini rozetler
// (settle2 detail alanları: outcome, exact, firstGoal, firstHalf, redAny, penaltyAny...)
function buildSettleChips(detail: any): { label: string; pts: number }[] {
  if (!detail) return [];
  const defs: [string, string][] = [
    ["outcome", "MS"],
    ["exact", "Skor"],
    ["firstGoal", "İG"],
    ["firstHalf", "İY"],
    ["redAny", "🟥"],
    ["penaltyAny", "⚽P"],
  ];
  const chips: { label: string; pts: number }[] = [];
  for (const [key, label] of defs) {
    const v = Number(detail[key]);
    if (detail[key] != null && Number.isFinite(v) && v !== 0) {
      chips.push({ label, pts: v });
    }
  }
  return chips;
}

// Tek satırlık settle özeti şeridi (Tahminlerim kartlarının altına)
const SettleSummaryStrip: React.FC<{ points: number; detail: any }> = ({ points, detail }) => {
  const chips = buildSettleChips(detail);
  const posColor = "#22c55e";
  const negColor = "#f87171";
  const total = Number(points) || 0;
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5,
      paddingHorizontal: 10, paddingVertical: 6,
      borderTopWidth: 1, borderTopColor: "#33415555", backgroundColor: "#0f172a",
    }}>
      <View style={{
        paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
        backgroundColor: total >= 0 ? "#14532d55" : "#7f1d1d44",
      }}>
        <Text style={{ color: total >= 0 ? posColor : negColor, fontWeight: "900", fontSize: 12 }}>
          {total > 0 ? "+" : ""}{Math.round(total * 100) / 100} puan
        </Text>
      </View>
      {chips.map((c) => (
        <View key={c.label} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <Text style={{ color: "#64748b", fontSize: 10 }}>{c.label}</Text>
          <Text style={{ color: c.pts > 0 ? posColor : negColor, fontSize: 10, fontWeight: "800" }}>
            {c.pts > 0 ? "✓" : "✗"}{c.pts > 0 ? `+${Math.round(c.pts * 100) / 100}` : Math.round(c.pts * 100) / 100}
          </Text>
        </View>
      ))}
    </View>
  );
};

function parseKickoffMs(isoOrDate?: string | null): number | null {
  if (!isoOrDate) return null;
  const s = String(isoOrDate).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;

  const hasTz = /Z$|[+\-]\d{2}:\d{2}$/.test(s);
  const fixed = hasTz ? s : `${s}Z`;

  const t = new Date(fixed).getTime();
  return Number.isFinite(t) ? t : null;
}

function kickoffMs(fx: Fx): number | null {
  return parseKickoffMs(fx.kickoffISO || null);
}

function isWithinPredictWindow96h(fx: Fx, nowMs: number) {
  const ms = kickoffMs(fx);
  if (ms == null) return false;
  const diff = ms - nowMs;
  if (diff < 0) return false;
  return diff <= PREDICT_OPEN_AHEAD_HOURS * 3600 * 1000;
}

async function fetchWithTimeout(input: RequestInfo, init?: RequestInit, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(input, { ...(init || {}), signal: ctrl.signal });
  } finally {
    clearTimeout(tid);
  }
}

function normalizeApiError(j: any): string {
  const code = String(j?.error || j?.code || "").trim();
  if (!code) return String(j?.detail || "İşlem başarısız");

  if (code === "STATE_NOT_FOUND") return "STATE_NOT_FOUND: Maç state dosyası yok. (Server restart sonrası düzeliyor olabilir.)";
  if (code === "NOT_FINISHED") return "NOT_FINISHED: Maç FT değil. Önce FT gir.";
  if (code === "FIXTURE_REQUIRED" || code === "FIXTURE_ID_REQUIRED") return "FIXTURE_ID_REQUIRED: fixtureId zorunlu.";

  const detail = j?.detail ? ` • ${String(j.detail)}` : "";
  return `${code}${detail}`;
}

type ItemProps = {
  item: Fx;
  mode: Mode;
  onPredict: (fx: Fx) => void;
  onRace: (fx: Fx) => void;
  hasPred: boolean | null | undefined;
  adminMode: boolean;
  selected: boolean;
  onSelect: (fx: Fx) => void;
};

const Item: React.FC<ItemProps> = ({ item, mode, onPredict, onRace, hasPred, adminMode, selected, onSelect }) => {
  const showPredBadge = hasPred === true;
  const st = String(item.status || "").toUpperCase();
  const isLive = st === "LIVE" || st === "HT";
  const isFinished = st === "FT";

  const hasScore =
    (typeof item.score?.home === "number" && typeof item.score?.away === "number") ||
    (typeof item.homeGoals === "number" && typeof item.awayGoals === "number");

  const waitingResult = isFinished && !hasScore;

  const nowMs = nowFromServer();
  const canPredictByLocalRule = !isFinished && isWithinPredictWindow96h(item, nowMs);

  const highlight = mode === "open" ? true : isLive;
  const cardBg = selected ? "#EEF2FF" : isLive ? "#F4FFFB" : "#fff";
  const borderCol = selected ? "#6366F1" : isLive ? Colors.live : highlight ? Colors.headerBlue : Colors.border;

  const showPredLine = mode === "open";
  const predText =
    hasPred === true
      ? "Bu maça tahminin var."
      : hasPred === false
      ? "Henüz bu maçta tahminin yok."
      : "Tahmin durumu yükleniyor...";
  const predColor = hasPred === true ? Colors.accent : Colors.muted;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => {
        if (adminMode) onSelect(item);
      }}
    >
      <View
        style={{
          marginBottom: 10,
          padding: 12,
          borderRadius: 12,
          borderWidth: highlight ? 2 : 1,
          borderColor: borderCol,
          backgroundColor: cardBg,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: Colors.slate900 }} numberOfLines={1}>
                {item.home} - {item.away}
              </Text>

              {adminMode && (
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 999,
                    backgroundColor: "#EEF2FF",
                    borderWidth: 1,
                    borderColor: "#6366F1",
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: "800", color: "#3730A3" }}>
                    ADMIN
                    {selected ? " • SEÇİLİ" : ""}
                  </Text>
                </View>
              )}

              {hasPred === true && (
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 999,
                    backgroundColor: "#ECFDF5",
                    borderWidth: 1,
                    borderColor: "#10B981",
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: "800", color: "#065F46" }}>TAHMİN</Text>
                </View>
              )}
            </View>

            <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
              {kickoffLabel(item)}
              {item.league ? ` • ${item.league}` : ""}
            </Text>
          </View>

          <View style={{ alignItems: "flex-end", minWidth: 72 }}>
            {showPredBadge && (
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 999,
                  backgroundColor: "#ecfdf5",
                  borderWidth: 1,
                  borderColor: "#10b981",
                  marginBottom: 6,
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: "800", color: "#065f46" }}>✓ Tahmin</Text>
              </View>
            )}

            <Text style={{ fontSize: 16, fontWeight: "700", color: isLive ? Colors.live : Colors.slate900 }}>
              {scoreText(item)}
            </Text>
            <Text style={{ color: isLive ? Colors.live : Colors.muted, fontSize: 11, marginTop: 2 }}>
              {statusLabel(item)}
            </Text>
          </View>
        </View>

        {waitingResult && (
          <View style={{ marginTop: 6 }}>
            <Text style={{ color: Colors.muted, fontSize: 11 }}>Sonuç girilmesi bekleniyor.</Text>
          </View>
        )}

        {showPredLine && (
          <View style={{ marginTop: 4 }}>
            <Text style={{ color: predColor, fontSize: 11 }}>{predText}</Text>
          </View>
        )}

        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
          <View style={{ flex: 1 }}>
            {isLive ? (
              <Text style={{ color: Colors.live, fontSize: 11 }}>Canlı maç — skor güncelleniyor.</Text>
            ) : isFinished ? (
              <Text style={{ color: Colors.muted, fontSize: 11 }}>Maç bitti, tahmin kapandı.</Text>
            ) : mode === "open" ? (
              <Text style={{ color: Colors.muted, fontSize: 11 }}>96 saatlik pencere — tahmin açık.</Text>
            ) : canPredictByLocalRule ? (
              <Text style={{ color: Colors.muted, fontSize: 11 }}>Tahmin açık (96s kuralı).</Text>
            ) : (
              <Text style={{ color: Colors.muted, fontSize: 11 }}>Tahmin kapalı (96s kuralı).</Text>
            )}
          </View>

          {!adminMode && !isFinished && (mode === "open" || canPredictByLocalRule) && (
            <TouchableOpacity
              onPress={() => onPredict(item)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: Colors.primary,
                flexDirection: "row",
                alignItems: "center",
                marginLeft: 8,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>⚽ Tahmin Yap</Text>
            </TouchableOpacity>
          )}

          {/* Canlı/biten maçta yarış panosu: anlık sıranı gör */}
          {!adminMode && (isLive || (isFinished && hasScore)) && (
            <TouchableOpacity
              onPress={() => onRace(item)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: isLive ? "#16a34a" : "#334155",
                flexDirection: "row",
                alignItems: "center",
                marginLeft: 8,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>
                {isLive ? "🔥 Canlı Sıralama" : "🏁 Maç Sıralaması"}
              </Text>
            </TouchableOpacity>
          )}

          {adminMode && (
            <TouchableOpacity
              onPress={() => onSelect(item)}
              style={{
                marginLeft: 8,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 8,
                backgroundColor: selected ? "#4f46e5" : "#eef2ff",
                borderWidth: 1,
                borderColor: "#6366f1",
              }}
            >
              <Text style={{ color: selected ? "#fff" : "#3730a3", fontWeight: "800", fontSize: 12 }}>
                {selected ? "✓ Seçili" : "📝 Sonuç Gir"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default function LiveScreen() {
  const router = useRouter();
  const { userId: qUserId, admin: qAdmin, tab: qTab } = useLocalSearchParams<{ userId?: string; admin?: string; tab?: string }>();

  const userId = useUserId(qUserId);
  const adminMode = useMemo(() => String(qAdmin || "").trim() === "1", [qAdmin]);
  const flatListRef = useRef<any>(null);

  useEffect(() => {
    syncServerTime();
  }, []);

  const initialMode = useMemo((): Mode => {
    const t = String(qTab || "").trim();
    if (t === "mine" || t === "tournaments" || t === "open" || t === "gs1987") return t;
    return "open";
  }, [qTab]);
  const [mode, setMode] = useState<Mode>(initialMode);

  const [items, setItems] = useState<Fx[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [baseInfo, setBaseInfo] = useState<string | null>(null);

  const [win, setWin] = useState<OpenWindow | null>(null);
  const [winDays, setWinDays] = useState<WindowDays | null>(null);
  const [cap, setCap] = useState<number | null>(null);
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode | null>(null);
  const [lockBeforeMin, setLockBeforeMin] = useState<number | null>(null);

  const [predFlags, setPredFlags] = useState<Record<string, boolean>>({});
  const [predLoading, setPredLoading] = useState(false);

  const [myPreds, setMyPreds] = useState<{ current: MyPredItem[]; old: MyPredItem[] }>({ current: [], old: [] });
  // fixtureId -> settle sonucu (puan + kategori kırılımı)
  const [settledMap, setSettledMap] = useState<Record<string, { points: number; detail: any }>>({});
  const [myPredsLoading, setMyPredsLoading] = useState(false);
  const [showOldPreds, setShowOldPreds] = useState(false);

  const [myTournaments, setMyTournaments] = useState<MiniTournament[]>([]);
  const [myTournamentsLoading, setMyTournamentsLoading] = useState(false);
  const [publicTournaments, setPublicTournaments] = useState<MiniTournament[]>([]);
  const [publicLoading, setPublicLoading] = useState(false);
  const [joinBusy, setJoinBusy] = useState<string | null>(null);
  const [showCreateTournament, setShowCreateTournament] = useState(false);
  const [showJoinTournament, setShowJoinTournament] = useState(false);

  // 1987GS erişim kapısı
  const [is1987Member, setIs1987Member] = useState(false);
  const [is1987Checking, setIs1987Checking] = useState(false);
  const [gs1987Code, setGs1987Code] = useState("");
  const [gs1987Error, setGs1987Error] = useState<string | null>(null);
  const [gs1987Busy, setGs1987Busy] = useState(false);

  // Kullanıcının yereli (ülke): maç listesi "kendi ülkesi + global yarışlar" olur
  const [userCountry, setUserCountry] = useState<string | null>(null);
  const [countryReady, setCountryReady] = useState(false);

  // ===== ADMIN (inline panel) =====
  const [selectedFid, setSelectedFid] = useState<string | null>(null);
  const selectedFx = useMemo(() => items.find((x) => String(x.fixtureId) === String(selectedFid || "")) || null, [items, selectedFid]);

  const [admStatus, setAdmStatus] = useState<string>("FT");
  const [admMinute, setAdmMinute] = useState<string>("90");
  const [admHome, setAdmHome] = useState<string>("0");
  const [admAway, setAdmAway] = useState<string>("0");
  const [admRedHome, setAdmRedHome] = useState<boolean>(false);
  const [admRedAway, setAdmRedAway] = useState<boolean>(false);
  const [admPenaltyAny, setAdmPenaltyAny] = useState<boolean>(false);
  const [admPenaltySide, setAdmPenaltySide] = useState<"H" | "A" | "">("");

  const [admBusy, setAdmBusy] = useState(false);
  const [admMsg, setAdmMsg] = useState<string | null>(null);

  // Kasa & puan bilgisi
  const [lcBalance, setLcBalance] = useState<number | null>(null);
  const [userPoints, setUserPoints] = useState<number | null>(null);

  // Maç Ekle formu
  const [showAddFx, setShowAddFx] = useState(false);
  const [addHome, setAddHome] = useState("");
  const [addAway, setAddAway] = useState("");
  const [addLeague, setAddLeague] = useState("");
  const [addKickoff, setAddKickoff] = useState(""); // "YYYY-MM-DDTHH:mm"
  const [addMsg, setAddMsg] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  async function apiFetch(path: string, init?: RequestInit) {
    const base = await getApiBase();
    setBaseInfo(base);
    const authH = await getAuthHeaders();
    const p = path.startsWith("/") ? path : `/${path}`;
    return fetchWithTimeout(`${base}${p}`, { ...init, headers: { ...authH, ...(init?.headers as any) } }, 12000);
  }

  async function apiJson(path: string, init?: RequestInit) {
    const r = await apiFetch(path, init);
    const t = await r.text();
    let j: any = null;
    try {
      j = t ? JSON.parse(t) : null;
    } catch {
      j = { ok: false, error: "BAD_JSON", detail: (t || "").slice(0, 240) };
    }
    return j;
  }

  const check1987Membership = useCallback(async () => {
    if (!userId || is1987Member) return;
    setIs1987Checking(true);
    try {
      const j = await apiJson(`/api/users/profile?userId=${userId}`);
      if (j?.ok && (j.profile?.is1987 || j.profile?.segment === "1987")) {
        setIs1987Member(true);
      }
    } catch {}
    setIs1987Checking(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, is1987Member]);

  const submit1987Code = async () => {
    const code = gs1987Code.trim();
    if (!code) return;
    setGs1987Busy(true);
    setGs1987Error(null);
    try {
      const j = await apiJson("/api/weekly-picks/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (j?.ok) {
        setIs1987Member(true);
      } else {
        setGs1987Error(j?.error === "WRONG_CODE" ? "Kod yanlış. Facebook grubundaki kodu dene." : String(j?.error || "Hata oluştu"));
      }
    } catch (e: any) {
      setGs1987Error(e.message || "Bağlantı hatası");
    }
    setGs1987Busy(false);
  };

  const loadSchedule = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cq = userCountry ? `&country=${encodeURIComponent(userCountry)}` : "";
      const r = await apiFetch(`/api/live2/schedule?backH=${SCHEDULE_BACK_HOURS}&fwdDays=${SCHEDULE_FWD_DAYS}${cq}`);
      const j: Live2Resp = await r.json();

      if (!j?.ok) {
        setItems([]);
        setError(String(j?.error || "LIVE2_SCHEDULE_FAILED"));
        setWin(null);
        setWinDays(null);
        setCap(null);
        setRuntimeMode(null);
        setLockBeforeMin(null);
        return;
      }

      const list = pickList(j);
      setItems(list);

      setWin(j?.window ?? null);
      setWinDays(j?.windowDays ?? { backDays: SCHEDULE_BACK_HOURS / 24, fwdDays: SCHEDULE_FWD_DAYS });
      setCap(typeof j?.cap === "number" ? j.cap : null);
      setRuntimeMode(j?.runtimeMode ?? null);
      setLockBeforeMin(typeof j?.lockBeforeMin === "number" ? j.lockBeforeMin : null);

      if (list.length === 0) setError(null);
    } catch (e: any) {
      setError(String(e?.message || e));
      setItems([]);
      setWin(null);
      setWinDays(null);
      setCap(null);
      setRuntimeMode(null);
      setLockBeforeMin(null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userCountry]);

  const loadOpen = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cq = userCountry ? `&country=${encodeURIComponent(userCountry)}` : "";
      const r = await apiFetch(`/api/live2/open?fwdH=${PREDICT_OPEN_AHEAD_HOURS}${cq}`);
      const j: Live2Resp = await r.json();

      if (!j?.ok) {
        setItems([]);
        setError(String(j?.error || "LIVE2_OPEN_FAILED"));
        setWin(j?.window ?? null);
        setWinDays(null);
        setCap(typeof j?.cap === "number" ? j.cap : null);
        setRuntimeMode(j?.runtimeMode ?? null);
        setLockBeforeMin(typeof j?.lockBeforeMin === "number" ? j.lockBeforeMin : null);
        return;
      }

      const list = pickList(j);
      setItems(list);

      setWin(j?.window ?? null);
      setWinDays(null);
      setCap(typeof j?.cap === "number" ? j.cap : null);
      setRuntimeMode(j?.runtimeMode ?? null);
      setLockBeforeMin(typeof j?.lockBeforeMin === "number" ? j.lockBeforeMin : null);

      if (list.length === 0) setError(null);
    } catch (e: any) {
      setError(String(e?.message || e));
      setItems([]);
      setWin(null);
      setWinDays(null);
      setCap(null);
      setRuntimeMode(null);
      setLockBeforeMin(null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userCountry]);

  // Profilden ülke bilgisini çek (yerel görünüm için)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const j = await apiJson(`/api/users/profile?userId=${encodeURIComponent(userId)}`);
        if (!cancelled) {
          setUserCountry(j?.ok && j.profile?.country ? String(j.profile.country) : null);
        }
      } catch {
        if (!cancelled) setUserCountry(null);
      } finally {
        if (!cancelled) setCountryReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const loadUserStats = useCallback(async () => {
    const uid = userId.trim();
    if (!uid) return;
    try {
      const [walletRes, profileRes] = await Promise.all([
        apiFetch(`/api/rt/lc-wallet/summary?userId=${encodeURIComponent(uid)}`).then((r) => r.json()),
        apiFetch(`/api/users/profile?userId=${encodeURIComponent(uid)}`).then((r) => r.json()),
      ]);
      if (walletRes?.ok) setLcBalance(walletRes.user?.balance ?? 0);
      if (profileRes?.ok) setUserPoints(profileRes.profile?.totals ?? profileRes.totals ?? 0);
    } catch {}
  }, [userId]);

  const loadMyPreds = useCallback(async () => {
    const uid = userId.trim();
    if (!uid) return;
    setMyPredsLoading(true);
    try {
      const [j, hist] = await Promise.all([
        apiJson(`/api/pred/my?userId=${encodeURIComponent(uid)}`),
        apiJson(`/api/rt/pred/history?userId=${encodeURIComponent(uid)}&limit=200`).catch(() => null),
      ]);
      setMyPreds({
        current: j?.ok && Array.isArray(j.current) ? j.current : [],
        old:     j?.ok && Array.isArray(j.old)     ? j.old     : [],
      });
      // settle edilmiş maçların puan özeti
      const m: Record<string, { points: number; detail: any }> = {};
      if (hist?.ok && Array.isArray(hist.items)) {
        for (const it of hist.items) {
          const fid = String(it.fixtureId || "").trim();
          if (fid) m[fid] = { points: Number(it.points) || 0, detail: it.detail || null };
        }
      }
      setSettledMap(m);
    } catch {
      setMyPreds({ current: [], old: [] });
    } finally {
      setMyPredsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const loadMyTournaments = useCallback(async () => {
    const uid = userId.trim();
    if (!uid) return;
    setMyTournamentsLoading(true);
    setPublicLoading(true);
    try {
      const [mine, pub] = await Promise.all([
        apiJson(`/api/mini/mine?userId=${encodeURIComponent(uid)}`),
        apiJson(`/api/mini/public?userId=${encodeURIComponent(uid)}`),
      ]);
      setMyTournaments(mine?.ok && Array.isArray(mine.items) ? mine.items : []);
      setPublicTournaments(pub?.ok && Array.isArray(pub.items) ? pub.items : []);
    } catch {
      setMyTournaments([]);
      setPublicTournaments([]);
    } finally {
      setMyTournamentsLoading(false);
      setPublicLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const joinTournament = useCallback(async (code: string) => {
    const uid = userId.trim();
    if (!uid || joinBusy) return;
    setJoinBusy(code);
    try {
      const j = await apiJson("/api/mini/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid, code }),
      });
      if (j?.ok) {
        await loadMyTournaments();
      } else {
        Alert.alert("Hata", j?.error || "Katılınamadı");
      }
    } catch (e: any) {
      Alert.alert("Hata", String(e?.message || e));
    } finally {
      setJoinBusy(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, joinBusy, loadMyTournaments]);

  const load = useCallback(async () => {
    if (mode === "open") return loadOpen();
    if (mode === "mine") return loadMyPreds();
    if (mode === "tournaments") return loadMyTournaments();
    return loadSchedule();
  }, [mode, loadOpen, loadSchedule, loadMyPreds, loadMyTournaments]);

  useEffect(() => {
    if (mode === "mine") { loadMyPreds(); return; }
    if (mode === "tournaments") { loadMyTournaments(); return; }
    if (!countryReady) return;
    (async () => {
      await syncServerTime();
      await load();
    })();
  }, [load, countryReady, mode]);

  // ekran odağa gelince open listesini yenile (predict'ten dönüş dahil)
  useFocusEffect(
    useCallback(() => {
      if (mode === "open" && countryReady) loadOpen();
      loadUserStats();
    }, [mode, countryReady, loadOpen, loadUserStats])
  );

  // 1987GS sekmesine geçince üyelik kontrolü
  useEffect(() => {
    if (mode === "gs1987" && userId) check1987Membership();
  }, [mode, userId, check1987Membership]);

  // pred flags
  useEffect(() => {
    const uid = userId.trim();
    if (!uid || !items.length) {
      setPredFlags({});
      setPredLoading(false);
      return;
    }

    const fixtureIds = Array.from(new Set(items.map((fx) => String(fx.fixtureId || "").trim()).filter(Boolean)));

    if (!fixtureIds.length || fixtureIds.length > 400) {
      setPredFlags({});
      setPredLoading(false);
      return;
    }

    async function loadFlags() {
      try {
        setPredLoading(true);
        const qs = `userId=${encodeURIComponent(uid)}&fixtureIds=${encodeURIComponent(fixtureIds.join(","))}`;
        const r = await apiFetch(`/api/pred/flags?${qs}`);
        const j = await r.json();

        const flags: Record<string, boolean> = {};
        if (j?.ok && Array.isArray(j.fixtures)) {
          const set = new Set(j.fixtures.map((fid: string) => String(fid || "").trim()));
          for (const fid of fixtureIds) flags[fid] = set.has(fid);
        } else {
          for (const fid of fixtureIds) flags[fid] = false;
        }
        setPredFlags(flags);
      } catch {
        const flags: Record<string, boolean> = {};
        for (const fid of fixtureIds) flags[fid] = false;
        setPredFlags(flags);
      } finally {
        setPredLoading(false);
      }
    }

    loadFlags();
  }, [mode, items, userId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await syncServerTime();
    if (mode === "mine") await loadMyPreds();
    else if (mode === "tournaments") await loadMyTournaments();
    else if (mode === "gs1987") { /* Picks1987 kendi içinde yenileme tutar */ }
    else await load();
    setRefreshing(false);
  }, [load, loadMyPreds, loadMyTournaments, mode]);

  const goPredict = (fx: Fx | string) => {
    if (typeof fx === "string") {
      // sadece ID var, ek bilgi yok
      router.push({ pathname: "/(tabs)/predict", params: { fixtureId: fx, userId } });
    } else {
      router.push({
        pathname: "/(tabs)/predict",
        params: {
          fixtureId: String(fx.fixtureId || ""),
          userId,
          home: fx.home || "",
          away: fx.away || "",
          league: fx.league || "",
          kickoffISO: fx.kickoffISO || "",
        },
      });
    }
  };

  const cancelPred = (fixtureId: string) => {
    Alert.alert("Tahmini İptal Et", "Bu maçtaki tahminini silmek istiyor musun?", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil", style: "destructive",
        onPress: async () => {
          try {
            const r = await apiFetch("/api/pred/cancel", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fixtureId, userId }),
            });
            const j = await r.json();
            if (j?.ok) await loadMyPreds();
            else Alert.alert("Hata", j?.error || "Silinemedi");
          } catch (e: any) {
            Alert.alert("Hata", String(e?.message || e));
          }
        },
      },
    ]);
  };

  const goRace = (fx: Fx) => {
    const fid = String(fx.fixtureId || "");
    router.push({ pathname: "/match-race/[fixtureId]", params: { fixtureId: fid, userId } });
  };

  const headerLine2 = useMemo(() => {
    const parts: string[] = [];
    if (mode === "schedule") {
      const bd = winDays?.backH ?? SCHEDULE_BACK_HOURS;
      const fd = winDays?.fwdDays ?? SCHEDULE_FWD_DAYS;
      parts.push(`Liste: -${bd}sa / +${fd}g`);
      parts.push(`Tahmin: +${PREDICT_OPEN_AHEAD_HOURS}h`);
    } else {
      const backH = typeof win?.backH === "number" ? win.backH : null;
      const fwdH = typeof win?.fwdH === "number" ? win.fwdH : null;
      if (backH != null || fwdH != null) parts.push(`Pencere: -${backH ?? "?"}h / +${fwdH ?? "?"}h`);
      parts.push(`Tahmin: +${PREDICT_OPEN_AHEAD_HOURS}h`);
      if (typeof lockBeforeMin === "number") parts.push(`Kilit: ${lockBeforeMin} dk`);
    }

    if (typeof cap === "number") parts.push(`Cap: ${cap}`);
    if (runtimeMode?.profile) parts.push(`Mode: ${runtimeMode.profile}`);
    return parts.join(" • ");
  }, [mode, winDays, win, lockBeforeMin, cap, runtimeMode]);

  // ===== ADMIN helpers =====
  const selectFx = useCallback((fx: Fx) => {
    const fid = String(fx.fixtureId || "").trim();
    if (!fid) return;

    setSelectedFid(fid);
    setAdmMsg(null);
    setTimeout(() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true }), 80);

    const st = String(fx.status || "FT").toUpperCase();
    setAdmStatus(st || "FT");

    const m = fx.minute != null ? String(fx.minute) : st === "FT" ? "90" : "0";
    setAdmMinute(m);

    const h0 = fx.score?.home ?? (typeof fx.homeGoals === "number" ? fx.homeGoals : 0);
    const a0 = fx.score?.away ?? (typeof fx.awayGoals === "number" ? fx.awayGoals : 0);
    setAdmHome(String(typeof h0 === "number" ? h0 : 0));
    setAdmAway(String(typeof a0 === "number" ? a0 : 0));

    // meta alanları schedule listede yok; default false kalsın
    setAdmRedHome(false);
    setAdmRedAway(false);
    setAdmPenaltyAny(false);
    setAdmPenaltySide("");
  }, []);

  async function adminSaveState({ alsoSettle2 = false } = {}) {
    if (!selectedFid) return;
    setAdmBusy(true);
    setAdmMsg(null);

    try {
      const payload: any = {
        fixtureId: selectedFid,
        status: String(admStatus || "FT").toUpperCase(),
        minute: Number(admMinute || 0),
        homeGoals: Number(admHome || 0),
        awayGoals: Number(admAway || 0),
        redHome: !!admRedHome,
        redAway: !!admRedAway,
        penaltyAny: !!admPenaltyAny,
        penaltySide: admPenaltyAny ? (admPenaltySide === "H" || admPenaltySide === "A" ? admPenaltySide : null) : null,
        note: "admin-mobile",
      };

      const j1 = await apiJson(`/api/rt/admin-live-gs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!j1?.ok) {
        setAdmMsg(normalizeApiError(j1));
        return;
      }

      if (!alsoSettle2) {
        setAdmMsg("Kaydedildi.");
        await onRefresh();
        return;
      }

      const j2 = await apiJson(`/api/rt/settle2?fixtureId=${encodeURIComponent(selectedFid)}`, { method: "POST" });
      if (!j2?.ok) {
        setAdmMsg(`FT kaydedildi, settle2 başarısız: ${normalizeApiError(j2)}`);
        await onRefresh();
        return;
      }

      setAdmMsg("FT kaydedildi + settle2 OK.");
      await onRefresh();
    } finally {
      setAdmBusy(false);
    }
  }

  async function adminAddFixture() {
    if (!addHome.trim() || !addAway.trim() || !addKickoff.trim()) {
      setAddMsg("Ev, deplasman ve saat zorunlu");
      return;
    }
    // "YYYY-MM-DDTHH:mm" → ISO +03:00
    const kickoffISO = new Date(addKickoff).toISOString();
    if (isNaN(new Date(addKickoff).getTime())) {
      setAddMsg("Geçersiz tarih/saat formatı");
      return;
    }
    setAddBusy(true);
    setAddMsg(null);
    try {
      const j = await apiJson("/api/rt/admin-fixture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          home: addHome.trim(),
          away: addAway.trim(),
          league: addLeague.trim() || "Diğer",
          country: "World",
          kickoffISO,
        }),
      });
      if (j?.ok) {
        setAddMsg(`✅ ${j.action === "updated" ? "Güncellendi" : "Eklendi"} → ${j.fixtureId}`);
        setAddHome("");
        setAddAway("");
        setAddLeague("");
        setAddKickoff("");
        onRefresh();
      } else {
        setAddMsg(`Hata: ${j?.error || "?"}`);
      }
    } finally {
      setAddBusy(false);
    }
  }

  async function adminRunMatchBoard() {
    if (!selectedFid) return;
    setAdmBusy(true);
    setAdmMsg(null);

    try {
      const j = await apiJson(`/api/rt/pred/match-board?fixtureId=${encodeURIComponent(selectedFid)}`, { method: "GET" });
      if (!j?.ok) {
        setAdmMsg(normalizeApiError(j));
        return;
      }

      const cnt = Array.isArray(j.leaderboard) ? j.leaderboard.length : 0;
      const sc = j.finalScore ? `${j.finalScore.home} - ${j.finalScore.away}` : "-";
      setAdmMsg(`match-board OK • skor: ${sc} • satır: ${cnt}`);
    } finally {
      setAdmBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <FlatList
        ref={flatListRef}
        data={
          mode === "mine" || mode === "tournaments" || mode === "gs1987" ? []  // içerik ListHeaderComponent'te
          : items
        }
        keyExtractor={(it) => String(it.fixtureId || it.code || Math.random())}
        renderItem={({ item }) => {
          // Normal maç
          const fid = String(item.fixtureId || "").trim();
          const hasPred = fid ? predFlags[fid] : null;
          return (
            <Item
              item={item}
              mode={mode}
              onPredict={goPredict}
              onRace={goRace}
              hasPred={hasPred}
              adminMode={adminMode}
              selected={adminMode && !!selectedFid && fid === selectedFid}
              onSelect={selectFx}
            />
          );
        }}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 12 }}>
            {/* ===== HIZLI OYNA ===== */}
            {mode === "open" && (
              <QuickPlaySection country={userCountry} userId={userId} />
            )}
            {/* ===== KASA & PUAN ÇUBUĞU ===== */}
            {(lcBalance !== null || userPoints !== null) && (
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                {lcBalance !== null && (
                  <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#0f2027", borderRadius: 10, borderWidth: 1, borderColor: "#f59e0b55", paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Text style={{ fontSize: 16 }}>💰</Text>
                    <View>
                      <Text style={{ color: "#f59e0b", fontWeight: "900", fontSize: 16 }}>{lcBalance} LC</Text>
                      <Text style={{ color: "#78716c", fontSize: 9 }}>KASA</Text>
                    </View>
                  </View>
                )}
                {userPoints !== null && (
                  <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#0f1f2a", borderRadius: 10, borderWidth: 1, borderColor: "#3b82f655", paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Text style={{ fontSize: 16 }}>⭐</Text>
                    <View>
                      <Text style={{ color: "#3b82f6", fontWeight: "900", fontSize: 16 }}>{userPoints}</Text>
                      <Text style={{ color: "#78716c", fontSize: 9 }}>PUAN</Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            <Text style={{ fontSize: 20, fontWeight: "800", color: Colors.slate900 }}>
              {mode === "mine" ? "📋 Tahminlerim"
                : mode === "tournaments" ? "🏆 Turnuvalarım"
                : mode === "gs1987" ? "🔴 1987GS Modu"
                : mode === "schedule" ? (adminMode ? "Admin • Maçlar" : "Maçlar")
                : (adminMode ? "Admin • Açık Maçlar" : "Açık Maçlar")}
            </Text>

            {runtimeMode?.profile === "PILOT_MANUAL" && (
              <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFF7ED", borderRadius: 10, borderWidth: 1, borderColor: "#FED7AA", paddingHorizontal: 12, paddingVertical: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: "800", color: "#C2410C" }}>✈️ PILOT MODU</Text>
                <Text style={{ flex: 1, fontSize: 11, color: "#9A3412" }}>Provider yok • maçlar elle girilir • max {runtimeMode.maxFixtures ?? 10}</Text>
              </View>
            )}

            <View style={{ marginTop: 10, gap: 6 }}>
              {/* Ana 4 sekme */}
              <View style={{ flexDirection: "row", backgroundColor: Colors.dark, borderRadius: 999, padding: 4 }}>
                {[
                  { key: "schedule" as const, label: "Maçlar" },
                  { key: "open" as const, label: "Açık" },
                  { key: "mine" as const, label: "Benimkiler" },
                  { key: "tournaments" as const, label: "Turnuvalar" },
                ].map((t) => {
                  const active = mode === t.key;
                  return (
                    <TouchableOpacity
                      key={t.key}
                      onPress={() => setMode(t.key)}
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
                          color: active ? "#fff" : Colors.muted,
                          fontWeight: active ? "700" : "500",
                          fontSize: 11,
                        }}
                      >
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* 1987GS özel sekmesi */}
              <TouchableOpacity
                onPress={() => setMode("gs1987")}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  paddingVertical: 9,
                  borderRadius: 999,
                  backgroundColor: mode === "gs1987" ? "#E8102A" : "#1a0a0a",
                  borderWidth: 1.5,
                  borderColor: mode === "gs1987" ? "#E8102A" : "#7f1d1d66",
                }}
              >
                <Text style={{ fontSize: 14 }}>🔴</Text>
                <Text style={{
                  fontSize: 13,
                  fontWeight: "900",
                  color: mode === "gs1987" ? "#fff" : "#c9a227",
                  letterSpacing: 1,
                }}>
                  1987GS MODU
                </Text>
                <Text style={{ fontSize: 12, color: mode === "gs1987" ? "#ffcccc" : "#7f1d1d" }}>
                  {is1987Member ? "✓" : "🔒"}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={{ color: Colors.muted, fontSize: 12, marginTop: 10 }}>
              {headerLine2 ? headerLine2 : "Fikstür bilgisi"}
            </Text>

            {adminMode && (
              <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 2 }}>
                {userId} • API: {baseInfo ?? "—"}
              </Text>
            )}

            <TouchableOpacity
              onPress={() => router.push("/livescores")}
              style={{
                marginTop: 8,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                backgroundColor: "#0f172a",
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "#22c55e44",
                paddingVertical: 7,
                paddingHorizontal: 14,
                alignSelf: "flex-start",
              }}
            >
              <Text style={{ fontSize: 13, color: "#22c55e", fontWeight: "700" }}>🔴 Canlı Sonuçlar</Text>
            </TouchableOpacity>

            {predLoading && (
              <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 2 }}>
                Tahmin işaretleri güncelleniyor...
              </Text>
            )}

            {error && <Text style={{ color: Colors.live, fontSize: 11, marginTop: 4 }}>Hata: {error}</Text>}

            {/* ===== TAHMİNLERİM İÇERİĞİ ===== */}
            {mode === "mine" && (
              <View style={{ gap: 8, marginTop: 4 }}>
                {myPredsLoading && <Text style={{ color: Colors.muted, fontSize: 12 }}>Yükleniyor...</Text>}
                {!myPredsLoading && myPreds.current.length === 0 && myPreds.old.length === 0 && (
                  <Text style={{ color: Colors.muted, fontSize: 13 }}>Henüz tahmin yapmadın.</Text>
                )}

                {myPreds.current.map((mp) => {
                  const isFT = String(mp.status || "").toUpperCase() === "FT";
                  const isLive = ["1H","HT","2H","LIVE"].includes(String(mp.status || "").toUpperCase());
                  const chips = buildPredChips(mp.pred);
                  const oc = mp.pred?.outcome?.toUpperCase();
                  const ocColor = oc === "H" ? "#3b82f6" : oc === "D" ? "#f59e0b" : oc === "A" ? "#ef4444" : "#64748b";
                  const settled = settledMap[String(mp.fixtureId)];
                  return (
                    <View
                      key={mp.fixtureId}
                      style={{ borderRadius: 10, backgroundColor: "#1e2433", borderWidth: 1, borderColor: isLive ? "#22c55e55" : "#334155", overflow: "hidden" }}
                    >
                      {/* tek şerit: maç + tahmin + butonlar */}
                      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 7, gap: 8 }}>
                        {/* sol: takımlar + lig */}
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: "#cbd5e1", fontWeight: "600", fontSize: 12 }} numberOfLines={1}>
                            {mp.home || mp.fixtureId} — {mp.away || ""}
                          </Text>
                          <Text style={{ color: "#64748b", fontSize: 10 }}>
                            {mp.kickoffISO ? new Date(mp.kickoffISO).toLocaleString("tr-TR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" }) : ""}
                            {mp.league ? "  " + mp.league : ""}
                          </Text>
                        </View>

                        {/* tahmin rozeti */}
                        {mp.pred && (oc || mp.pred.home != null) ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            {oc && <View style={{ backgroundColor: ocColor + "33", borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: ocColor + "66" }}>
                              <Text style={{ color: ocColor, fontWeight: "800", fontSize: 11 }}>{oc}</Text>
                            </View>}
                            {mp.pred.home != null && <Text style={{ color: ocColor, fontWeight: "700", fontSize: 11 }}>{mp.pred.home}–{mp.pred.away}</Text>}
                          </View>
                        ) : (
                          <Text style={{ color: "#475569", fontSize: 10, fontStyle: "italic" }}>—</Text>
                        )}

                        {/* status / skor */}
                        <Text style={{ color: isLive ? "#22c55e" : isFT ? "#94a3b8" : "#475569", fontSize: 10, fontWeight: "700", minWidth: 20, textAlign: "right" }}>
                          {mp.score ? `${mp.score.home}-${mp.score.away}` : isLive ? "🔴" : isFT ? "FT" : "NS"}
                        </Text>

                        {/* butonlar */}
                        <TouchableOpacity onPress={() => goPredict({ fixtureId: mp.fixtureId, home: mp.home, away: mp.away, league: mp.league, kickoffISO: mp.kickoffISO } as any)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: "#1d4ed833" }}>
                          <Text style={{ color: "#60a5fa", fontSize: 11, fontWeight: "700" }}>✏️</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => cancelPred(mp.fixtureId)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: "#ef444422" }}>
                          <Text style={{ color: "#f87171", fontSize: 11, fontWeight: "700" }}>🗑</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Settle edilmişse puan özeti şeridi */}
                      {settled && <SettleSummaryStrip points={settled.points} detail={settled.detail} />}
                    </View>
                  );
                })}

                {myPreds.old.length > 0 && (
                  <>
                    <TouchableOpacity
                      onPress={() => setShowOldPreds((v) => !v)}
                      style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.border, marginTop: 4 }}
                    >
                      <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: "700" }}>
                        🗂 Eski Tahminler ({myPreds.old.length})
                      </Text>
                      <Text style={{ color: Colors.muted, fontSize: 11 }}>{showOldPreds ? "▲" : "▼"}</Text>
                    </TouchableOpacity>
                    {showOldPreds && myPreds.old.map((mp) => {
                      const settledOld = settledMap[String(mp.fixtureId)];
                      return (
                      <TouchableOpacity
                        key={mp.fixtureId}
                        onPress={() => goPredict({ fixtureId: mp.fixtureId, home: mp.home, away: mp.away, league: mp.league, kickoffISO: mp.kickoffISO } as any)}
                        style={{ borderRadius: 10, backgroundColor: "#0a0f1a", borderWidth: 1, borderColor: Colors.border, opacity: 0.75, overflow: "hidden" }}
                      >
                        <View style={{ padding: 12 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          <Text style={{ color: Colors.muted, fontWeight: "600", flex: 1 }} numberOfLines={1}>
                            {mp.home || mp.fixtureId} — {mp.away || ""}
                          </Text>
                          {mp.score && <Text style={{ color: Colors.muted, fontWeight: "700" }}>{mp.score.home}–{mp.score.away}</Text>}
                        </View>
                        <Text style={{ color: Colors.muted, fontSize: 10, marginTop: 2 }}>
                          {mp.kickoffISO ? new Date(mp.kickoffISO).toLocaleString("tr-TR", { day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit" }) : ""}
                          {mp.pred ? `  •  ${mp.pred.outcome}` : ""}
                        </Text>
                        </View>
                        {settledOld && <SettleSummaryStrip points={settledOld.points} detail={settledOld.detail} />}
                      </TouchableOpacity>
                      );
                    })}
                  </>
                )}
              </View>
            )}

            {/* ===== TURNUVALARIM İÇERİĞİ ===== */}
            {mode === "tournaments" && showCreateTournament && (
              <TournamentCreate
                country={userCountry}
                userId={userId}
                onCreated={(code) => { setShowCreateTournament(false); loadMyTournaments(); }}
                onClose={() => setShowCreateTournament(false)}
              />
            )}
            {mode === "tournaments" && showJoinTournament && (
              <TournamentJoin
                userId={userId}
                onJoined={(code) => { setShowJoinTournament(false); loadMyTournaments(); }}
                onClose={() => setShowJoinTournament(false)}
              />
            )}
            {mode === "tournaments" && !showCreateTournament && !showJoinTournament && (
              <View style={{ gap: 10, marginTop: 4 }}>
                {/* Oluştur / Katıl butonları */}
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 6 }}>
                  <TouchableOpacity
                    onPress={() => setShowCreateTournament(true)}
                    style={{ flex: 1, backgroundColor: "#a3e635", borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
                  >
                    <Text style={{ color: "#0f172a", fontWeight: "900", fontSize: 14 }}>🏆 Turnuva Oluştur</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShowJoinTournament(true)}
                    style={{ flex: 1, backgroundColor: "#1e293b", borderRadius: 12, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: "#334155" }}
                  >
                    <Text style={{ color: "#f1f5f9", fontWeight: "900", fontSize: 14 }}>🎟️ Koda Katıl</Text>
                  </TouchableOpacity>
                </View>

                {(myTournamentsLoading || publicLoading) && (
                  <Text style={{ color: Colors.muted, fontSize: 12 }}>Yükleniyor...</Text>
                )}

                {/* Katıldığım turnuvalar */}
                {myTournaments.length > 0 && (
                  <>
                    <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1 }}>KATILDIKLARIM</Text>
                    {myTournaments.map((t) => (
                      <TouchableOpacity
                        key={t.id}
                        onPress={() => router.push({ pathname: "/mini-group", params: { code: t.code, userId } })}
                        style={{ borderRadius: 10, backgroundColor: "#1e2433", borderWidth: 1, borderColor: t.finishedAt ? "#334155" : "#3b82f655", overflow: "hidden" }}
                      >
                        <View style={{ padding: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: "#e2e8f0", fontWeight: "700", fontSize: 13 }} numberOfLines={1}>{t.name}</Text>
                            <Text style={{ color: "#64748b", fontSize: 10, marginTop: 2 }}>
                              {t.memberCount} katılımcı  •  {(t.fixtures || []).length} maç
                              {t.finishedAt ? "  •  Bitti" : ""}
                            </Text>
                          </View>
                          {t.finishedAt ? (
                            <Text style={{ fontSize: 18 }}>🏁</Text>
                          ) : (
                            <Text style={{ color: "#3b82f6", fontSize: 11, fontWeight: "700" }}>›</Text>
                          )}
                        </View>
                        {!t.finishedAt && (t.fixtures || []).slice(0, 2).map((f: any) => (
                          <View key={f.fixtureId} style={{ paddingHorizontal: 10, paddingBottom: 6, flexDirection: "row", gap: 6 }}>
                            <Text style={{ color: "#475569", fontSize: 10 }}>⚽</Text>
                            <Text style={{ color: "#64748b", fontSize: 10 }} numberOfLines={1}>
                              {f.home} — {f.away}
                              {f.kickoffISO ? "  " + new Date(f.kickoffISO).toLocaleString("tr-TR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" }) : ""}
                            </Text>
                          </View>
                        ))}
                      </TouchableOpacity>
                    ))}
                  </>
                )}

                {/* Açık (herkese açık) turnuvalar */}
                {publicTournaments.filter((t) => !myTournaments.find((m) => m.id === t.id)).length > 0 && (
                  <>
                    <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginTop: 6 }}>AÇIK TURNUVALAR</Text>
                    {publicTournaments
                      .filter((t) => !myTournaments.find((m) => m.id === t.id))
                      .map((t) => (
                        <View
                          key={t.id}
                          style={{ borderRadius: 10, backgroundColor: "#1e2433", borderWidth: 1, borderColor: "#f59e0b44", overflow: "hidden" }}
                        >
                          <View style={{ padding: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: "#e2e8f0", fontWeight: "700", fontSize: 13 }} numberOfLines={1}>{t.name}</Text>
                              <Text style={{ color: "#64748b", fontSize: 10, marginTop: 2 }}>
                                {t.memberCount} katılımcı  •  {t.fixtureCount || (t.fixtures || []).length} maç
                              </Text>
                              {(t.fixtures || []).slice(0, 2).map((f: any) => (
                                <Text key={f.fixtureId} style={{ color: "#475569", fontSize: 10, marginTop: 1 }} numberOfLines={1}>
                                  ⚽ {f.home} — {f.away}
                                </Text>
                              ))}
                            </View>
                            <TouchableOpacity
                              onPress={() => joinTournament(t.code)}
                              disabled={joinBusy === t.code}
                              style={{ backgroundColor: "#f59e0b", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 }}
                            >
                              <Text style={{ color: "#000", fontWeight: "900", fontSize: 12 }}>
                                {joinBusy === t.code ? "..." : "Katıl"}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                  </>
                )}

                {!myTournamentsLoading && !publicLoading && myTournaments.length === 0 && publicTournaments.length === 0 && (
                  <Text style={{ color: Colors.muted, fontSize: 13 }}>Henüz açık turnuva yok.</Text>
                )}
              </View>
            )}

            {/* ===== 1987GS MODU ===== */}
            {mode === "gs1987" && (
              <View style={{ marginTop: 8 }}>
                {is1987Checking ? (
                  <ActivityIndicator color="#E8102A" style={{ marginVertical: 40 }} />
                ) : is1987Member ? (
                  <Picks1987 />
                ) : (
                  /* Erişim kapısı */
                  <View style={{ alignItems: "center", paddingVertical: 32, paddingHorizontal: 24 }}>
                    <Text style={{ fontSize: 48, marginBottom: 12 }}>🔒</Text>
                    <Text style={{ fontSize: 18, fontWeight: "900", color: "#E8102A", marginBottom: 6, textAlign: "center" }}>
                      1987 Galatasaray'ı Unutamayanlar
                    </Text>
                    <Text style={{ fontSize: 13, color: Colors.muted, textAlign: "center", marginBottom: 24, lineHeight: 20 }}>
                      Bu alana sadece 1987GS Facebook grubu üyeleri girebilir.{"\n"}
                      Gruba özel kodu girerek erişim sağla.
                    </Text>

                    <View style={{ width: "100%", gap: 10 }}>
                      <TextInput
                        value={gs1987Code}
                        onChangeText={(t) => { setGs1987Code(t); setGs1987Error(null); }}
                        placeholder="1987GS grubuna özel kod"
                        placeholderTextColor="#555"
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={{
                          borderWidth: 1.5,
                          borderColor: gs1987Error ? "#E8102A" : "#333",
                          borderRadius: 12,
                          paddingHorizontal: 16,
                          paddingVertical: 12,
                          backgroundColor: "#111",
                          color: "#fff",
                          fontSize: 15,
                          textAlign: "center",
                          letterSpacing: 2,
                        }}
                      />

                      {gs1987Error && (
                        <Text style={{ color: "#E8102A", fontSize: 12, textAlign: "center" }}>
                          {gs1987Error}
                        </Text>
                      )}

                      <TouchableOpacity
                        onPress={submit1987Code}
                        disabled={gs1987Busy || !gs1987Code.trim()}
                        style={{
                          paddingVertical: 14,
                          borderRadius: 12,
                          backgroundColor: gs1987Code.trim() ? "#E8102A" : "#3a0a0a",
                          alignItems: "center",
                          opacity: gs1987Busy ? 0.7 : 1,
                        }}
                      >
                        {gs1987Busy
                          ? <ActivityIndicator color="#fff" size="small" />
                          : <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>Giriş Yap →</Text>
                        }
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* ===== ADMIN INLINE PANEL ===== */}
            {adminMode && selectedFid && (
              <View
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#CBD5E1",
                  backgroundColor: "#FFFFFF",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: "#6366f1", fontWeight: "700" }}>⚙️ ADMIN PANEL</Text>
                    <Text style={{ fontSize: 15, fontWeight: "900", color: Colors.slate900, marginTop: 2 }}>
                      {selectedFx ? `${selectedFx.home} — ${selectedFx.away}` : selectedFid}
                    </Text>
                    {selectedFx?.league ? (
                      <Text style={{ fontSize: 11, color: Colors.muted }}>{selectedFx.league}</Text>
                    ) : null}
                  </View>
                  <TouchableOpacity onPress={() => { setSelectedFid(null); setAdmMsg(null); }}>
                    <Text style={{ color: Colors.muted, fontSize: 18, padding: 4 }}>✕</Text>
                  </TouchableOpacity>
                </View>

                <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: Colors.muted, marginBottom: 4 }}>Skor (H)</Text>
                    <TextInput
                      value={admHome}
                      onChangeText={setAdmHome}
                      keyboardType="numeric"
                      placeholder="0"
                      style={{
                        borderWidth: 1,
                        borderColor: "#CBD5E1",
                        borderRadius: 10,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        backgroundColor: "#fff",
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: Colors.muted, marginBottom: 4 }}>Skor (A)</Text>
                    <TextInput
                      value={admAway}
                      onChangeText={setAdmAway}
                      keyboardType="numeric"
                      placeholder="0"
                      style={{
                        borderWidth: 1,
                        borderColor: "#CBD5E1",
                        borderRadius: 10,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        backgroundColor: "#fff",
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, color: Colors.muted, marginBottom: 4 }}>Dakika</Text>
                    <TextInput
                      value={admMinute}
                      onChangeText={setAdmMinute}
                      keyboardType="numeric"
                      placeholder="90"
                      style={{
                        borderWidth: 1,
                        borderColor: "#CBD5E1",
                        borderRadius: 10,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        backgroundColor: "#fff",
                      }}
                    />
                  </View>
                </View>

                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  {([
                    { s: "NS",   bg: "#F1F5F9", fg: "#475569", abg: "#E2E8F0", afg: "#0F172A" },
                    { s: "LIVE", bg: "#F0FDF4", fg: "#15803D", abg: "#22C55E", afg: "#fff"    },
                    { s: "HT",   bg: "#FFFBEB", fg: "#92400E", abg: "#F59E0B", afg: "#fff"    },
                    { s: "FT",   bg: "#FEF2F2", fg: "#991B1B", abg: "#EF4444", afg: "#fff"    },
                  ] as const).map(({ s, bg, fg, abg, afg }) => {
                    const active = String(admStatus).toUpperCase() === s;
                    return (
                      <TouchableOpacity
                        key={s}
                        onPress={() => setAdmStatus(s)}
                        style={{
                          flex: 1,
                          paddingVertical: 12,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: active ? abg : "#CBD5E1",
                          backgroundColor: active ? abg : bg,
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: "800", color: active ? afg : fg }}>
                          {s}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setAdmRedHome((v) => !v)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: admRedHome ? "#EF4444" : "#CBD5E1",
                      backgroundColor: admRedHome ? "#FEF2F2" : "#fff",
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "700", color: admRedHome ? "#991B1B" : Colors.slate900 }}>
                      Kırmızı H: {admRedHome ? "VAR" : "YOK"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setAdmRedAway((v) => !v)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: admRedAway ? "#EF4444" : "#CBD5E1",
                      backgroundColor: admRedAway ? "#FEF2F2" : "#fff",
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "700", color: admRedAway ? "#991B1B" : Colors.slate900 }}>
                      Kırmızı A: {admRedAway ? "VAR" : "YOK"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      setAdmPenaltyAny((v) => !v);
                      if (admPenaltyAny) setAdmPenaltySide("");
                    }}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: admPenaltyAny ? "#F59E0B" : "#CBD5E1",
                      backgroundColor: admPenaltyAny ? "#FFFBEB" : "#fff",
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "700", color: admPenaltyAny ? "#92400E" : Colors.slate900 }}>
                      Penaltı: {admPenaltyAny ? "VAR" : "YOK"}
                    </Text>
                  </TouchableOpacity>

                  {admPenaltyAny && (
                    <>
                      <TouchableOpacity
                        onPress={() => setAdmPenaltySide("H")}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: admPenaltySide === "H" ? "#F59E0B" : "#CBD5E1",
                          backgroundColor: admPenaltySide === "H" ? "#FFFBEB" : "#fff",
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "700", color: admPenaltySide === "H" ? "#92400E" : Colors.slate900 }}>
                          Pen Side: H
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => setAdmPenaltySide("A")}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: admPenaltySide === "A" ? "#F59E0B" : "#CBD5E1",
                          backgroundColor: admPenaltySide === "A" ? "#FFFBEB" : "#fff",
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "700", color: admPenaltySide === "A" ? "#92400E" : Colors.slate900 }}>
                          Pen Side: A
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>

                {admMsg && (
                  <Text style={{ marginTop: 10, fontSize: 12, color: admMsg.includes("OK") ? "#065F46" : Colors.muted }}>
                    {admMsg}
                  </Text>
                )}

                <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                  <TouchableOpacity
                    disabled={admBusy}
                    onPress={() => adminSaveState({ alsoSettle2: false })}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 12,
                      backgroundColor: "#111827",
                      opacity: admBusy ? 0.6 : 1,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>
                      {admBusy ? "..." : "💾 Kaydet"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    disabled={admBusy}
                    onPress={() =>
                      Alert.alert(
                        "FT + settle2",
                        "Önce FT kaydedilecek, sonra settle2 çalıştırılacak.",
                        [
                          { text: "Vazgeç", style: "cancel" },
                          { text: "Devam", style: "default", onPress: () => adminSaveState({ alsoSettle2: true }) },
                        ]
                      )
                    }
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 12,
                      backgroundColor: "#6366F1",
                      opacity: admBusy ? 0.6 : 1,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>
                      {admBusy ? "..." : "🏁 FT + Settle"}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                  <TouchableOpacity
                    disabled={admBusy}
                    onPress={adminRunMatchBoard}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 12,
                      backgroundColor: "#0EA5E9",
                      opacity: admBusy ? 0.6 : 1,
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>
                      {admBusy ? "..." : "📊 Sıralama"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      setSelectedFid(null);
                      setAdmMsg(null);
                      setShowAddFx(false);
                    }}
                    style={{
                      width: 96,
                      paddingVertical: 10,
                      borderRadius: 12,
                      backgroundColor: "#E5E7EB",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "#111827", fontWeight: "800", fontSize: 12 }}>Kapat</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* ===== MAÇ EKLE FORMU (admin modu, maç seçili değilken veya her zaman) ===== */}
            {adminMode && (
              <View
                style={{
                  marginTop: 10,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: showAddFx ? "#6366F1" : "#CBD5E1",
                  overflow: "hidden",
                }}
              >
                <TouchableOpacity
                  onPress={() => { setShowAddFx((v) => !v); setAddMsg(null); }}
                  style={{ flexDirection: "row", alignItems: "center", padding: 12, backgroundColor: showAddFx ? "#EEF2FF" : "#F8FAFC", gap: 8 }}
                >
                  <Text style={{ flex: 1, fontWeight: "700", fontSize: 13, color: showAddFx ? "#3730A3" : Colors.slate900 }}>
                    ➕ Yeni Maç Ekle
                  </Text>
                  <Text style={{ color: Colors.muted, fontSize: 11 }}>{showAddFx ? "▲ Gizle" : "▼ Aç"}</Text>
                </TouchableOpacity>

                {showAddFx && (
                  <View style={{ padding: 12, gap: 10 }}>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, color: Colors.muted, marginBottom: 4 }}>Ev Sahibi</Text>
                        <TextInput
                          value={addHome}
                          onChangeText={setAddHome}
                          placeholder="İngiltere"
                          style={{ borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "#fff" }}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, color: Colors.muted, marginBottom: 4 }}>Deplasman</Text>
                        <TextInput
                          value={addAway}
                          onChangeText={setAddAway}
                          placeholder="Arjantin"
                          style={{ borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "#fff" }}
                        />
                      </View>
                    </View>

                    <View>
                      <Text style={{ fontSize: 11, color: Colors.muted, marginBottom: 4 }}>Lig / Turnuva</Text>
                      <TextInput
                        value={addLeague}
                        onChangeText={setAddLeague}
                        placeholder="World Cup Final"
                        style={{ borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "#fff" }}
                      />
                    </View>

                    <View>
                      <Text style={{ fontSize: 11, color: Colors.muted, marginBottom: 4 }}>Tarih & Saat (YYYY-MM-DDTHH:mm)</Text>
                      <TextInput
                        value={addKickoff}
                        onChangeText={setAddKickoff}
                        placeholder="2026-07-19T22:00"
                        autoCapitalize="none"
                        style={{ borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: "#fff", fontFamily: "monospace" }}
                      />
                    </View>

                    {addMsg && (
                      <Text style={{ fontSize: 12, color: addMsg.startsWith("✅") ? "#065F46" : "#991B1B" }}>{addMsg}</Text>
                    )}

                    <TouchableOpacity
                      disabled={addBusy}
                      onPress={adminAddFixture}
                      style={{ paddingVertical: 12, borderRadius: 10, backgroundColor: "#6366F1", opacity: addBusy ? 0.6 : 1, alignItems: "center" }}
                    >
                      <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>
                        {addBusy ? "Ekleniyor..." : "✅ Fixtures'a Ekle"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ paddingVertical: 40, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator size="small" />
              <Text style={{ marginTop: 8, color: Colors.muted, fontSize: 12 }}>
                {mode === "schedule" ? "Maçlar yükleniyor..." : "Açık maçlar yükleniyor..."}
              </Text>
            </View>
          ) : (
            <View style={{ paddingVertical: 40, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: Colors.muted, fontSize: 12, textAlign: "center", marginBottom: 4 }}>
                {mode === "mine" ? "Henüz tahmin yapmadın."
                  : mode === "tournaments" ? "Henüz bir turnuvada değilsin. Mini turnuva oluştur veya koda katıl."
                  : mode === "gs1987" ? ""
                  : mode === "schedule" ? "Liste penceresinde maç görünmüyor."
                  : "96 saatlik tahmin penceresi içinde açık maç yok."}
              </Text>
              <Text style={{ color: Colors.muted, fontSize: 11, textAlign: "center" }}>
                {mode === "schedule"
                  ? "Not: Bu ekran /schedule kullanır (manuel +60 gün dahil). Tahmin butonu sadece 96 saat içindekilerde görünür."
                  : "Not: Bu ekran sadece /open kullanır. Daha ileri maçları “Maçlar (60g)” sekmesinden görürsün."}
              </Text>
            </View>
          )
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    </View>
  );
}
