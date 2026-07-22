import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { getApiBase } from "../lib/apiBase";
import BackBar from "../components/BackBar";
import Colors from "../constants/colors";

// ─── Types ────────────────────────────────────────────────────────────────────

type Match = {
  homeTeam: string;
  awayTeam: string;
  homeScore: string | null;
  awayScore: string | null;
  status: string;
  startTime: string;
  matchDate: string;
  htScore: string | null;
  homeCrest: string | null;
  awayCrest: string | null;
  homeRed: number;
  awayRed: number;
  isLive: boolean;
  isHT: boolean;
  isFinished: boolean;
};

type League = {
  id: string;
  name: string;
  country: string;
  known?: boolean;
  matches: Match[];
};

type ApiResponse = {
  ok: boolean;
  ts: string | null;
  source?: string | null;
  leagues: Record<string, League>;
  totalMatchCount?: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COUNTRY_EMOJI: Record<string, string> = {
  "Turkey": "🇹🇷",    "Türkiye": "🇹🇷",
  "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",  "İngiltere": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "Spain": "🇪🇸",     "İspanya": "🇪🇸",
  "Germany": "🇩🇪",   "Almanya": "🇩🇪",
  "France": "🇫🇷",    "Fransa": "🇫🇷",
  "Italy": "🇮🇹",     "İtalya": "🇮🇹",
  "Netherlands": "🇳🇱","Hollanda": "🇳🇱",
  "Portugal": "🇵🇹",  "Portekiz": "🇵🇹",
  "Belgium": "🇧🇪",   "Belçika": "🇧🇪",
  "Scotland": "🏴󠁧󠁢󠁳󠁣󠁴󠁿","İskoçya": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "Europe": "🏆",     "Avrupa": "🏆",
  "World": "🌍",      "Dünya": "🌍",
  "Brazil": "🇧🇷",    "Brezilya": "🇧🇷",
  "Argentina": "🇦🇷", "Arjantin": "🇦🇷",
  "USA": "🇺🇸",       "ABD": "🇺🇸", "United States": "🇺🇸",
  "Mexico": "🇲🇽",    "Meksika": "🇲🇽",
  "Russia": "🇷🇺",    "Rusya": "🇷🇺",
  "South Korea": "🇰🇷","Güney Kore": "🇰🇷",
  "Japan": "🇯🇵",     "Japonya": "🇯🇵",
  "China": "🇨🇳",     "Çin": "🇨🇳",
  "Greece": "🇬🇷",    "Yunanistan": "🇬🇷",
  "Croatia": "🇭🇷",   "Hırvatistan": "🇭🇷",
  "Serbia": "🇷🇸",    "Sırbistan": "🇷🇸",
  "Ukraine": "🇺🇦",   "Ukrayna": "🇺🇦",
  "Poland": "🇵🇱",    "Polonya": "🇵🇱",
  "Austria": "🇦🇹",   "Avusturya": "🇦🇹",
  "Switzerland": "🇨🇭","İsviçre": "🇨🇭",
  "Sweden": "🇸🇪",    "İsveç": "🇸🇪",
  "Denmark": "🇩🇰",   "Danimarka": "🇩🇰",
  "Norway": "🇳🇴",    "Norveç": "🇳🇴",
  "Romania": "🇷🇴",   "Romanya": "🇷🇴",
  "Hungary": "🇭🇺",   "Macaristan": "🇭🇺",
  "Morocco": "🇲🇦",   "Fas": "🇲🇦",
  "Egypt": "🇪🇬",     "Mısır": "🇪🇬",
  "Saudi Arabia": "🇸🇦","Suudi Arabistan": "🇸🇦",
  "Algeria": "🇩🇿",   "Cezayir": "🇩🇿",
  "Nigeria": "🇳🇬",   "Nijerya": "🇳🇬",
  "Colombia": "🇨🇴",  "Kolombiya": "🇨🇴",
  "Chile": "🇨🇱",
  "Iran": "🇮🇷",      "İran": "🇮🇷",
  "Qatar": "🇶🇦",     "Katar": "🇶🇦",
  "Israel": "🇮🇱",    "İsrail": "🇮🇱",
  "Australia": "🇦🇺", "Avustralya": "🇦🇺",
  "Czechia": "🇨🇿",   "Czech Republic": "🇨🇿",
  "Finland": "🇫🇮",   "Finlandiya": "🇫🇮",
  "Bulgaria": "🇧🇬",  "Bulgaristan": "🇧🇬",
  "Ecuador": "🇪🇨",   "Ekvador": "🇪🇨",
  "Bolivia": "🇧🇴",   "Bolivya": "🇧🇴",
  "Paraguay": "🇵🇾",
  "Estonia": "🇪🇪",   "Estonya": "🇪🇪",
  "Canada": "🇨🇦",    "Kanada": "🇨🇦",
  "Uzbekistan": "🇺🇿","Özbekistan": "🇺🇿",
  "New Zealand": "🇳🇿","Yeni Zelanda": "🇳🇿",
  "Mozambique": "🇲🇿", "Mozambik": "🇲🇿",
  "Ireland": "🇮🇪",   "İrlanda": "🇮🇪",
  "Northern Ireland": "🇬🇧",
  "South America": "🌎","Güney Amerika": "🌎",
  "Asia": "🌏",        "Asya": "🌏",
};

function flag(country: string) {
  return COUNTRY_EMOJI[country] ?? "⚽";
}

function liveCount(l: League) {
  return l.matches.filter((m) => m.isLive || m.isHT).length;
}

function formatDate(dateStr: string) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (!Number.isFinite(d.getTime())) return dateStr;
    const day  = d.getDate();
    const months = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];
    const month = months[d.getMonth()];
    return `${day} ${month}`;
  } catch {
    return dateStr;
  }
}

