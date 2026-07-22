import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  RefreshControl,
} from "react-native";
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

// ─── Country emoji map ────────────────────────────────────────────────────────

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
  "Japan": "🇯🇵",     "Japonya": "🇯🇵",
  "South Korea": "🇰🇷","Güney Kore": "🇰🇷",
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
  "Czechia": "🇨🇿",   "Çekya": "🇨🇿", "Czech Republic": "🇨🇿",
  "Slovakia": "🇸🇰",  "Slovakya": "🇸🇰",
  "Bulgaria": "🇧🇬",  "Bulgaristan": "🇧🇬",
  "Finland": "🇫🇮",   "Finlandiya": "🇫🇮",
  "Ghana": "🇬🇭",
  "Cameroon": "🇨🇲",  "Kamerun": "🇨🇲",
  "Ivory Coast": "🇨🇮","Fildişi Sahili": "🇨🇮",
};

function countryEmoji(country: string) {
  return COUNTRY_EMOJI[country] ?? "⚽";
}

// ─── Highlight/fallback logic ─────────────────────────────────────────────────

// Öne çıkan lig ID'leri (öncelik sırası)
const FEATURED_IDS = [
  "sampiyonlar-ligi",
  "ingiltere-premier-lig",
  "ispanya-la-liga",
  "turkiye-super-lig",
  "turkiye-1-lig",
];

function liveCount(l: League) {
  return l.matches.filter((m) => m.isLive || m.isHT).length;
}

function sortByLive(leagues: League[]) {
  return [...leagues].sort((a, b) => {
    const diff = liveCount(b) - liveCount(a);
    if (diff !== 0) return diff;
    return b.matches.length - a.matches.length;
  });
}

