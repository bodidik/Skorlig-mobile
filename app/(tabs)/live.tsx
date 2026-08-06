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
import { apiFetch as sharedApiFetch, apiJson as sharedApiJson } from "../../lib/apiFetch";
import { withAdminHeaders } from "../../lib/adminToken";
import DailyMenuStrip from "../../components/DailyMenuStrip";
import QuickPlaySection from "../../components/QuickPlaySection";
import OyunModlari from "../../components/OyunModlari";
import TournamentCreate from "../../components/TournamentCreate";
import TournamentJoin from "../../components/TournamentJoin";
import Picks1987 from "../../components/Picks1987";
import GuestBanner from "../../components/GuestBanner";
import DailyMatchCard from "../../components/DailyMatchCard";
import KuponKarti from "../../components/KuponKarti";
import { hataMesaji } from "../../lib/hataMesaji";
import GroupHeader from "../../components/GroupHeader";
import { useAuth } from "../../contexts/AuthContext";
import { t, useLang } from "../../lib/i18n";
import { ulkeAdi, ligEtiketi, ligSiraAnahtari } from "../../lib/ulkeler";
const t2 = t; // turnuva map(t) golgelemesi icin takma ad

type FxStatus = "NS" | "LIVE" | "HT" | "FT" | "PEN" | "ABANDONED";

/**
 * Öncelik grubu — SUNUCU üretir (lib/fixture-priority.cjs).
 * İstemcide yeniden hesaplanmıyor: aynı kuralı iki yerde tanımlamak bu projede
 * defalarca sessiz ayrışmaya yol açtı.
 */
type PriorityGroup = "country" | "global" | "big" | "other" | "friendly";

type Fx = {
  fixtureId: string;
  home: string;
  away: string;

  /** Grup başlığı için; sıra değiştiğinde başlık basılır. */
  priorityGroup?: PriorityGroup | null;

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
  note?: string | null;
};

type OpenWindow = { backH?: number; fwdH?: number };
// `backH` (saat cinsinden geriye pencere) api/routes/fixtures.cjs schedule
// yanıtında dönüyor; tipte yoktu.
type WindowDays = { backDays?: number; fwdDays?: number; backH?: number };

type RuntimeMode = {
  profile?: string;
  maxTeams?: number | null;
  maxLeagues?: number | null;
  // PILOT_MANUAL profilinde tanımlı (bkz. api/routes/admin-runtime.cjs PRESETS)
  maxFixtures?: number | null;
  providerDisabled?: boolean;
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

  /**
   * Kullanıcının ülkesinde maç bulunamadığı için dünya listesi döndü.
   * Sunucu bunu açıkça bildiriyor; belirtmezsek kullanıcı Brezilya maçı
   * görünce hata sanır. (Süper Lig sezon arasındayken Türk kullanıcı için
   * ölçülen boşluk 14 gündü — boş ekran yerine oynanabilir maç gösteriliyor.)
   */
  countryFallback?: boolean;
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

/**
 * ⚠️ TİP API'YE UYDURULDU. Eskiden `id`, `fixtures`, `finishedAt`,
 * `memberCount` alanları EKSİKTİ; kod bunları doğru okuyordu ama tsc 17 hata
 * üretiyordu. Zararsız görünen bu gürültü gerçek bir çökmeyi sakladı:
 * me.tsx'te bir TDZ hatası (banInput) 27 hatanın arasında fark edilmemişti.
 * Kaynak: api/routes/mini.cjs → publicView().
 */
type MiniTournament = {
  id: string;
  code: string;
  name: string;
  ownerId?: string;
  fixtures: { fixtureId: string; home?: string; away?: string; kickoffISO?: string; league?: string }[];
  members: string[];
  memberCount: number;
  fixtureCount?: number;
  status?: string;
  createdAt: string;
  finishedAt?: string | null;
  finalized?: boolean;
  winners?: string[] | null;
  rewardLc?: number | null;
};

type EmptyLiveMatch = {
  homeTeam: string;
  awayTeam: string;
  homeScore: string | null;
  awayScore: string | null;
  status: string;
  isLive: boolean;
  isHT: boolean;
};
type EmptyLiveLeague = {
  id: string;
  name: string;
  country: string;
  matches: EmptyLiveMatch[];
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
    if (typeof m === "number" && m > 0) return `${m}'`;
    return t("live");
  }
  if (st === "HT") return t("halftime");
  if (st === "FT") return t("finished");
  if (st === "NS") return t("notStarted");
  if (st === "PEN") return t("penalties");
  /**
   * ⚠️ Sunucu, kaynağın canlı beslemesinden düşen ve sonucu hiç gelmeyen
   * maçlara bu durumu yazıyor (bkz. services/livescore-sync.cjs
   * takiliLiveUzlastir). Etiketi olmasaydı kullanıcı ham
   * "OVERDUE_NO_RESULT" metnini görürdü — `statusLabel` bilinmeyen durumu
   * olduğu gibi döndürüyor.
   *
   * Bu maçlar ÖNCE sonsuza dek "CANLI" görünüyordu; ölçüldü: 160 kayıt,
   * en yaşlısı 15 gündür canlı sanılıyordu.
   */
  if (st === "OVERDUE_NO_RESULT" || st === "OVERDUE_NO_STATE") return t("noResult");
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
    chips.push({ label: t("resultLbl"), value: oc === "H" ? t("home") : oc === "D" ? t("draw") : t("away"), color: c });
  }
  if (pred.home != null && pred.away != null)
    chips.push({ label: t("scoreLbl"), value: `${pred.home}–${pred.away}`, color: "#a3e635" });
  if (pred.firstGoal)
    chips.push({ label: t("firstGoalLbl"), value: pred.firstGoal === "H" ? t("home") : t("away"), color: "#22d3ee" });
  if (pred.firstHalf) {
    const fh = String(pred.firstHalf).toUpperCase();
    chips.push({ label: t("firstHalfLbl"), value: fh === "H" ? t("home") : fh === "D" ? t("draw") : t("away"), color: "#a78bfa" });
  }
  if (pred.redAny != null)
    chips.push({ label: "🟥 " + t("redLbl"), value: pred.redAny ? (pred.redSide === "H" ? t("home") : pred.redSide === "A" ? t("away") : t("varLbl")) : t("yokLbl"), color: pred.redAny ? "#ef4444" : "#64748b" });
  if (pred.penaltyAny != null)
    chips.push({ label: "⚽ " + t("penalty"), value: pred.penaltyAny ? (pred.penaltySide === "H" ? t("home") : pred.penaltySide === "A" ? t("away") : t("varLbl")) : t("yokLbl"), color: pred.penaltyAny ? "#f59e0b" : "#64748b" });
  return chips;
}