function sortByLive(leagues: League[]) {
  return [...leagues].sort((a, b) => {
    const lc = liveCount(b) - liveCount(a);
    if (lc !== 0) return lc;
    return b.matches.length - a.matches.length;
  });
}

const FEATURED_IDS = [
  "sampiyonlar-ligi","ingiltere-premier-lig","ispanya-la-liga",
  "turkiye-super-lig","turkiye-1-lig",
];

function getGlobalHighlights(all: League[]): League[] {
  const live = all
    .filter((l) => liveCount(l) > 0)
    .sort((a, b) => {
      if (a.known !== b.known) return a.known ? -1 : 1;
      return liveCount(b) - liveCount(a);
    });
  const liveIds = new Set(live.map((l) => l.id));
  const rest = all
    .filter((l) => !liveIds.has(l.id) && l.matches.length > 0)
    .sort((a, b) => {
      const aF = FEATURED_IDS.indexOf(a.id);
      const bF = FEATURED_IDS.indexOf(b.id);
      if (aF !== -1 || bF !== -1) {
        if (aF === -1) return 1;
        if (bF === -1) return -1;
        return aF - bF;
      }
      if (a.known !== b.known) return a.known ? -1 : 1;
      return b.matches.length - a.matches.length;
    });
  return [...live, ...rest].slice(0, 20);
}

// ─── MatchRow — ince tek satır ────────────────────────────────────────────────

function statusLabel(m: Match) {
  if (m.isHT)       return "HT";
  if (m.isLive)     return m.status.replace("'", "'");
  if (m.isFinished) return "FT";
  return m.startTime || "—";
}