// Seçili ülkede maç yoksa dünya öne çıkanlarını döner
function getGlobalHighlights(all: League[]): League[] {
  const live = all
    .filter((l) => liveCount(l) > 0)
    .sort((a, b) => {
      // Canlı liglerde önce büyük ligler (known), sonra canlı sayısı
      if (a.known !== b.known) return a.known ? -1 : 1;
      return liveCount(b) - liveCount(a);
    });

  const liveIds = new Set(live.map((l) => l.id));

  const upcoming = all
    .filter((l) => !liveIds.has(l.id) && l.matches.length > 0)
    .sort((a, b) => {
      // Önce bilinen/öne çıkan ligler
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

  return [...live, ...upcoming].slice(0, 20);
}

// ─── Match card ───────────────────────────────────────────────────────────────

function statusColor(m: Match) {
  if (m.isLive || m.isHT) return Colors.live;
  if (m.isFinished) return (Colors as any).finished ?? Colors.muted;
  return Colors.muted;
}

function statusLabel(m: Match) {
  if (m.isHT) return "Devre Arası";
  if (m.isLive) return m.status;
  if (m.isFinished) return "Bitti";
  return m.startTime || m.status;
}

function MatchCard({ match: m }: { match: Match }) {
  const sc = statusColor(m);
  return (
    <View style={{
      backgroundColor: "#fff",
      borderRadius: 10,
      padding: 10,
      marginBottom: 6,
      borderWidth: 1,
      borderColor: m.isLive ? Colors.live + "44" : Colors.border,
      borderLeftWidth: m.isLive ? 3 : 1,
      borderLeftColor: m.isLive ? Colors.live : Colors.border,
    }}>
      <View style={{ flexDirection: "row", justifyContent: "center", marginBottom: 6 }}>
        <Text style={{ fontSize: 11, color: sc, fontWeight: "700" }}>{statusLabel(m)}</Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {/* Home */}
        <View style={{ flex: 1, alignItems: "flex-end", flexDirection: "row", justifyContent: "flex-end", gap: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: Colors.slate900, textAlign: "right", flexShrink: 1 }} numberOfLines={1}>
            {m.homeTeam}
          </Text>
          {m.homeCrest ? <Image source={{ uri: m.homeCrest }} style={{ width: 20, height: 20 }} /> : null}
          {m.homeRed > 0 && <Text style={{ fontSize: 10 }}>🟥</Text>}
        </View>

        {/* Score */}
        <View style={{ width: 64, alignItems: "center" }}>
          {m.homeScore != null && m.awayScore != null ? (
            <Text style={{ fontSize: 18, fontWeight: "900", color: m.isLive ? Colors.live : Colors.slate900 }}>
              {m.homeScore}–{m.awayScore}
            </Text>
          ) : (
            <Text style={{ fontSize: 14, color: Colors.muted, fontWeight: "600" }}>vs</Text>
          )}
          {m.htScore ? (
            <Text style={{ fontSize: 9, color: Colors.muted, marginTop: 1 }}>İY {m.htScore}</Text>
          ) : null}
        </View>

        {/* Away */}
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
          {m.awayRed > 0 && <Text style={{ fontSize: 10 }}>🟥</Text>}
          {m.awayCrest ? <Image source={{ uri: m.awayCrest }} style={{ width: 20, height: 20 }} /> : null}
          <Text style={{ fontSize: 13, fontWeight: "700", color: Colors.slate900, flexShrink: 1 }} numberOfLines={1}>
            {m.awayTeam}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function LiveScoresScreen() {
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
        const d = new Date(j.ts);
        setLastUpdate(d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }));
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

  // Ülke listesi: canlı maçı olan ülkeler önce
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

  // Gösterilecek ligler + fallback bayrağı
  // selectedCountry = exclusive filtre değil, ÖNCELIK — o ülke ligleri üstte, dünya devamı
  const { displayLeagues, isFallback, splitAt } = useMemo(() => {
    if (!selectedCountry) {
      return { displayLeagues: sortByLive(allLeagues), isFallback: false, splitAt: -1 };
    }

    const countryLeagues = allLeagues.filter((l) => l.country === selectedCountry);
    const otherLeagues   = allLeagues.filter((l) => l.country !== selectedCountry);

    if (countryLeagues.some((l) => l.matches.length > 0)) {
      const sorted = sortByLive(countryLeagues);
      const rest   = getGlobalHighlights(otherLeagues);
      return {
        displayLeagues: [...sorted, ...rest],
        isFallback: false,
        splitAt: sorted.length,   // bu indekste "Dünyadan" ayraçı göster
      };
    }

    // Seçili ülkede hiç maç yok → global highlights
    return { displayLeagues: getGlobalHighlights(allLeagues), isFallback: true, splitAt: -1 };
  }, [allLeagues, selectedCountry]);

  const totalLive = useMemo(
    () => allLeagues.reduce((s, l) => s + liveCount(l), 0),
    [allLeagues]
  );

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <BackBar title="Canlı Skorlar" />

      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {totalLive > 0 && (
              <View style={{ backgroundColor: Colors.live, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 11 }}>🔴 {totalLive} CANLI</Text>
              </View>
            )}
            {data?.source && (
              <Text style={{ fontSize: 10, color: Colors.muted }}>via {data.source}</Text>
            )}
          </View>
          <Text style={{ fontSize: 10, color: Colors.muted }}>
            {lastUpdate ? `Son: ${lastUpdate}` : ""}
          </Text>
        </View>

        {/* Ülke filtre chipleri */}
        {countries.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 10 }}
            contentContainerStyle={{ gap: 6, paddingRight: 4 }}
          >
            <TouchableOpacity
              onPress={() => setSelectedCountry(null)}
              style={{
                paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999,
                backgroundColor: selectedCountry === null ? Colors.primary : "#1e293b",
                borderWidth: 1,
                borderColor: selectedCountry === null ? Colors.primary : "#334155",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>🌍 Tümü</Text>
            </TouchableOpacity>

            {countries.map((c) => {
              const active     = selectedCountry === c;
              const liveCnt    = allLeagues
                .filter((l) => l.country === c)
                .reduce((s, l) => s + liveCount(l), 0);
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => setSelectedCountry(active ? null : c)}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 4,
                    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
                    backgroundColor: active ? Colors.primary : "#1e293b",
                    borderWidth: 1,
                    borderColor: active ? Colors.primary : liveCnt > 0 ? Colors.live + "55" : "#334155",
                  }}
                >
                  <Text style={{ fontSize: 13 }}>{countryEmoji(c)}</Text>
                  <Text style={{ color: "#fff", fontWeight: active ? "700" : "500", fontSize: 12 }}>{c}</Text>
                  {liveCnt > 0 && (
                    <View style={{ backgroundColor: Colors.live, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>
                      <Text style={{ color: "#fff", fontSize: 9, fontWeight: "800" }}>{liveCnt}</Text>
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
            backgroundColor: "#0f2027", borderRadius: 10,
            borderWidth: 1, borderColor: "#22c55e33",
            paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12,
          }}>
            <Text style={{ fontSize: 18 }}>{countryEmoji(selectedCountry)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#94a3b8", fontSize: 12, fontWeight: "600" }}>
                {selectedCountry}'da bugün maç bulunamadı
              </Text>
              <Text style={{ color: "#22c55e", fontSize: 11, marginTop: 2 }}>
                🌍 Dünyadan öne çıkan maçlar gösteriliyor
              </Text>
            </View>
            <TouchableOpacity onPress={() => setSelectedCountry(null)}>
              <Text style={{ color: Colors.muted, fontSize: 18 }}>×</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* İçerik */}
        {loading && !refreshing ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator size="large" />
            <Text style={{ marginTop: 8, color: Colors.muted, fontSize: 12 }}>Yükleniyor...</Text>
          </View>
        ) : error ? (
          <View style={{ padding: 16, borderRadius: 12, backgroundColor: "#7f1d1d", alignItems: "center" }}>
            <Text style={{ color: "#fee2e2", fontWeight: "700", fontSize: 14 }}>Hata</Text>
            <Text style={{ color: "#fecaca", fontSize: 12, marginTop: 4 }}>{error}</Text>
            <TouchableOpacity
              onPress={() => load()}
              style={{ marginTop: 12, backgroundColor: "#dc2626", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Tekrar Dene</Text>
            </TouchableOpacity>
          </View>
        ) : displayLeagues.length === 0 ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>⚽</Text>
            <Text style={{ color: Colors.muted, fontSize: 14, fontWeight: "600" }}>
              Bugün canlı maç yok
            </Text>
            {selectedCountry && (
              <TouchableOpacity onPress={() => setSelectedCountry(null)} style={{ marginTop: 12 }}>
                <Text style={{ color: Colors.primary, fontSize: 13, fontWeight: "700" }}>
                  Tüm ülkeleri göster
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          displayLeagues.map((league, idx) => {
            const live = liveCount(league);
            const showWorldDivider = splitAt > 0 && idx === splitAt;
            return (
              <View key={league.id}>
              {showWorldDivider && (
                <View style={{
                  flexDirection: "row", alignItems: "center", gap: 8,
                  marginBottom: 12, marginTop: 4,
                }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: "#1e293b" }} />
                  <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: "700" }}>
                    🌍 Dünyadan
                  </Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: "#1e293b" }} />
                </View>
              )}
              <View style={{ marginBottom: 16 }}>
                <View style={{
                  flexDirection: "row", alignItems: "center", gap: 6,
                  paddingVertical: 8, paddingHorizontal: 10,
                  backgroundColor: Colors.headerBlue,
                  borderRadius: 8, marginBottom: 6,
                }}>
                  <Text style={{ fontSize: 16 }}>{countryEmoji(league.country)}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "800", fontSize: 13, color: Colors.slate900 }} numberOfLines={1}>
                      {league.name}
                    </Text>
                    {league.country ? (
                      <Text style={{ fontSize: 10, color: Colors.muted }}>{league.country}</Text>
                    ) : null}
                  </View>
                  {live > 0 && (
                    <View style={{ backgroundColor: Colors.live, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>{live} CANLI</Text>
                    </View>
                  )}
                  <Text style={{ fontSize: 11, color: Colors.muted }}>{league.matches.length} maç</Text>
                </View>

                {/* Canlı maçlar önce */}
                {league.matches
                  .slice()
                  .sort((a, b) => {
                    const aL = a.isLive || a.isHT ? 0 : a.isFinished ? 2 : 1;
                    const bL = b.isLive || b.isHT ? 0 : b.isFinished ? 2 : 1;
                    return aL - bL;
                  })
                  .map((m, i) => (
                    <MatchCard key={`${league.id}-${i}`} match={m} />
                  ))}
              </View>{/* league card */}
              </View>{/* outer wrapper */}
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