// Settle sonrası kategori kırılımı: detail -> mini rozetler
// (settle2 detail alanları: outcome, exact, firstGoal, firstHalf, redAny, penaltyAny...)
function buildSettleChips(detail: any): { label: string; pts: number }[] {
  if (!detail) return [];
  const defs: [string, string][] = [
    ["outcome", "MS"],
    ["exact", t("scoreLbl")],
    ["firstGoal", t("igShort")],
    ["firstHalf", t("iyShort")],
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
          {total > 0 ? "+" : ""}{Math.round(total * 100) / 100} {t("points")}
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

/* ⚠️ BURADAKI `fetchWithTimeout` KALDIRILDI: lib/fetchPolicy'nin zaman asimi
 * bolumunun elle yazilmis, eksik bir kopyasiydi (yeniden deneme ve ag
 * hatasinda adres tazeleme yoktu). Tek kullanicisi olan yerel `apiFetch`
 * paylasilan surume gecince olu koda dondu. */

function normalizeApiError(j: any): string {
  const code = String(j?.error || j?.code || "").trim();
  if (!code) return String(j?.detail || t("opFailed"));

  if (code === "STATE_NOT_FOUND") return t("stateNotFound");
  if (code === "NOT_FINISHED") return t("notFinishedErr");
  if (code === "FIXTURE_REQUIRED" || code === "FIXTURE_ID_REQUIRED") return "FIXTURE_ID_REQUIRED: fixtureId zorunlu.";

  const detail = j?.detail ? ` • ${String(j.detail)}` : "";
  return `${code}${detail}`;
}

type ItemProps = {
  item: Fx;
  mode: Mode;
  onPredict: (fx: Fx) => void;
  onRace: (fx: Fx) => void;
  onDuel: (fx: Fx) => void;
  hasPred: boolean | null | undefined;
  adminMode: boolean;
  selected: boolean;
  onSelect: (fx: Fx) => void;
};

const Item: React.FC<ItemProps> = ({ item, mode, onPredict, onRace, onDuel, hasPred, adminMode, selected, onSelect }) => {
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
  const cardBg = selected ? "#1e1b4b" : isLive ? "#071a0f" : "#0f172a";
  const borderCol = selected ? "#6366F1" : isLive ? Colors.live : highlight ? "#22c55e22" : Colors.border;

  const showPredLine = mode === "open";
  const predText =
    hasPred === true
      ? t("havePred")
      : hasPred === false
      ? t("noPredYet")
      : t("predStatusLoading");
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
                    {selected ? t("selectedSuffix") : ""}
                  </Text>
                </View>
              )}

              {hasPred === true && (
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 999,
                    backgroundColor: "#14532d55",
                    borderWidth: 1,
                    borderColor: "#22c55e66",
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: "800", color: "#4ade80" }}>{t("predBadge")}</Text>
                </View>
              )}
            </View>

            {/* ⚠️ LİG ADI TEK BAŞINA YETMİYOR: üretimde 32 lig adı birden fazla
                ülkede geçiyor ("Premier Lig" 24 ülke, "1. Lig" 18 ülke).
                Bayrak + ülke + lig — bkz. lib/ulkeler.ts ligEtiketi. */}
            <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
              {kickoffLabel(item)}
              {ligEtiketi(item.league, item.country) ? ` • ${ligEtiketi(item.league, item.country)}` : ""}
            </Text>
          </View>

          <View style={{ alignItems: "flex-end", minWidth: 72 }}>
            {showPredBadge && (
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 999,
                  backgroundColor: "#14532d55",
                  borderWidth: 1,
                  borderColor: "#22c55e66",
                  marginBottom: 6,
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: "800", color: "#4ade80" }}>{t("predBadge2")}</Text>
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

        {item.note ? (
          <View style={{ flexDirection: "row", gap: 6, marginTop: 6, backgroundColor: "#1a1600", borderWidth: 1, borderColor: "#ca8a0455", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 }}>
            <Text style={{ fontSize: 12 }}>📌</Text>
            <Text style={{ flex: 1, color: "#fcd34d", fontSize: 11, lineHeight: 16 }}>{item.note}</Text>
          </View>
        ) : null}

        {waitingResult && (
          <View style={{ marginTop: 6 }}>
            <Text style={{ color: Colors.muted, fontSize: 11 }}>{t("waitingResult")}</Text>
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
              <Text style={{ color: Colors.live, fontSize: 11 }}>{t("liveDot")}</Text>
            ) : isFinished ? (
              <Text style={{ color: Colors.muted, fontSize: 11 }}>{t("matchOver")}</Text>
            ) : mode === "open" || canPredictByLocalRule ? (
              <Text style={{ color: "#4ade80", fontSize: 11 }}>{t("canPredict")}</Text>
            ) : (
              <Text style={{ color: Colors.muted, fontSize: 11 }}>{t("notOpenYet")}</Text>
            )}
          </View>

          {!adminMode && !isFinished && (mode === "open" || canPredictByLocalRule) && (
            <View style={{ flexDirection: "row", gap: 6, marginLeft: 8 }}>
              <TouchableOpacity
                onPress={() => onPredict(item)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: Colors.primary,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: Colors.onAccent, fontWeight: "700", fontSize: 12 }}>{t("predictBtn")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onDuel(item)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: "#1e293b",
                  borderWidth: 1,
                  borderColor: "#f59e0b55",
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#f59e0b", fontWeight: "700", fontSize: 12 }}>⚔️</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Yarış panosu: tahmin yapılmış, canlı veya biten maçlarda */}
          {!adminMode && (hasPred === true || isLive || (isFinished && hasScore)) && (
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
                {isLive ? t("liveRanking") : isFinished ? t("matchRanking") : t("followRace")}
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
                {selected ? t("selectedCheck") : t("enterResultBtn")}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default function LiveScreen() {
  /* ⚠️ ABONELİK OLMADAN DÜZELTME ETKİSİZ. `t()` modül değişkeni okuyor;
   * ekran ona bağlanmazsa dil değişimi yeniden çizim tetiklemez ve kullanıcı
   * "kaydedildi" uyarısını alıp aynı dili görmeye devam eder. */
  useLang();
  const router = useRouter();
  const { userId: qUserId, admin: qAdmin, tab: qTab } = useLocalSearchParams<{ userId?: string; admin?: string; tab?: string }>();
  const { isAnonymous, linkWithGoogle } = useAuth();

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

  /**
   * SIRALAMA TERCİHİ.
   *
   * ⚠️ NEDEN VAR (kullanıcı bildirimi): liste sunucudan tek bir sırada
   * geliyordu (öncelik) ve aradığı maçı bulmak için sayfalarca kaydırmak
   * gerekiyordu. "Önerilen" varsayılan kalıyor — kendi ülkeni üstte gösteren
   * sıra doğru bir varsayılan; ama kullanıcı tarihe ya da lige geçebilmeli.
   *
   * ⚠️ SUNUCU SIRASI YENİDEN YAZILMIYOR: "önerilen" seçiliyken liste
   * sunucudan geldiği gibi kalır (lib/fixture-priority.cjs tek kaynak).
   * Öteki iki seçenek yalnızca GÖSTERİM sırasını değiştirir, eleme yapmaz.
   */
  const [siralama, setSiralama] = useState<"onerilen" | "tarih" | "lig">("onerilen");

  const gorunenListe = useMemo(() => {
    if (siralama === "onerilen") return items;
    const kopya = items.slice();
    const ko = (x: Fx) => {
      const t2 = Date.parse(String(x.kickoffISO || ""));
      return Number.isFinite(t2) ? t2 : Number.MAX_SAFE_INTEGER;
    };
    if (siralama === "tarih") {
      kopya.sort((a, b) => ko(a) - ko(b));
    } else {
      // Lige göre: aynı ülkenin ligleri bir arada, lig içinde saate göre.
      kopya.sort((a, b) => {
        const ka = ligSiraAnahtari(a.league, a.country);
        const kb = ligSiraAnahtari(b.league, b.country);
        if (ka !== kb) return ka < kb ? -1 : 1;
        return ko(a) - ko(b);
      });
    }
    return kopya;
  }, [items, siralama]);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [baseInfo, setBaseInfo] = useState<string | null>(null);

  const [win, setWin] = useState<OpenWindow | null>(null);
  const [winDays, setWinDays] = useState<WindowDays | null>(null);
  const [cap, setCap] = useState<number | null>(null);
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode | null>(null);
  // Ülkede maç yok → dünya listesi gösteriliyor (sunucu bildiriyor).
  const [countryFallback, setCountryFallback] = useState(false);
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

  // Kullanıcının yereli (ülke + takım + ek ligler): maç listesi kişiselleşir
  const [userCountry, setUserCountry] = useState<string | null>(null);
  const [userMainTeam, setUserMainTeam] = useState<string | null>(null);
  const [userExtraLeagues, setUserExtraLeagues] = useState<string[]>([]);
  const [countryReady, setCountryReady] = useState(false);

  // Boş open durumu: dünya vitrin + yakında açılacak
  const [emptyLiveLeagues, setEmptyLiveLeagues] = useState<EmptyLiveLeague[]>([]);
  const [emptyUpcoming, setEmptyUpcoming]       = useState<Fx[]>([]);
  const [emptyStateLoading, setEmptyStateLoading] = useState(false);

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
  // ⚠️ Oyun modu şeridindeki bedeller SUNUCUDAN. Ekrana sayı gömmek, bedel
  // değişince metnin yalan söylemesi demek (aynı hata premium ekranındaydı).
  const [macBedeli, setMacBedeli] = useState<number | null>(null);
  const [kuponBedeli, setKuponBedeli] = useState<number | null>(null);
  const [userPoints, setUserPoints] = useState<number | null>(null);

  // Maç Ekle formu
  const [showAddFx, setShowAddFx] = useState(false);
  const [addHome, setAddHome] = useState("");
  const [addAway, setAddAway] = useState("");
  const [addLeague, setAddLeague] = useState("");
  const [addKickoff, setAddKickoff] = useState(""); // "YYYY-MM-DDTHH:mm"
  const [addMsg, setAddMsg] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  /**
   * ⚠️ BU YEREL KOPYA TABANI VE KIMLIGI ELLE KURUYORDU. Kendi
   * `fetchWithTimeout` yardimcisini kullandigi icin lib/fetchPolicy'deki
   * yeniden deneme ve ag hatasinda API adresini tazeleme davranisi burada
   * YOKTU — paylasilan surumun kazandigi her iyilestirme bu ekrani atliyordu.
   * Artik paylasilan surume delege ediliyor; ekranda gosterilen taban bilgisi
   * (`baseInfo`) tek yan etki olarak korundu.
   */
  async function apiFetch(path: string, init?: RequestInit) {
    const p = path.startsWith("/") ? path : `/${path}`;
    setBaseInfo(await getApiBase());
    return sharedApiFetch(p, init as any);
  }

  // ⚠️ Bu yardımcı buraya özeldi ve diğer 113 `.json()` çağrısını korumasız
  // bırakıyordu. lib/apiFetch.ts'e taşındı; burada yalnızca ona yönlendiriyoruz
  // ki ikinci bir kopya oluşup davranış ayrışmasın.
  const apiJson = (path: string, init?: RequestInit) =>
    sharedApiJson(path, init as any);

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
        setGs1987Error(j?.error === "WRONG_CODE" ? t("wrongCode1987") : hataMesaji(j?.error));
      }
    } catch (e: any) {
      setGs1987Error(e.message || t("connError"));
    }
    setGs1987Busy(false);
  };

  const loadSchedule = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cq = userCountry ? `&country=${encodeURIComponent(userCountry)}` : "";
      const tq = userMainTeam ? `&team=${encodeURIComponent(userMainTeam)}` : "";
      const eq = userExtraLeagues.length ? `&extraLeagues=${encodeURIComponent(userExtraLeagues.join(","))}` : "";
      const r = await apiFetch(`/api/live2/schedule?backH=${SCHEDULE_BACK_HOURS}&fwdDays=${SCHEDULE_FWD_DAYS}${cq}${tq}${eq}`);
      const j: Live2Resp = await r.json();

      if (!j?.ok) {
        setItems([]);
        setError(String(j?.error || "LIVE2_SCHEDULE_FAILED"));
        setWin(null);
        setWinDays(null);
        setCap(null);
        setRuntimeMode(null);
        setLockBeforeMin(null);
        // Hata durumunda şerit asılı kalmasın — liste zaten boş.
        setCountryFallback(false);
        return;
      }

      const list = pickList(j);
      setItems(list);

      setWin(j?.window ?? null);
      setWinDays(j?.windowDays ?? { backDays: SCHEDULE_BACK_HOURS / 24, fwdDays: SCHEDULE_FWD_DAYS });
      setCap(typeof j?.cap === "number" ? j.cap : null);
      setRuntimeMode(j?.runtimeMode ?? null);
      setCountryFallback(!!j?.countryFallback);
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
  }, [userCountry, userMainTeam, userExtraLeagues]);

  const loadOpen = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cq = userCountry ? `&country=${encodeURIComponent(userCountry)}` : "";
      const tq = userMainTeam ? `&team=${encodeURIComponent(userMainTeam)}` : "";
      const eq = userExtraLeagues.length ? `&extraLeagues=${encodeURIComponent(userExtraLeagues.join(","))}` : "";
      const r = await apiFetch(`/api/live2/open?fwdH=${PREDICT_OPEN_AHEAD_HOURS}${cq}${tq}${eq}`);
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
  }, [userCountry, userMainTeam, userExtraLeagues]);

  // Profilden ülke bilgisini çek (yerel görünüm için)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const j = await apiJson(`/api/users/profile?userId=${encodeURIComponent(userId)}`);
        if (!cancelled) {
          setUserCountry(j?.ok && j.profile?.country ? String(j.profile.country) : null);
          setUserMainTeam(j?.ok && j.profile?.mainTeam ? String(j.profile.mainTeam) : null);
          setUserExtraLeagues(j?.ok && Array.isArray(j.profile?.preferredLeagues) ? j.profile.preferredLeagues : []);
          // Kullanıcının dil tercihini uygula
          if (j?.ok && j.profile?.preferredLang) {
            const { setLang } = require("../../lib/i18n");
            setLang(j.profile.preferredLang);
          }
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
      if (walletRes?.ok) {
        setLcBalance(walletRes.user?.balance ?? 0);
        // Maç bedeli sunucunun tek kaynağından (lib/ekonomi.cjs) geliyor.
        const b = walletRes.pricing?.matchEntryCost;
        if (typeof b === "number") setMacBedeli(b);
      }
      if (profileRes?.ok) setUserPoints(profileRes.profile?.totals ?? profileRes.totals ?? 0);
    } catch {}

    // Kupon bedeli ayrı uçtan; kupon yoksa şeritte bedel gösterilmez.
    try {
      const k = await apiJson("/api/kupon/aktif");
      const ilk = k?.ok && Array.isArray(k.kuponlar) ? k.kuponlar[0] : null;
      if (ilk && typeof ilk.girisBedeli === "number") setKuponBedeli(ilk.girisBedeli);
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

  const loadEmptyState = useCallback(async () => {
    setEmptyStateLoading(true);
    try {
      const cq = userCountry ? `&country=${encodeURIComponent(userCountry)}` : "";
      const [liveRes, schedRes] = await Promise.all([
        apiJson("/api/livescore/matches").catch(() => null),
        apiJson(`/api/live2/schedule?backH=0&fwdDays=7${cq}`).catch(() => null),
      ]);

      if (liveRes?.ok && liveRes.leagues) {
        const leagues: EmptyLiveLeague[] = Object.values(liveRes.leagues as Record<string, EmptyLiveLeague>);
        const withLive = leagues
          .filter((l) => l.matches.some((m) => m.isLive || m.isHT))
          .sort((a, b) => {
            const la = a.matches.filter((m) => m.isLive || m.isHT).length;
            const lb = b.matches.filter((m) => m.isLive || m.isHT).length;
            return lb - la;
          })
          .slice(0, 6);
        setEmptyLiveLeagues(withLive);
      }

      if (schedRes?.ok) {
        const nowMs = nowFromServer();
        const list = pickList(schedRes);
        const upcoming = list
          .filter((fx) => {
            const ms = kickoffMs(fx);
            if (!ms) return false;
            return ms - nowMs > 0 && ms - nowMs <= 7 * 24 * 3600 * 1000;
          })
          .sort((a, b) => (kickoffMs(a) ?? Infinity) - (kickoffMs(b) ?? Infinity))
          .slice(0, 15);
        setEmptyUpcoming(upcoming);
      }
    } catch {}
    setEmptyStateLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userCountry]);

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
        Alert.alert(t("error"), j?.error || t("joinFailed"));
      }
    } catch (e: any) {
      Alert.alert(t("error"), String(e?.message || e));
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

  // open listesi boşsa dünya vitrin + yakında açılacak maçları yükle
  useEffect(() => {
    if (mode === "open" && !loading && items.length === 0 && countryReady) {
      loadEmptyState();
    }
  }, [mode, loading, items.length, countryReady, loadEmptyState]);

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

  const goDuel = (fx: Fx) => {
    router.push({
      pathname: "/duel/[fixtureId]",
      params: {
        fixtureId: String(fx.fixtureId || ""),
        home: fx.home || "",
        away: fx.away || "",
        league: fx.league || "",
        kickoffISO: fx.kickoffISO || "",
      },
    });
  };

  const cancelPred = (fixtureId: string) => {
    Alert.alert(t("cancelPredTitle"), t("cancelPredMsg2"), [
      { text: t("dismiss"), style: "cancel" },
      {
        text: t("delete2"), style: "destructive",
        onPress: async () => {
          try {
            const r = await apiFetch("/api/pred/cancel", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fixtureId, userId }),
            });
            const j = await r.json();
            if (j?.ok) await loadMyPreds();
            else Alert.alert(t("error"), j?.error || "Silinemedi");
          } catch (e: any) {
            Alert.alert(t("error"), String(e?.message || e));
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

      /**
       * ⚠️ YÖNETİCİ BAŞLIĞI ŞART. Bu uç sunucuda `requireAdmin` ile korunuyor
       * (routes/rt.live-gs.cjs) ama buradaki çağrı düz `apiJson` kullanıyordu:
       * `lib/apiFetch.ts` yalnızca `x-auth-token` / `x-user-id` ekliyor,
       * `x-admin-token` EKLEMİYOR. Yani bu panelden yapılan her kaydetme
       * 401 ADMIN_TOKEN_REQUIRED ile düşüyordu.
       *
       * Sunucudaki muhafızın gerekçe notu "yönetim ekranı zaten x-admin-token
       * gönderiyor (withAdminHeaders)" diyor — bu `app/admin-live.tsx` için
       * DOĞRU (onun kendi sarmalayıcısı var), canlı sekmesindeki bu panel için
       * DEĞİLDİ.
       *
       * Başlık yalnızca BU çağrıya ekleniyor: `apiJson`'a genel olarak koymak,
       * ekrandaki sıradan isteklere de yönetici jetonu iliştirirdi.
       */
      const j1 = await apiJson(`/api/rt/admin-live-gs`, {
        method: "POST",
        headers: await withAdminHeaders({ "Content-Type": "application/json" }),
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

      /**
       * ⚠️ YÖNETİCİ BAŞLIĞI BURADA DA ŞART — bir üstteki çağrıya eklenmişti,
       * buna eklenmemişti. `/api/rt/settle2` muhafızı ara katman değil, gövdenin
       * içinde: `isInternalCaller(req)` ya loopback ya da geçerli `x-admin-token`
       * istiyor (lib/internal-caller.cjs). Mobil istemci hiçbir zaman loopback
       * olmadığına göre jeton tek yol; `apiJson` ise yalnızca `x-auth-token` /
       * `x-user-id` ekliyor. Yani "FT + settle2" seçeneği her seferinde 401
       * UNAUTHORIZED alıyor, FT yazılıyor ama ödeme hiç tetiklenmiyordu.
       */
      const j2 = await apiJson(`/api/rt/settle2?fixtureId=${encodeURIComponent(selectedFid)}`, {
        method: "POST",
        headers: await withAdminHeaders({ "Content-Type": "application/json" }),
      });
      if (!j2?.ok) {
        setAdmMsg(t("ftSettleFailed", { e: normalizeApiError(j2) }));
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
      setAddMsg(t("dateFormatBad"));
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
          league: addLeague.trim() || t("otherLeague"),
          country: "World",
          kickoffISO,
        }),
      });
      if (j?.ok) {
        setAddMsg(t("addedArrow", { a: j.action === "updated" ? t("updatedWord") : t("addedWord"), f: j.fixtureId }));
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
      const j = await apiJson(`/api/pred/match-board?fixtureId=${encodeURIComponent(selectedFid)}`, { method: "GET" });
      if (!j?.ok) {
        setAdmMsg(normalizeApiError(j));
        return;
      }

      // ⚠️ `j.leaderboard` HİÇ VAR OLMADI: uç `count`/`items` döndürüyor
      // (pred.cjs match-board). `ok` true olduğu için hata da görünmüyordu —
      // yönetici satır sayısını HER ZAMAN 0 okuyup "tablo boş" sanıyordu.
      // Boş ekrandan kötü: bildirim BAŞARI deyip YANLIŞ sayı veriyordu.
      // Doğru adı kardeş ekran zaten kullanıyor: mystatus.tsx `j.items`.
      const cnt = typeof j.count === "number" ? j.count : (Array.isArray(j.items) ? j.items.length : 0);
      const sc = j.finalScore ? `${j.finalScore.home} - ${j.finalScore.away}` : "-";
      setAdmMsg(t("boardOkRow", { s: sc, n: cnt }));
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
          : gorunenListe
        }
        // ⚠️ `it.code` yedeği KALDIRILDI: ölü koddu. Turnuva/1987 modlarında
        // `data` zaten [] (içerik ListHeaderComponent'te), yani buraya hiçbir
        // zaman MiniTournament gelmiyor — tip hatası bunu gösteriyordu.
        // Ayrıca eski hâldeki `Math.random()` yedeği her render'da yeni anahtar
        // üretip satırları gereksiz yere yeniden kurardı.
        keyExtractor={(it) => String(it.fixtureId)}
        renderItem={({ item, index }) => {
          // Normal maç
          const fid = String(item.fixtureId || "").trim();
          const hasPred = fid ? predFlags[fid] : null;

          // GRUP BAŞLIĞI: liste sunucudan öncelik sırasında geliyor
          // (ülke → küresel → büyük lig → diğer → hazırlık). Grup değiştiği
          // ilk maçta başlık basılır. Eleme yok — kullanıcı aşağı kaydırarak
          // her maça ulaşır, başlıklar yalnızca nerede olduğunu söyler.
          //
          // ⚠️ BAŞLIK SIRALAMAYA BAĞLI. "Önerilen" dışında öncelik başlıkları
          // YANILTICI olurdu: liste artık o sıraya göre dizili değil, aynı
          // başlık defalarca tekrar ederdi. Tarihe göre sıralamada başlık yok;
          // lige göre sıralamada başlık LİGİN KENDİSİ olur.
          const oncekiItem = index > 0 ? gorunenListe[index - 1] : null;
          const grup = siralama === "onerilen" ? (item.priorityGroup || null) : null;
          const oncekiGrup = siralama === "onerilen" ? (oncekiItem?.priorityGroup || null) : null;
          const basligiGoster = !!grup && grup !== oncekiGrup;

          const ligBasligi =
            siralama === "lig" ? ligEtiketi(item.league, item.country) : "";
          const oncekiLig =
            siralama === "lig" && oncekiItem ? ligEtiketi(oncekiItem.league, oncekiItem.country) : "";
          const ligBasligiGoster = !!ligBasligi && ligBasligi !== oncekiLig;

          return (
            <>
            {basligiGoster && <GroupHeader group={grup} country={userCountry} />}
            {ligBasligiGoster && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, marginBottom: 8 }}>
                <Text style={{ color: "#38bdf8", fontSize: 12, fontWeight: "900", letterSpacing: 0.4 }}>
                  {ligBasligi}
                </Text>
                <View style={{ flex: 1, height: 1, backgroundColor: "#38bdf833" }} />
              </View>
            )}
            <Item
              item={item}
              mode={mode}
              onPredict={goPredict}
              onRace={goRace}
              onDuel={goDuel}
              hasPred={hasPred}
              adminMode={adminMode}
              selected={adminMode && !!selectedFid && fid === selectedFid}
              onSelect={selectFx}
            />
            </>
          );
        }}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 12 }}>
            {/* ===== MİSAFİR ŞERTI ===== */}
            <GuestBanner />

            {/* ===== HAFTALIK KUPON — BİRİNCİL EYLEM =====
                ⚠️ SIRA DEĞİŞTİ (2026-08-06). Kupon `OyunModlari` içinde altı
                moddan biriydi ve yatay şeritte duruyordu; ana ekranın ilk
                eylemi tek maçlık "günün maçı" kartıydı. Yani haftanın 8 maçlık
                asıl oyunu, keşfedilmesi gereken bir yan özellik gibi
                sunuluyordu.

                Genişlik ligdeki maç sayısıyla verilir: kupon 8 maç, günün maçı
                1. Kupon üstte, günün maçı hemen altında (o da 1987 grubunun
                tepki katmanını taşıyor).

                ⚠️ Kupon yoksa kart KENDİNİ GİZLER — ana ekranın tepesinde boş
                bir kutu durmaz (bkz. components/KuponKarti.tsx). */}
            {(mode === "schedule" || mode === "open") && <KuponKarti />}

            {/* ===== GÜNÜN MAÇI — İKİNCİL =====
                ⚠️ BU KART VARDI AMA HİÇBİR EKRANA BAĞLI DEĞİLDİ — ölü kod.
                Besleyen uç (`/api/live/daily-featured`) de askıdaki
                API-Football'a gidip her çağrıda `null` dönüyordu; ikisi
                birlikte, tasarlanmış bir akış hiç çalışmıyordu.

                Neden duruyor: kupona katılmayan ya da kuponu olmayan kullanıcı
                için tek maçlık kısa bir döngü — tek soru (1-X-2), tahmin, o
                maçın sıralaması. Tepki katmanı da bu maça bağlı.

                Yalnızca normal maç listesinde; turnuva/1987 modlarında ekran
                zaten kendi içeriğine odaklı. */}
            {(mode === "schedule" || mode === "open") && (
              <DailyMatchCard country={userCountry || undefined} userId={userId} />
            )}

            {/* ===== OYUN MODLARI =====
                Altı mod farklı ekranlara dağılmış; yeni kullanıcı maç
                listesinden ötesini keşfetmiyordu. Keşfedilmeyen özellik,
                olmayan özelliktir. bkz. components/OyunModlari.tsx */}
            <OyunModlari
              macBedeli={macBedeli}
              kuponBedeli={kuponBedeli}
              is1987={is1987Member}
              onMod={setMode}
            />

            {/* ===== ÜLKEDE MAÇ YOK ŞERİDİ =====
                Sunucu ülke süzgeci sonuçsuz kalınca dünya listesine geri
                düşüyor (countryFallback). Açıklama olmadan kullanıcı kendi
                ülkesi dışından maç görünce bunu hata sanar. Ölçülen gerçek
                durum: Süper Lig sezon arasındayken Türk kullanıcının ilk
                maçı 14 gün sonraydı. */}
            {countryFallback && (
              <View
                style={{
                  flexDirection: "row", alignItems: "center", gap: 10,
                  backgroundColor: "#1c1917", borderRadius: 12,
                  borderWidth: 1, borderColor: "#f59e0b44",
                  paddingHorizontal: 14, paddingVertical: 11, marginBottom: 10,
                }}
              >
                <Text style={{ fontSize: 18 }}>🌍</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#f59e0b", fontWeight: "800", fontSize: 13 }}>
                    {t("noCountryMatches")}
                  </Text>
                  <Text style={{ color: "#a8a29e", fontSize: 11, marginTop: 2 }}>
                    {t("worldShown")}
                  </Text>
                </View>
              </View>
            )}

            {/* ===== HIZLI OYNA ===== */}
            {mode === "open" && (
              <QuickPlaySection country={userCountry} userId={userId} />
            )}

            {/* ===== SIRALAMA SEÇİCİ =====
                ⚠️ NEDEN VAR (kullanıcı bildirimi): tek sabit sıra vardı ve
                aranan maçı bulmak için sayfalarca kaydırmak gerekiyordu.
                "Önerilen" varsayılan kalıyor (kendi ülken üstte); ötekiler
                yalnızca GÖSTERİM sırasını değiştirir, hiçbir maçı elemez. */}
            {mode === "open" && gorunenListe.length > 1 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <Text style={{ color: "#78716c", fontSize: 11, fontWeight: "700" }}>{t("sortBy")}</Text>
                {([
                  { k: "onerilen", l: t("sortSuggested") },
                  { k: "tarih", l: t("sortByDate") },
                  { k: "lig", l: t("sortByLeague") },
                ] as const).map((s) => {
                  const secili = siralama === s.k;
                  return (
                    <TouchableOpacity
                      key={s.k}
                      onPress={() => setSiralama(s.k)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: secili }}
                      style={{
                        paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
                        borderWidth: 1,
                        borderColor: secili ? Colors.accent : "#1e293b",
                        backgroundColor: secili ? "#1d4ed822" : "#0a1120",
                      }}
                    >
                      <Text style={{ color: secili ? "#60a5fa" : "#64748b", fontSize: 11, fontWeight: secili ? "800" : "600" }}>
                        {s.l}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
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
              {mode === "mine" ? `📋 ${t("myBets")}`
                : mode === "tournaments" ? `🏆 ${t("tournaments")}`
                : mode === "gs1987" ? `🔴 ${t("gs1987mode")}`
                : mode === "schedule" ? (adminMode ? `Admin • ${t("matches")}` : t("matches"))
                : (adminMode ? `Admin • ${t("open")}` : t("open"))}
            </Text>

            {adminMode && runtimeMode?.profile === "PILOT_MANUAL" && (
              <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#1a0f00", borderRadius: 10, borderWidth: 1, borderColor: "#92400e66", paddingHorizontal: 12, paddingVertical: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: "800", color: "#fbbf24" }}>{t("pilotMode")}</Text>
                <Text style={{ flex: 1, fontSize: 11, color: "#92400e" }}>{t("pilotModeDesc", { n: runtimeMode.maxFixtures ?? 10 })}</Text>
              </View>
            )}

            <View style={{ marginTop: 10, gap: 6 }}>
              {/* Ana 4 sekme */}
              <View style={{ flexDirection: "row", backgroundColor: Colors.dark, borderRadius: 999, padding: 4 }}>
                {[
                  { key: "schedule" as const, label: t("matches") },
                  { key: "open" as const, label: t("open") },
                  { key: "mine" as const, label: t("myBets") },
                  { key: "tournaments" as const, label: t("tournaments") },
                ].map((tab) => {
                  const active = mode === tab.key;
                  return (
                    <TouchableOpacity
                      key={tab.key}
                      onPress={() => setMode(tab.key)}
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
                          fontSize: 11,
                        }}
                      >
                        {tab.label}
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

            {adminMode && (
              <>
                <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 10 }}>
                  {headerLine2 || t("fixtureInfo")}
                </Text>
                <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 2 }}>
                  {userId} • API: {baseInfo ?? "—"}
                </Text>
              </>
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
              <Text style={{ fontSize: 13, color: "#22c55e", fontWeight: "700" }}>{t("liveScoresBtn")}</Text>
            </TouchableOpacity>

            {predLoading && (
              <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 2 }}>
                {t("predMarksUpdating")}
              </Text>
            )}

            {error && (
              <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 4 }}>
                {adminMode ? `Hata: ${error}` : hataMesaji(error, t("matchesLoadFailed"))}
              </Text>
            )}

            {/* ===== TAHMİNLERİM İÇERİĞİ ===== */}
            {mode === "mine" && (
              <View style={{ gap: 8, marginTop: 4 }}>
                {myPredsLoading && <Text style={{ color: Colors.muted, fontSize: 12 }}>{t("loading")}</Text>}
                {/* Boş durum ALTTA, ListEmptyComponent içinde (eylem düğmeli).
                    Burada ikinci bir "henüz tahmin yok" metni göstermek,
                    aşağıdaki kartla birlikte iki kez tekrar demekti. */}

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
                        {t("oldPreds", { n: myPreds.old.length })}
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
                    <Text style={{ color: "#0f172a", fontWeight: "900", fontSize: 14 }}>{t("createTournament")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShowJoinTournament(true)}
                    style={{ flex: 1, backgroundColor: "#1e293b", borderRadius: 12, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: "#334155" }}
                  >
                    <Text style={{ color: "#f1f5f9", fontWeight: "900", fontSize: 14 }}>{t("joinByCode")}</Text>
                  </TouchableOpacity>
                </View>

                {(myTournamentsLoading || publicLoading) && (
                  <Text style={{ color: Colors.muted, fontSize: 12 }}>{t("loading")}</Text>
                )}

                {/* Katıldığım turnuvalar */}
                {myTournaments.length > 0 && (
                  <>
                    <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1 }}>{t("joinedOnes")}</Text>
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
                              {t2("participantsMatches", { p: t.memberCount, m: (t.fixtures || []).length })}
                              {t.finishedAt ? t2("finishedSuffix") : ""}
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
                    <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginTop: 6 }}>{t("openTournaments")}</Text>
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
                                {t2("participantsMatches", { p: t.memberCount, m: t.fixtureCount || (t.fixtures || []).length })}
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
                                {joinBusy === t.code ? "..." : t2("join")}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                  </>
                )}

                {!myTournamentsLoading && !publicLoading && myTournaments.length === 0 && publicTournaments.length === 0 && (
                  <Text style={{ color: Colors.muted, fontSize: 13 }}>{t("noOpenTournament")}</Text>
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
                      {t("gs1987Title")}
                    </Text>
                    <Text style={{ fontSize: 13, color: Colors.muted, textAlign: "center", marginBottom: 16, lineHeight: 20 }}>
                      {t("gs1987GateA")}{"\n"}
                      {t("gs1987GateB")}
                    </Text>

                    {isAnonymous && (
                      <TouchableOpacity
                        onPress={linkWithGoogle}
                        style={{ backgroundColor: "#0f2a0f", borderWidth: 1, borderColor: "#22c55e44", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, marginBottom: 16, flexDirection: "row", alignItems: "center", gap: 8 }}
                      >
                        <Text style={{ fontSize: 12 }}>💡</Text>
                        <Text style={{ flex: 1, fontSize: 12, color: "#4ade80", lineHeight: 18 }}>
                          {t("googleNoCode")}
                        </Text>
                      </TouchableOpacity>
                    )}

                    <View style={{ width: "100%", gap: 10 }}>
                      <TextInput
                        value={gs1987Code}
                        onChangeText={(t) => { setGs1987Code(t); setGs1987Error(null); }}
                        placeholder={t("gs1987CodePh")}
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
                          : <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15 }}>{t("loginBtn")}</Text>
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
                      {t("redHomeRow", { v: admRedHome ? t("varLbl2") : t("yokLbl2") })}
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
                      {t("redAwayRow", { v: admRedAway ? t("varLbl2") : t("yokLbl2") })}
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
                      {t("penaltyRow", { v: admPenaltyAny ? t("varLbl2") : t("yokLbl2") })}
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
                      {admBusy ? "..." : t("saveBtn2")}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    disabled={admBusy}
                    onPress={() =>
                      Alert.alert(
                        t("ftSettleTitle"),
                        t("ftSettleAsk"),
                        [
                          { text: t("dismiss"), style: "cancel" },
                          { text: t("continueWord"), style: "default", onPress: () => adminSaveState({ alsoSettle2: true }) },
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
                      {admBusy ? "..." : t("ftSettleShort")}
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
                      {admBusy ? "..." : t("rankingBtn")}
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
                    {t("newMatchAdd")}
                  </Text>
                  <Text style={{ color: Colors.muted, fontSize: 11 }}>{showAddFx ? t("hideBtn") : t("openBtn")}</Text>
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
                        {addBusy ? t("adding") : t("addToFixtures")}
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
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <ActivityIndicator size="small" color={Colors.live} />
              <Text style={{ marginTop: 8, color: Colors.muted, fontSize: 12 }}>
                {mode === "schedule" ? t("loadingMatches") : t("loadingOpen")}
              </Text>
            </View>
          ) : mode === "open" ? (
            // ─── Boş open → dünya vitrin + yakında açılacak ───────────────
            <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24, gap: 20 }}>

              {/* Başlık */}
              <View style={{ alignItems: "center", paddingVertical: 16, gap: 6 }}>
                <Text style={{ fontSize: 28 }}>⏳</Text>
                <Text style={{ color: "#e2e8f0", fontWeight: "800", fontSize: 15 }}>
                  {t("noOpenPreds")}
                </Text>
                <Text style={{ color: Colors.muted, fontSize: 12, textAlign: "center" }}>
                  {t("upcomingOpen")}
                </Text>
              </View>

              {/* Canlı dünya vitrin */}
              {emptyStateLoading && (
                <View style={{ alignItems: "center", paddingVertical: 16 }}>
                  <ActivityIndicator size="small" color={Colors.live} />
                </View>
              )}

              {!emptyStateLoading && emptyLiveLeagues.length > 0 && (
                <View style={{ gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.live }} />
                    <Text style={{ color: Colors.live, fontWeight: "800", fontSize: 12, letterSpacing: 0.5 }}>{t("worldNow")}</Text>
                    <TouchableOpacity onPress={() => router.push("/livescores")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={{ color: Colors.muted, fontSize: 11 }}>{t("seeAll")}</Text>
                    </TouchableOpacity>
                  </View>

                  {emptyLiveLeagues.map((league) => (
                    <View key={league.id} style={{ marginBottom: 6 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4, paddingHorizontal: 10, backgroundColor: "#0a1a0a", borderRadius: 6 }}>
                        <Text style={{ fontSize: 10, color: "#4ade80", fontWeight: "700", flex: 1 }} numberOfLines={1}>
                          {league.name}
                        </Text>
                        <Text style={{ fontSize: 9, color: Colors.muted }}>{ulkeAdi(league.country)}</Text>
                      </View>
                      {league.matches
                        .filter((m) => m.isLive || m.isHT)
                        .slice(0, 3)
                        .map((m, i) => (
                          <TouchableOpacity
                            key={i}
                            onPress={() => router.push("/livescores")}
                            style={{
                              flexDirection: "row", alignItems: "center",
                              paddingVertical: 7, paddingHorizontal: 10,
                              borderBottomWidth: 0.5, borderBottomColor: "#1a2a3a",
                              backgroundColor: "#071a0f",
                            }}
                          >
                            <Text style={{ fontSize: 9, color: Colors.live, fontWeight: "900", width: 26, textAlign: "center" }}>
                              {m.isHT ? "HT" : m.status.replace("'", "'")}
                            </Text>
                            <Text style={{ flex: 1, fontSize: 11, color: "#e2e8f0", textAlign: "right", paddingRight: 4 }} numberOfLines={1}>
                              {m.homeTeam}
                            </Text>
                            <Text style={{ fontSize: 13, fontWeight: "900", color: Colors.live, width: 44, textAlign: "center" }}>
                              {m.homeScore ?? "–"}–{m.awayScore ?? "–"}
                            </Text>
                            <Text style={{ flex: 1, fontSize: 11, color: "#e2e8f0", paddingLeft: 4 }} numberOfLines={1}>
                              {m.awayTeam}
                            </Text>
                          </TouchableOpacity>
                        ))}
                    </View>
                  ))}
                </View>
              )}

              {/* Yakında açılacak maçlar */}
              {!emptyStateLoading && emptyUpcoming.length > 0 && (
                <View style={{ gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <Text style={{ fontSize: 14 }}>📅</Text>
                    <Text style={{ color: "#f59e0b", fontWeight: "800", fontSize: 12, letterSpacing: 0.5 }}>{t("soonOpen")}</Text>
                    <TouchableOpacity onPress={() => setMode("schedule")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={{ color: Colors.muted, fontSize: 11 }}>{t("fullList")}</Text>
                    </TouchableOpacity>
                  </View>

                  {(() => {
                    const nowMs = nowFromServer();
                    // Tarihe göre grupla
                    const groups: { label: string; items: Fx[] }[] = [];
                    const seen = new Set<string>();
                    for (const fx of emptyUpcoming) {
                      const ms = kickoffMs(fx);
                      const diffH = ms ? (ms - nowMs) / 3600000 : null;
                      let label = t("soon");
                      if (diffH !== null) {
                        const d = new Date(ms!);
                        const dd = d.getDate().toString().padStart(2, "0");
                        const mm = (d.getMonth() + 1).toString().padStart(2, "0");
                        label = `${dd}/${mm}`;
                      }
                      if (!seen.has(label)) { seen.add(label); groups.push({ label, items: [] }); }
                      groups[groups.length - 1].items.push(fx);
                    }

                    return groups.map((g) => (
                      <View key={g.label} style={{ marginBottom: 8 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}>
                          <Text style={{ color: "#f59e0b", fontSize: 10, fontWeight: "800" }}>{g.label}</Text>
                          <View style={{ flex: 1, height: 0.5, backgroundColor: "#1e293b" }} />
                        </View>
                        {g.items.map((fx) => {
                          const ms = kickoffMs(fx);
                          const diffH = ms ? Math.max(0, (ms - nowMs) / 3600000) : null;
                          const opensIn = diffH !== null && diffH > PREDICT_OPEN_AHEAD_HOURS
                            ? t("opensInH", { h: Math.round(diffH - PREDICT_OPEN_AHEAD_HOURS) })
                            : t("opensSoon");
                          const timeStr = formatTimeTR(fx.kickoffISO ?? null);
                          return (
                            <View
                              key={fx.fixtureId}
                              style={{
                                flexDirection: "row", alignItems: "center",
                                paddingVertical: 8, paddingHorizontal: 10,
                                borderBottomWidth: 0.5, borderBottomColor: "#1a2a3a",
                                backgroundColor: "#0a1520",
                              }}
                            >
                              <Text style={{ fontSize: 10, color: Colors.muted, width: 34, textAlign: "center" }}>
                                {timeStr ?? "—"}
                              </Text>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 12, color: "#cbd5e1", fontWeight: "600" }} numberOfLines={1}>
                                  {fx.home} – {fx.away}
                                </Text>
                                {fx.league ? (
                                  <Text style={{ fontSize: 9, color: Colors.muted }} numberOfLines={1}>{fx.league}</Text>
                                ) : null}
                              </View>
                              <View style={{ backgroundColor: "#1a2a0a", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: "#f59e0b33" }}>
                                <Text style={{ color: "#f59e0b", fontSize: 9, fontWeight: "700" }}>{opensIn}</Text>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    ));
                  })()}
                </View>
              )}

              {!emptyStateLoading && emptyLiveLeagues.length === 0 && emptyUpcoming.length === 0 && (
                <View style={{ alignItems: "center", paddingVertical: 12 }}>
                  <Text style={{ color: Colors.muted, fontSize: 12 }}>{t("upcomingLoadFailed")}</Text>
                  <TouchableOpacity onPress={() => loadEmptyState()} style={{ marginTop: 10 }}>
                    <Text style={{ color: Colors.primary, fontSize: 12, fontWeight: "700" }}>{t("retry")}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : (
            /**
             * BOŞ DURUM = SORU + CEVAP.
             *
             * ⚠️ Eski hâli üç kusur taşıyordu:
             *  • Hiçbiri EYLEM sunmuyordu — "Henüz tahmin yapmadın." deyip
             *    kullanıcıyı boş ekranda bırakıyordu. Boş liste, terk etmenin
             *    en kolay olduğu andır; oradan çıkış yolu göstermek şart.
             *  • "Liste penceresinde maç görünmüyor" iç jargon (kullanıcı
             *    "liste penceresi"nin ne olduğunu bilmiyor).
             *  • gs1987 modunda metin BOŞ STRING'di: ekranda hiçbir şey yok,
             *    yükleniyor mu bitti mi belli değil.
             */
            (() => {
              /**
               * ⚠️ "mine" / "tournaments" / "gs1987" modlarında listenin `data`
               * alanı HER ZAMAN [] — içerik ListHeaderComponent'te çiziliyor.
               * Yani ListEmptyComponent, tahminler VARKEN de render ediliyordu:
               * kullanıcı hem tahminlerini hem altında "Henüz tahmin yapmadın"
               * kartını görüyordu. Boş durumu büyütüp düğme eklediğim için
               * çelişki iyice göze batar hale geldi.
               * Çözüm: bu modlarda gerçek içeriğe bak, boşsa göster.
               */
              if (mode === "mine" && (myPredsLoading || myPreds.current.length > 0 || myPreds.old.length > 0)) {
                return null;
              }
              if (mode === "tournaments" && (myTournamentsLoading || myTournaments.length > 0)) {
                return null;
              }

              const bos =
                mode === "mine"
                  ? {
                      baslik: t("emptyMineTitle"),
                      alt: t("emptyMineAlt"),
                      cta: t("emptyMineCta"),
                      git: () => setMode("schedule"),
                    }
                  : mode === "tournaments"
                  ? {
                      baslik: t("emptyTourTitle"),
                      alt: t("emptyTourAlt"),
                      cta: t("emptyTourCta"),
                      git: () => router.push({ pathname: "/mini/create", params: { userId } } as any),
                    }
                  : mode === "gs1987"
                  ? {
                      baslik: t("emptyGsTitle"),
                      alt: t("emptyGsAlt"),
                      cta: t("emptyGsCta"),
                      git: () => setMode("schedule"),
                    }
                  : {
                      // Buraya yalnızca "schedule" modu düşer: "open" modu
                      // yukarıda kendi dalında ele alınıyor.
                      baslik: t("emptySchedTitle"),
                      alt: t("emptySchedAlt"),
                      cta: t("refresh"),
                      git: () => onRefresh(),
                    };

              return (
                <View style={{ paddingVertical: 32, alignItems: "center", paddingHorizontal: 24, gap: 8 }}>
                  <Text style={{ color: "#e2e8f0", fontSize: 15, fontWeight: "800", textAlign: "center" }}>
                    {bos.baslik}
                  </Text>
                  <Text style={{ color: Colors.muted, fontSize: 12.5, textAlign: "center", lineHeight: 18 }}>
                    {bos.alt}
                  </Text>
                  <TouchableOpacity
                    onPress={bos.git}
                    style={{
                      marginTop: 8, backgroundColor: Colors.primary, borderRadius: 999,
                      paddingHorizontal: 18, paddingVertical: 9,
                    }}
                  >
                    <Text style={{ color: Colors.onAccent, fontWeight: "800", fontSize: 13 }}>{bos.cta}</Text>
                  </TouchableOpacity>
                </View>
              );
            })()
          )
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    </View>
  );
}

