import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Colors from "../constants/colors";
import { getApiBase } from "../lib/apiBase";
import { getAuthHeaders, apiFetch as sharedApiFetch } from "../lib/apiFetch";
import { t, useLang } from "../lib/i18n";
import { puanYaz } from "../lib/lcBicim";
import { hataMesaji } from "../lib/hataMesaji";

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

type BoardRow = { userId: string; points: number; matches: number; rank?: number };
type FxView = {
  fixtureId: string;
  home?: string | null;
  away?: string | null;
  kickoffISO?: string | null;
  round?: string | null;
  status?: string | null;
  score?: { home: number; away: number } | null;
  settled?: boolean;
};
type WeekResp = {
  ok: boolean;
  weekKey?: string;
  weekRange?: { fromISO?: string; toISO?: string };
  isCurrentWeek?: boolean;
  fixtures?: FxView[];
  board?: BoardRow[];
  settledCount?: number;
  fixtureCount?: number;
  finalized?: { winners?: string[]; rewards?: { userId: string; amount: number }[] } | null;
  myRank?: { rank: number; points: number } | null;
  error?: string;
};
type WeekSummary = {
  weekKey: string;
  fromISO: string;
  toISO: string;
  matchCount: number;
  status: string;
  winners?: string[] | null;
};

const REWARD_MEDALS = ["🥇", "🥈", "🥉"];