function MatchRow({ match: m, onPredict }: { match: Match; onPredict: () => void }) {
  const active = m.isLive || m.isHT;
  const liveColor = Colors.live;

  return (
    <TouchableOpacity
      onPress={onPredict}
      activeOpacity={0.75}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderBottomWidth: 0.5,
        borderBottomColor: "#1a2a3a",
        backgroundColor: active ? "#071a0f" : "transparent",
      }}
    >
      {/* Durum */}
      <Text
        style={{
          width: 34,
          fontSize: 10,
          fontWeight: active ? "900" : "400",
          color: active ? liveColor : Colors.muted,
          textAlign: "center",
        }}
      >
        {statusLabel(m)}
      </Text>

      {/* Ev sahibi */}
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, paddingRight: 4 }}>
        {m.homeCrest ? (
          <Image source={{ uri: m.homeCrest }} style={{ width: 14, height: 14 }} />
        ) : null}
        <Text
          style={{ fontSize: 12, color: active ? "#f1f5f9" : "#94a3b8", fontWeight: active ? "700" : "400", textAlign: "right" }}
          numberOfLines={1}
        >
          {m.homeTeam}
        </Text>
        {m.homeRed > 0 && (
          <View style={{ width: 9, height: 12, backgroundColor: "#dc2626", borderRadius: 1.5, marginLeft: 1 }} />
        )}
      </View>

      {/* Skor */}
      <View style={{ width: 54, alignItems: "center" }}>
        {m.homeScore != null && m.awayScore != null ? (
          <>
            <Text style={{ fontSize: 14, fontWeight: "900", color: active ? liveColor : "#e2e8f0", letterSpacing: 0.5 }}>
              {m.homeScore}–{m.awayScore}
            </Text>
            {m.htScore && !m.isLive && (
              <Text style={{ fontSize: 8, color: "#475569", marginTop: -1 }}>
                {m.htScore}
              </Text>
            )}
          </>
        ) : (
          <Text style={{ fontSize: 11, color: "#334155", fontWeight: "600" }}>vs</Text>
        )}
      </View>

      {/* Deplasman */}
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 4 }}>
        {m.awayRed > 0 && (
          <View style={{ width: 9, height: 12, backgroundColor: "#dc2626", borderRadius: 1.5, marginRight: 1 }} />
        )}
        <Text
          style={{ fontSize: 12, color: active ? "#f1f5f9" : "#94a3b8", fontWeight: active ? "700" : "400" }}
          numberOfLines={1}
        >
          {m.awayTeam}
        </Text>
        {m.awayCrest ? (
          <Image source={{ uri: m.awayCrest }} style={{ width: 14, height: 14 }} />
        ) : null}
      </View>

      {/* Tahmin CTA */}
      <TouchableOpacity
        onPress={onPredict}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 0 }}
        style={{
          marginLeft: 8,
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 6,
          backgroundColor: active ? "#14532d55" : "#1e293b",
          borderWidth: 1,
          borderColor: active ? "#22c55e44" : "#334155",
        }}
      >
        <Text style={{ fontSize: 10, color: active ? "#4ade80" : "#64748b", fontWeight: "700" }}>⚽ →</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ─── Lig bölümü — tarih alt gruplama ile ─────────────────────────────────────

function LeagueSection({
  league,
  onPredict,
}: {
  league: League;
  onPredict: (m: Match) => void;
}) {
  const live = liveCount(league);

  // Tarihe göre grupla
  const byDate = useMemo(() => {
    const map: Record<string, Match[]> = {};
    for (const m of league.matches) {
      const key = m.matchDate || "today";
      if (!map[key]) map[key] = [];
      map[key].push(m);
    }
    // Her tarih içinde: canlı → programlı → biten
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => {
        const rank = (x: Match) => x.isLive || x.isHT ? 0 : x.isFinished ? 2 : 1;
        return rank(a) - rank(b);
      });
    }
    const dates = Object.keys(map).sort();
    return dates.map((d) => ({ date: d, matches: map[d] }));
  }, [league.matches]);

  const multiDay = byDate.length > 1;

  return (
    <View style={{ marginBottom: 2 }}>
      {/* Lig başlığı */}
      <View style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        paddingVertical: 7,
        backgroundColor: "#0f172a",
        borderTopWidth: 1,
        borderTopColor: "#1e293b",
      }}>
        <Text style={{ fontSize: 15, marginRight: 6 }}>{flag(league.country)}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: "800", color: "#e2e8f0" }} numberOfLines={1}>
            {league.name}
          </Text>
          <Text style={{ fontSize: 10, color: "#475569" }}>{league.country}</Text>
        </View>
        {live > 0 && (
          <View style={{ backgroundColor: Colors.live, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginRight: 8 }}>
            <Text style={{ color: "#fff", fontSize: 9, fontWeight: "900" }}>●{live}</Text>
          </View>
        )}
        <Text style={{ fontSize: 10, color: "#475569" }}>{league.matches.length}</Text>
      </View>

      {byDate.map(({ date, matches }) => (
        <View key={date}>
          {multiDay && (
            <View style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 12,
              paddingVertical: 4,
              backgroundColor: "#0a1120",
            }}>
              <Text style={{ fontSize: 10, color: "#334155", fontWeight: "700", marginRight: 8 }}>
                📅 {date === "today" ? "Bugün" : formatDate(date)}
              </Text>
              <View style={{ flex: 1, height: 0.5, backgroundColor: "#1e293b" }} />
            </View>
          )}
          {matches.map((m, i) => (
            <MatchRow key={i} match={m} onPredict={() => onPredict(m)} />
          ))}
        </View>
      ))}
    </View>
  );
}

