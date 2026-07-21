import React, { useCallback, useEffect, useState } from "react";
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
  matches: Match[];
};

type ApiResponse = {
  ok: boolean;
  ts: string | null;
  leagues: Record<string, League>;
};

const LEAGUE_ORDER = [
  "turkiye-super-lig",
  "turkiye-1-lig",
  "turkiye-hazirlik",
  "sampiyonlar-ligi",
  "ingiltere-premier-lig",
  "ispanya-la-liga",
];

const LEAGUE_EMOJI: Record<string, string> = {
  "turkiye-super-lig": "🇹🇷",
  "turkiye-1-lig": "🇹🇷",
  "turkiye-hazirlik": "🇹🇷",
  "sampiyonlar-ligi": "🏆",
  "ingiltere-premier-lig": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "ispanya-la-liga": "🇪🇸",
};

function statusColor(m: Match) {
  if (m.isLive || m.isHT) return Colors.live;
  if (m.isFinished) return Colors.finished;
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
    <View
      style={{
        backgroundColor: "#fff",
        borderRadius: 10,
        padding: 10,
        marginBottom: 6,
        borderWidth: 1,
        borderColor: m.isLive ? Colors.live + "44" : Colors.border,
        borderLeftWidth: m.isLive ? 3 : 1,
        borderLeftColor: m.isLive ? Colors.live : Colors.border,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "center", marginBottom: 6 }}>
        <Text style={{ fontSize: 11, color: sc, fontWeight: "700" }}>
          {statusLabel(m)}
        </Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {/* Home */}
        <View style={{ flex: 1, alignItems: "flex-end", flexDirection: "row", justifyContent: "flex-end", gap: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: Colors.slate900, textAlign: "right", flexShrink: 1 }} numberOfLines={1}>
            {m.homeTeam}
          </Text>
          {m.homeCrest ? (
            <Image source={{ uri: m.homeCrest }} style={{ width: 20, height: 20 }} />
          ) : null}
          {m.homeRed > 0 && <Text style={{ fontSize: 10, color: "#dc2626" }}>🟥</Text>}
        </View>

        {/* Score */}
        <View style={{ width: 60, alignItems: "center" }}>
          {m.homeScore != null && m.awayScore != null ? (
            <Text style={{ fontSize: 18, fontWeight: "900", color: m.isLive ? Colors.live : Colors.slate900 }}>
              {m.homeScore} - {m.awayScore}
            </Text>
          ) : (
            <Text style={{ fontSize: 14, color: Colors.muted, fontWeight: "600" }}>vs</Text>
          )}
        </View>

        {/* Away */}
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
          {m.awayRed > 0 && <Text style={{ fontSize: 10, color: "#dc2626" }}>🟥</Text>}
          {m.awayCrest ? (
            <Image source={{ uri: m.awayCrest }} style={{ width: 20, height: 20 }} />
          ) : null}
          <Text style={{ fontSize: 13, fontWeight: "700", color: Colors.slate900, flexShrink: 1 }} numberOfLines={1}>
            {m.awayTeam}
          </Text>
        </View>
      </View>

      {m.htScore ? (
        <View style={{ flexDirection: "row", justifyContent: "center", marginTop: 4 }}>
          <Text style={{ fontSize: 10, color: Colors.muted }}>
            {m.htScore}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function LiveScoresScreen() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const base = await getApiBase();
      const res = await fetch(`${base}/api/livescore/matches`);
      const j = await res.json();
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

  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  const leagues = data?.leagues || {};
  const ordered = LEAGUE_ORDER.filter((id) => leagues[id]?.matches?.length > 0);
  const hasAny = ordered.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <BackBar title="Canlı Skorlar" />

      <ScrollView
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <Text style={{ fontSize: 11, color: Colors.muted }}>
            {lastUpdate ? `Son: ${lastUpdate}` : ""}
          </Text>
          <Text style={{ fontSize: 10, color: Colors.muted }}>5 dk aralıkla otomatik</Text>
        </View>

        {loading && !refreshing ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator size="large" />
            <Text style={{ marginTop: 8, color: Colors.muted, fontSize: 12 }}>Skorlar yükleniyor...</Text>
          </View>
        ) : error ? (
          <View style={{ padding: 16, borderRadius: 12, backgroundColor: "#7f1d1d", alignItems: "center" }}>
            <Text style={{ color: "#fee2e2", fontWeight: "700", fontSize: 14 }}>Hata</Text>
            <Text style={{ color: "#fecaca", fontSize: 12, marginTop: 4 }}>{error}</Text>
            <TouchableOpacity onPress={() => load()} style={{ marginTop: 12, backgroundColor: "#dc2626", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Tekrar Dene</Text>
            </TouchableOpacity>
          </View>
        ) : !hasAny ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>⚽</Text>
            <Text style={{ color: Colors.muted, fontSize: 14, fontWeight: "600" }}>
              Takip edilen liglerde bugün maç yok
            </Text>
            <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 4 }}>
              Süper Lig, 1. Lig, Şampiyonlar Ligi, Premier Lig, La Liga
            </Text>
          </View>
        ) : (
          ordered.map((leagueId) => {
            const league = leagues[leagueId];
            const emoji = LEAGUE_EMOJI[leagueId] || "⚽";
            const liveCount = league.matches.filter((m) => m.isLive || m.isHT).length;

            return (
              <View key={leagueId} style={{ marginBottom: 16 }}>
                {/* League header */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingVertical: 8,
                    paddingHorizontal: 8,
                    backgroundColor: Colors.headerBlue,
                    borderRadius: 8,
                    marginBottom: 6,
                  }}
                >
                  <Text style={{ fontSize: 16 }}>{emoji}</Text>
                  <Text style={{ flex: 1, fontWeight: "800", fontSize: 14, color: Colors.slate900 }}>
                    {league.name}
                  </Text>
                  {liveCount > 0 && (
                    <View style={{ backgroundColor: Colors.live, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>
                        {liveCount} CANLI
                      </Text>
                    </View>
                  )}
                  <Text style={{ fontSize: 11, color: Colors.muted }}>{league.matches.length} maç</Text>
                </View>

                {league.matches.map((m, i) => (
                  <MatchCard key={`${leagueId}-${i}`} match={m} />
                ))}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