export default function TrLeagueScreen() {
  useLang(); // dil değişince ekran yeniden çizilsin
  const router = useRouter();
  const { userId: qUserId } = useLocalSearchParams<{ userId?: string }>();
  const userId = String(qUserId || "demo1").trim();

  const [data, setData] = useState<WeekResp | null>(null);
  const [weeks, setWeeks] = useState<WeekSummary[]>([]);
  const [squad, setSquad] = useState<string[]>([]);
  const [rewards, setRewards] = useState<number[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadInfo = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/tr-league/info`).then((x) => x.json());
      if (r?.ok) {
        setSquad((r.squad || []).map((t: any) => t.name));
        setRewards(r.weeklyRewards || []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const loadWeek = useCallback(async () => {
    try {
      setLoading(true);
      const path = selectedWeek
        ? `/api/tr-league/week/${encodeURIComponent(selectedWeek)}?userId=${encodeURIComponent(userId)}`
        : `/api/tr-league/current?userId=${encodeURIComponent(userId)}`;
      const r = await apiFetch(path).then((x) => x.json());
      setData(r);
    } catch (e: any) {
      setData({ ok: false, error: hataMesaji(e) });
    } finally {
      setLoading(false);
    }
  }, [selectedWeek, userId]);

  const loadWeeks = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/tr-league/weeks`).then((x) => x.json());
      setWeeks(r?.ok && Array.isArray(r.weeks) ? r.weeks : []);
    } catch {
      setWeeks([]);
    }
  }, []);

  useEffect(() => {
    loadInfo();
    loadWeeks();
  }, [loadInfo, loadWeeks]);

  useEffect(() => {
    loadWeek();
  }, [loadWeek]);

  const statusLabel: Record<string, string> = {
    upcoming: t("stUpcoming"),
    live: t("stThisWeek"),
    pending: t("stPending"),
    settled: t("stDone"),
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await Promise.all([loadWeek(), loadWeeks()]);
            setRefreshing(false);
          }}
        />
      }
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 4 }}>
        <Text style={{ color: Colors.muted, fontSize: 12 }}>{t("back")}</Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 20, fontWeight: "800", color: Colors.slate900 }}>{t("trLeagueTitle")}</Text>
      <Text style={{ color: Colors.muted, fontSize: 12 }}>
        {t("trLeagueIntro")}
        {rewards.length ? ` (${rewards.join(" / ")} LC)` : ""}.
      </Text>
      {squad.length > 0 && (
        <Text style={{ color: Colors.muted, fontSize: 11 }}>Kadro: {squad.join(", ")}</Text>
      )}

      {/* Hafta seçici */}
      {weeks.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          <TouchableOpacity
            onPress={() => setSelectedWeek(null)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: !selectedWeek ? Colors.accent : Colors.border,
              backgroundColor: !selectedWeek ? Colors.accent : "#fff",
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: !selectedWeek ? "#fff" : Colors.slate900 }}>
              {t("currentLbl")}
            </Text>
          </TouchableOpacity>
          {weeks.map((w) => {
            const active = selectedWeek === w.weekKey;
            return (
              <TouchableOpacity
                key={w.weekKey}
                onPress={() => setSelectedWeek(w.weekKey)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? Colors.accent : Colors.border,
                  backgroundColor: active ? Colors.accent : "#fff",
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: active ? Colors.onAccent : Colors.slate900 }}>
                  {w.weekKey.replace(/^\d+-W/, "H")} {w.status === "settled" ? "✓" : ""}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {loading && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
          <ActivityIndicator size="small" />
          <Text style={{ color: Colors.muted }}>{t("loading")}</Text>
        </View>
      )}

      {!loading && data?.ok && (
        <>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
            <Text style={{ fontWeight: "800", fontSize: 15, color: Colors.slate900 }}>
              {data.weekKey?.replace(/^\d+-W/, t("weekPrefix"))}
            </Text>
            {data.weekRange?.fromISO && (
              <Text style={{ color: Colors.muted, fontSize: 11 }}>
                {data.weekRange.fromISO} — {data.weekRange.toISO}
              </Text>
            )}
          </View>

          {/* Kazanan pankartı */}
          {data.finalized && (data.finalized.winners || []).length > 0 && (
            <View
              style={{
                padding: 12,
                borderRadius: 12,
                borderWidth: 2,
                borderColor: "#fbbf24",
                backgroundColor: "#fffbeb",
                alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 22 }}>🏆</Text>
              <Text style={{ fontWeight: "900", color: "#92400e", fontSize: 15, textAlign: "center" }}>
                {t("weekChampion", { w: (data.finalized.winners || []).join(", ") })}
              </Text>
            </View>
          )}

          {data.fixtureCount === 0 ? (
            <Text style={{ color: Colors.muted, fontSize: 13, marginTop: 8 }}>
              {t("noWeekMatchesTr")}
            </Text>
          ) : (
            <>
              {/* Sıralama */}
              <Text style={{ fontWeight: "700", marginTop: 4 }}>
                {t("weeklyRankRow", { a: data.settledCount, b: data.fixtureCount })}
              </Text>
              {(data.board || []).length === 0 && (
                <Text style={{ color: Colors.muted, fontSize: 12 }}>
                  {t("noPointsYet")}
                </Text>
              )}
              {(data.board || []).map((row, ix) => {
                const isMe = row.userId.toLowerCase() === userId.toLowerCase();
                /**
                 * ⚠️ SIRA SUNUCUDAN — ESKİDEN DİZİ İNDEKSİNDEN TÜRETİLİYORDU.
                 *
                 * Ödül dağıtımı beraberlikte AYNI sırayı veriyor (üç kişi eşit
                 * puanlıysa üçü de birincilik ödülünü alır), ama burada
                 * `ix` kullanıldığı için ekranda 1./2./3. görünüyor ve
                 * `rewards[ix]` ile ALINMAYAN bir ödül miktarı yazılıyordu.
                 * Ölçüldü: üç kişi 10 puanla eşit → üçü de 100 LC aldı,
                 * ikincisine ekranda "60 LC" yazıyordu.
                 *
                 * `row.rank` yoksa (eski sunucu) indekse düşülür.
                 */
                const sira = typeof row.rank === "number" ? row.rank : ix + 1;
                const medal = sira <= 3 ? REWARD_MEDALS[sira - 1] : ` ${sira}.`;
                const reward = rewards[sira - 1];
                return (
                  <View
                    key={row.userId}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: 10,
                      borderRadius: 10,
                      backgroundColor: isMe ? "#0f172a" : "#020617",
                      borderWidth: 1,
                      borderColor: isMe ? Colors.accent : Colors.border,
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: isMe ? "900" : "600", flex: 1 }} numberOfLines={1}>
                      {medal} {row.userId}
                      {isMe ? " (ben)" : ""}
                    </Text>
                    {ix < 3 && reward ? (
                      <Text style={{ color: "#fbbf24", fontSize: 10, marginRight: 8 }}>+{reward} LC</Text>
                    ) : null}
                    <Text style={{ color: "#a3e635", fontWeight: "800" }}>
                      {puanYaz(row.points)} p
                      <Text style={{ color: Colors.muted, fontSize: 10 }}> ({row.matches})</Text>
                    </Text>
                  </View>
                );
              })}

              {data.myRank && (
                <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 2 }}>
                  {t("yourRankRow", { r: data.myRank.rank, p: data.myRank.points })}
                </Text>
              )}

              {/* Maçlar */}
              <Text style={{ fontWeight: "700", marginTop: 8 }}>{t("thisWeekMatches")}</Text>
              {(data.fixtures || []).map((f) => {
                const ko = f.kickoffISO ? new Date(f.kickoffISO) : null;
                const upcoming = ko && ko.getTime() > Date.now();
                return (
                  <TouchableOpacity
                    key={f.fixtureId}
                    disabled={!upcoming}
                    onPress={() =>
                      router.push({ pathname: "/(tabs)/predict", params: { fixtureId: f.fixtureId, userId } })
                    }
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      backgroundColor: "#020617",
                      borderWidth: 1,
                      borderColor: Colors.border,
                      opacity: f.settled ? 0.75 : 1,
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ color: "#fff", fontWeight: "700", flex: 1 }} numberOfLines={1}>
                        {f.home} — {f.away}
                      </Text>
                      {f.score ? (
                        <Text style={{ color: "#a3e635", fontWeight: "900" }}>
                          {f.score.home}-{f.score.away}
                        </Text>
                      ) : (
                        <Text style={{ color: Colors.muted, fontSize: 11 }}>{f.status || "NS"}</Text>
                      )}
                    </View>
                    <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 2 }}>
                      {ko
                        ? ko.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
                        : ""}
                      {upcoming ? t("tapToPredict") : f.settled ? t("scored") : ""}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </>
      )}

      {!loading && !data?.ok && (
        <Text style={{ color: "#f97316", marginTop: 8 }}>{t("leagueLoadFailed", { e: data?.error || "?" })}</Text>
      )}
    </ScrollView>
  );
}