// ─── Promo kartları ───────────────────────────────────────────────────────────

function PromoCard({
  hotMatch,
  onTap,
}: {
  hotMatch: Match | null;
  onTap: () => void;
}) {
  const title = hotMatch
    ? `${hotMatch.homeTeam} – ${hotMatch.awayTeam}`
    : "Bugünün maçları";
  const sub = hotMatch?.isLive
    ? `🔴 Canlı maç devam ediyor! Tahminde tahmin lideri kim?`
    : `Bu maçın tahmin krallığı seni bekliyor`;

  return (
    <TouchableOpacity
      onPress={onTap}
      activeOpacity={0.85}
      style={{
        marginHorizontal: 12,
        marginVertical: 10,
        borderRadius: 14,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "#22c55e44",
      }}
    >
      <View style={{
        backgroundColor: "#071a0f",
        padding: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}>
        <Text style={{ fontSize: 28 }}>🏆</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#4ade80", fontWeight: "900", fontSize: 13 }}>{title}</Text>
          <Text style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>{sub}</Text>
        </View>
        <View style={{
          backgroundColor: "#16a34a",
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 7,
        }}>
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 12 }}>Tahmin Yap</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function BottomPromo({ onTap }: { onTap: () => void }) {
  return (
    <TouchableOpacity
      onPress={onTap}
      activeOpacity={0.85}
      style={{
        marginHorizontal: 12,
        marginVertical: 16,
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      <View style={{
        backgroundColor: "#0f172a",
        borderWidth: 1,
        borderColor: "#f59e0b55",
        borderRadius: 14,
        padding: 16,
        alignItems: "center",
        gap: 6,
      }}>
        <Text style={{ fontSize: 30 }}>🌍</Text>
        <Text style={{ color: "#f59e0b", fontWeight: "900", fontSize: 15, textAlign: "center" }}>
          Dünya Tahmin Şampiyonu Ol
        </Text>
        <Text style={{ color: "#78716c", fontSize: 12, textAlign: "center" }}>
          Maçları bil, puan kazan, liderlik tablosuna gir
        </Text>
        <View style={{
          marginTop: 6,
          backgroundColor: "#f59e0b",
          borderRadius: 8,
          paddingHorizontal: 24,
          paddingVertical: 9,
        }}>
          <Text style={{ color: "#000", fontWeight: "900", fontSize: 13 }}>🎯 Hemen Başla</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Ana ekran ────────────────────────────────────────────────────────────────

export default function LiveScoresScreen() {
  const router = useRouter();
  const [data, setData]             = useState<ApiResponse | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const base = await getApiBase();
      const res  = await fetch(`${base}/api/livescore/matches`);
      const j    = await res.json();
      if (!j.ok) throw new Error(j.error || "API error");
      setData(j);
      if (j.ts) {
        setLastUpdate(new Date(j.ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }));
      }
    } catch (e: any) {
      setError(e.message || "Bağlantı hatası");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(() => load(true), 30_000);
    return () => clearInterval(iv);
  }, [load]);

  const onRefresh = () => { setRefreshing(true); load(true); };

  const allLeagues = useMemo(() => Object.values(data?.leagues ?? {}), [data]);

  const countries = useMemo(() => {
    const map: Record<string, { total: number; live: number }> = {};
    allLeagues.forEach((l) => {
      if (!l.country) return;
      if (!map[l.country]) map[l.country] = { total: 0, live: 0 };
      map[l.country].total += l.matches.length;
      map[l.country].live  += liveCount(l);
    });
    return Object.entries(map)
      .sort(([, a], [, b]) => b.live - a.live || b.total - a.total)
      .map(([c]) => c);
  }, [allLeagues]);

  const { displayLeagues, isFallback, splitAt } = useMemo(() => {
    if (!selectedCountry) {
      return { displayLeagues: sortByLive(allLeagues), isFallback: false, splitAt: -1 };
    }
    const countryLeagues = allLeagues.filter((l) => l.country === selectedCountry);
    const otherLeagues   = allLeagues.filter((l) => l.country !== selectedCountry);
    if (countryLeagues.some((l) => l.matches.length > 0)) {
      const sorted = sortByLive(countryLeagues);
      const rest   = getGlobalHighlights(otherLeagues);
      return { displayLeagues: [...sorted, ...rest], isFallback: false, splitAt: sorted.length };
    }
    return { displayLeagues: getGlobalHighlights(allLeagues), isFallback: true, splitAt: -1 };
  }, [allLeagues, selectedCountry]);

  const totalLive = useMemo(() => allLeagues.reduce((s, l) => s + liveCount(l), 0), [allLeagues]);

  // En sıcak canlı maç (promo için)
  const hotMatch = useMemo(() => {
    for (const l of displayLeagues) {
      const m = l.matches.find((x) => x.isLive || x.isHT);
      if (m) return m;
    }
    return displayLeagues[0]?.matches[0] ?? null;
  }, [displayLeagues]);

  function goPredict(m?: Match) {
    router.push({ pathname: "/(tabs)/live", params: { tab: "open" } } as any);
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#030d18" }}>
      <BackBar title="Canlı Skorlar" />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.live} />}
      >
        {/* Üst bilgi şeridi */}
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 12,
          paddingTop: 8,
          paddingBottom: 6,
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {totalLive > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#14532d55", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: "#22c55e33" }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.live }} />
                <Text style={{ color: Colors.live, fontSize: 11, fontWeight: "800" }}>{totalLive} Canlı</Text>
              </View>
            )}
            {data?.source ? (
              <Text style={{ fontSize: 9, color: "#334155" }}>/{data.source}</Text>
            ) : null}
          </View>
          <Text style={{ fontSize: 10, color: "#334155" }}>{lastUpdate ? `⟳ ${lastUpdate}` : ""}</Text>
        </View>

        {/* Ülke filtre chipleri */}
        {countries.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingHorizontal: 12, paddingBottom: 8 }}
          >
            <TouchableOpacity
              onPress={() => setSelectedCountry(null)}
              style={{
                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
                backgroundColor: selectedCountry === null ? Colors.primary : "#0f172a",
                borderWidth: 1,
                borderColor: selectedCountry === null ? Colors.primary : "#1e293b",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 11 }}>🌍 Tümü</Text>
            </TouchableOpacity>
            {countries.map((c) => {
              const active  = selectedCountry === c;
              const liveCnt = allLeagues.filter((l) => l.country === c).reduce((s, l) => s + liveCount(l), 0);
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => setSelectedCountry(active ? null : c)}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 4,
                    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
                    backgroundColor: active ? Colors.primary : "#0f172a",
                    borderWidth: 1,
                    borderColor: active ? Colors.primary : liveCnt > 0 ? "#22c55e33" : "#1e293b",
                  }}
                >
                  <Text style={{ fontSize: 12 }}>{flag(c)}</Text>
                  <Text style={{ color: active ? "#fff" : "#94a3b8", fontWeight: active ? "700" : "400", fontSize: 11 }}>{c}</Text>
                  {liveCnt > 0 && (
                    <View style={{ backgroundColor: Colors.live, borderRadius: 5, paddingHorizontal: 4, paddingVertical: 1 }}>
                      <Text style={{ color: "#fff", fontSize: 8, fontWeight: "900" }}>{liveCnt}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Fallback banner */}
        {isFallback && selectedCountry && (
          <View style={{
            flexDirection: "row", alignItems: "center", gap: 8,
            marginHorizontal: 12, marginBottom: 8,
            backgroundColor: "#0a1a2a", borderRadius: 10,
            borderWidth: 1, borderColor: "#22c55e22",
            paddingHorizontal: 12, paddingVertical: 8,
          }}>
            <Text style={{ fontSize: 16 }}>{flag(selectedCountry)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#64748b", fontSize: 11, fontWeight: "600" }}>
                {selectedCountry}'da bugün maç bulunamadı
              </Text>
              <Text style={{ color: "#22c55e", fontSize: 10, marginTop: 1 }}>
                🌍 Dünyadan öne çıkan maçlar gösteriliyor
              </Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedCountry(null)}>
              <Text style={{ color: "#334155", fontSize: 18 }}>×</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* İçerik */}
        {loading && !refreshing ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <ActivityIndicator size="large" color={Colors.live} />
            <Text style={{ marginTop: 12, color: "#334155", fontSize: 13 }}>Maçlar yükleniyor...</Text>
          </View>
        ) : error ? (
          <View style={{ margin: 12, padding: 16, borderRadius: 12, backgroundColor: "#1a0a0a", borderWidth: 1, borderColor: "#dc262644" }}>
            <Text style={{ color: "#fca5a5", fontWeight: "700", fontSize: 13 }}>Bağlantı hatası</Text>
            <Text style={{ color: "#7f1d1d", fontSize: 11, marginTop: 4 }}>{error}</Text>
            <TouchableOpacity
              onPress={() => load()}
              style={{ marginTop: 12, backgroundColor: "#dc2626", paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, alignSelf: "flex-start" }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Tekrar Dene</Text>
            </TouchableOpacity>
          </View>
        ) : displayLeagues.length === 0 ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <Text style={{ fontSize: 36, marginBottom: 10 }}>⚽</Text>
            <Text style={{ color: "#334155", fontSize: 14, fontWeight: "600" }}>Bugün canlı maç yok</Text>
            {selectedCountry && (
              <TouchableOpacity onPress={() => setSelectedCountry(null)} style={{ marginTop: 14 }}>
                <Text style={{ color: Colors.primary, fontSize: 13, fontWeight: "700" }}>Tüm ülkeleri göster</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            {/* Üst promo */}
            <PromoCard hotMatch={hotMatch} onTap={() => goPredict(hotMatch ?? undefined)} />

            {displayLeagues.map((league, idx) => (
              <View key={league.id}>
                {/* Dünyadan ayracı */}
                {splitAt > 0 && idx === splitAt && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 12, marginVertical: 10 }}>
                    <View style={{ flex: 1, height: 0.5, backgroundColor: "#1e293b" }} />
                    <Text style={{ color: "#334155", fontSize: 10, fontWeight: "700" }}>🌍 Dünyadan</Text>
                    <View style={{ flex: 1, height: 0.5, backgroundColor: "#1e293b" }} />
                  </View>
                )}

                <LeagueSection league={league} onPredict={(m) => goPredict(m)} />

                {/* Her 5 ligde bir araya promo */}
                {(idx + 1) % 5 === 0 && idx < displayLeagues.length - 1 && (
                  <TouchableOpacity
                    onPress={() => goPredict()}
                    activeOpacity={0.8}
                    style={{
                      marginHorizontal: 12, marginVertical: 8,
                      backgroundColor: "#0f1a2a",
                      borderRadius: 10, borderWidth: 1, borderColor: "#3b82f633",
                      flexDirection: "row", alignItems: "center", gap: 10,
                      paddingHorizontal: 14, paddingVertical: 10,
                    }}
                  >
                    <Text style={{ fontSize: 20 }}>🎯</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "#60a5fa", fontWeight: "800", fontSize: 12 }}>Tahmin Oyununa Katıl</Text>
                      <Text style={{ color: "#334155", fontSize: 10 }}>Maçları bil, puan kazan, liderlik tablosuna gir</Text>
                    </View>
                    <Text style={{ color: "#3b82f6", fontSize: 16 }}>›</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {/* Alt promo */}
            <BottomPromo onTap={() => goPredict()} />
          </>
        )}
      </ScrollView>
    </View>
  );
}
