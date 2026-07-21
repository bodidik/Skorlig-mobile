import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Alert,
  TextInput,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Constants from "expo-constants";
import Colors from "../constants/colors";
import { getApiBase } from "../lib/apiBase";
import { getAuthHeaders } from "../lib/apiFetch";

async function apiFetch(path: string, init?: RequestInit) {
  const base = await getApiBase();
  const authH = await getAuthHeaders();
  const p = path.startsWith("/") ? path : `/${path}`;
  return fetch(`${base}${p}`, { ...init, headers: { ...authH, ...(init?.headers as any) } });
}

const API_BASE =
  (Constants?.expoConfig?.extra?.apiBase as string) ||
  process.env.EXPO_PUBLIC_API_BASE ||
  "http://192.168.43.245:4102";

type PredRecord = {
  fixtureId: string;
  userId: string;
  outcome?: string | null;
  home?: number | null;
  away?: number | null;
  firstGoal?: string | null;
  firstHalf?: string | null;
  redAny?: boolean | null;
  redSide?: "H" | "A" | null;
  penaltyAny?: boolean | null;
  penaltySide?: "H" | "A" | null;
  at?: string | null;
};

type MatchBoardRow = {
  userId: string;
  label?: string | null;
  tag?: string | null; // örn: "bot", "ben", "1987 üyesi"
  points?: number | null;
  isBot?: boolean | null;
  rank?: number | null;
};

type MatchBoardResponse = {
  ok: boolean;
  fixtureId?: string;
  updatedAt?: string | null;
  items?: MatchBoardRow[];
};

type Auth1987Status = {
  ok: boolean;
  userId: string;
  is1987: boolean;
};

type Auth1987VerifyResponse = {
  ok: boolean;
  role?: string;
  userId?: string | null;
  error?: string;
};

// LC cüzdan tipleri (Me.tsx ve predict ile uyumlu)
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

export default function MyStatusScreen() {
  const router = useRouter();
  const {
    fixtureId: qFx,
    userId: qUser,
    segment: qSeg,
  } = useLocalSearchParams<{
    fixtureId?: string;
    userId?: string;
    segment?: string;
  }>();

  const fixtureId = useMemo(() => String(qFx || "").trim(), [qFx]);
  const userId = useMemo(() => String(qUser || "demo1").trim(), [qUser]);

  // 1987 mikro tablo için segment (all / 1987)
  const [segment, setSegment] = useState<string>(() =>
    String(qSeg || "all").toLowerCase()
  );

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [myPred, setMyPred] = useState<PredRecord | null>(null);
  const [boardRows, setBoardRows] = useState<MatchBoardRow[]>([]);
  const [boardUpdatedAt, setBoardUpdatedAt] = useState<string | null>(null);

  // Bu maç için tahmin var mı? (/api/pred/flags)
  const [hasPredFlag, setHasPredFlag] = useState<boolean | null>(null);
  const [predFlagLoading, setPredFlagLoading] = useState(false);

  // 1987 durum
  const [is1987, setIs1987] = useState<boolean | null>(null);
  const [checking1987, setChecking1987] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [verifyingCode, setVerifyingCode] = useState(false);

  // LC mini şerit durumu
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);

  // ---- API çağrıları ----

  // 0) Bu maçta tahminin var mı? (/api/pred/flags)
  const loadPredFlag = useCallback(async () => {
    if (!fixtureId || !userId) {
      setHasPredFlag(null);
      return;
    }
    try {
      setPredFlagLoading(true);
      const qs =
        `userId=${encodeURIComponent(userId)}` +
        `&fixtureIds=${encodeURIComponent(fixtureId)}`;
      const r = await apiFetch(`/api/pred/flags?${qs}`);
      const j = await r.json();
      if (j?.ok && Array.isArray(j.fixtures)) {
        const trimmed = j.fixtures.map((f: string) => String(f || "").trim());
        setHasPredFlag(trimmed.includes(fixtureId));
      } else {
        setHasPredFlag(null);
      }
    } catch {
      setHasPredFlag(null);
    } finally {
      setPredFlagLoading(false);
    }
  }, [fixtureId, userId]);

  // 1) Bu fixture için kullanıcının tahminini getir (/api/pred/list)
  const loadMyPred = useCallback(async () => {
    if (!fixtureId) return;
    try {
      const url = `/api/pred/list?fixtureId=${encodeURIComponent(fixtureId)}`;
      const r = await apiFetch(url);
      const j = await r.json();
      if (!j?.ok) {
        setMyPred(null);
        return;
      }
      const items: PredRecord[] = Array.isArray(j.items) ? j.items : [];
      const mine =
        items.find(
          (p) =>
            String(p.userId || (p as any).user || "")
              .toLowerCase()
              .trim() === userId.toLowerCase().trim()
        ) || null;
      setMyPred(mine);
    } catch {
      setMyPred(null);
    }
  }, [fixtureId, userId]);

  // 2) Maç bazlı mikro tablo (/api/pred/match-board)
  const loadMatchBoard = useCallback(async () => {
    if (!fixtureId) return;
    try {
      const url = `/api/pred/match-board?fixtureId=${encodeURIComponent(
        fixtureId
      )}&segment=${encodeURIComponent(segment || "all")}`;
      const r = await apiFetch(url);
      const j: MatchBoardResponse = await r.json();
      if (!j?.ok) {
        setBoardRows([]);
        setBoardUpdatedAt(null);
        return;
      }
      const rows: MatchBoardRow[] = Array.isArray(j.items) ? j.items : [];

      // Defansif: puana göre sırala, rank yoksa index+1 ver
      const sorted = rows
        .slice()
        .sort((a, b) => (b.points || 0) - (a.points || 0))
        .map((row, idx) => ({
          ...row,
          rank:
            typeof row.rank === "number" && row.rank > 0 ? row.rank : idx + 1,
        }));

      setBoardRows(sorted);
      setBoardUpdatedAt(j.updatedAt || null);
    } catch {
      setBoardRows([]);
      setBoardUpdatedAt(null);
    }
  }, [fixtureId, segment]);

  // 3) 1987GS durumunu getir (/api/auth1987gs/status)
  const load1987Status = useCallback(async () => {
    if (!userId) return;
    try {
      setChecking1987(true);
      const url = `/api/auth1987gs/status?userId=${encodeURIComponent(userId)}`;
      const r = await apiFetch(url);
      const j: Auth1987Status = await r.json();
      if (!j?.ok) {
        setIs1987(null);
        return;
      }
      setIs1987(!!j.is1987);
    } catch {
      setIs1987(null);
    } finally {
      setChecking1987(false);
    }
  }, [userId]);

  // 4) LC cüzdan özeti (/api/rt/lc-wallet/summary)
  const loadWalletSummary = useCallback(async () => {
    if (!userId) {
      setWallet(null);
      return;
    }
    try {
      setWalletLoading(true);
      const r = await apiFetch(
        `/api/rt/lc-wallet/summary?userId=${encodeURIComponent(userId)}`
      );
      const j = await r.json();
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
  }, [userId]);

  const loadAll = useCallback(async () => {
    if (!fixtureId) {
      Alert.alert("SkorLig", "FixtureId parametresi eksik görünüyor.");
      return;
    }
    setLoading(true);
    try {
      await Promise.all([
        loadPredFlag(),
        loadMyPred(),
        loadMatchBoard(),
        load1987Status(),
        loadWalletSummary(),
      ]);
    } finally {
      setLoading(false);
    }
  }, [fixtureId, loadPredFlag, loadMyPred, loadMatchBoard, load1987Status, loadWalletSummary]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  // Tahmin ekranına geçiş
  const goToPredict = useCallback(() => {
    if (!fixtureId) {
      Alert.alert("SkorLig", "Fixture bilgisi bulunamadı.");
      return;
    }
    router.push({
      pathname: "/predict",
      params: { fixtureId, userId },
    });
  }, [fixtureId, userId, router]);

  // 1987 kod doğrulama
  const verifyCode = useCallback(async () => {
    const code = codeInput.trim();
    if (!code) {
      Alert.alert("SkorLig", "Lütfen geçerli bir 1987 kodu gir.");
      return;
    }
    try {
      setVerifyingCode(true);
      const r = await apiFetch(`/api/auth1987gs/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, userId }),
      });
      const j: Auth1987VerifyResponse = await r.json();
      if (!r.ok || !j?.ok) {
        Alert.alert("SkorLig", j?.error || "Kod doğrulanamadı.");
        return;
      }
      setCodeInput("");
      setIs1987(true);
      Alert.alert("SkorLig", "1987GS erişimin açıldı.");
    } catch (e: any) {
      Alert.alert("Hata", String(e?.message || e));
    } finally {
      setVerifyingCode(false);
    }
  }, [codeInput, userId]);

  // ---- Yardımcılar ----

  function labelForOutcome(o?: string | null) {
    const v = String(o || "").toUpperCase();
    if (v === "H") return "Ev kazanır";
    if (v === "A") return "Dep kazanır";
    if (v === "D") return "Berabere";
    return "-";
  }

  function sideLabel(s?: "H" | "A" | null) {
    if (s === "H") return "Ev";
    if (s === "A") return "Dep";
    return "-";
  }

  const myScoreText =
    myPred &&
    Number.isFinite(Number(myPred.home)) &&
    Number.isFinite(Number(myPred.away))
      ? `${myPred.home}-${myPred.away}`
      : "—";

  const myOutcomeText = labelForOutcome(myPred?.outcome);

  // Tablo satırı component
  const BoardRowView = ({ row }: { row: MatchBoardRow }) => {
    const isMe =
      String(row.userId || "").toLowerCase().trim() === userId.toLowerCase().trim();

    const isBot = !!row.isBot || (row.tag || "").toLowerCase().includes("bot");

    const name = row.label || row.userId || (isBot ? "Bot" : "Oyuncu");

    const pts = typeof row.points === "number" ? row.points : 0;

    return (
      <View
        style={{
          flexDirection: "row",
          paddingVertical: 6,
          paddingHorizontal: 8,
          borderRadius: 8,
          marginBottom: 4,
          backgroundColor: isMe ? "#022c22" : "#020617",
        }}
      >
        <View style={{ width: 28, alignItems: "flex-start" }}>
          <Text
            style={{
              color: isMe ? "#a7f3d0" : Colors.muted,
              fontSize: 12,
              fontWeight: "600",
            }}
          >
            {row.rank ?? "-"}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: "#fff",
              fontWeight: isMe ? "800" : "600",
              fontSize: 13,
            }}
          >
            {name}
            {isMe ? " (ben)" : ""}
            {isBot ? " 🤖" : ""}
          </Text>
          {!!row.tag && (
            <Text style={{ color: Colors.muted, fontSize: 10, marginTop: 2 }}>
              {row.tag}
            </Text>
          )}
        </View>
        <View style={{ minWidth: 60, alignItems: "flex-end", justifyContent: "center" }}>
          <Text style={{ color: "#a3e635", fontWeight: "700", fontSize: 13 }}>
            {Math.round(pts)} p
          </Text>
        </View>
      </View>
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Başlık + geri */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 }}>
        <TouchableOpacity
          onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/(tabs)/live" as any); }}
          style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: Colors.border }}
        >
          <Text style={{ color: Colors.muted, fontSize: 12 }}>← Geri</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: "800", color: Colors.slate900, flex: 1 }}>
          Maç Durumum
        </Text>
        <TouchableOpacity
          onPress={() => router.replace("/(tabs)/live" as any)}
          style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: Colors.border }}
        >
          <Text style={{ color: Colors.muted, fontSize: 12 }}>🏠 Ana</Text>
        </TouchableOpacity>
      </View>

      <Text style={{ color: Colors.muted, fontSize: 12, marginBottom: 4 }}>
        Fixture: {fixtureId || "-"} · Kullanıcı: {userId}
      </Text>

      {predFlagLoading ? (
        <Text style={{ color: Colors.muted, fontSize: 11, marginBottom: 8 }}>
          Bu maç için tahmin durumun kontrol ediliyor...
        </Text>
      ) : hasPredFlag === true ? (
        <Text style={{ color: Colors.accent, fontSize: 11, marginBottom: 8 }}>
          Bu maç için kayıtlı bir tahminin var.
        </Text>
      ) : hasPredFlag === false ? (
        <Text style={{ color: Colors.muted, fontSize: 11, marginBottom: 8 }}>
          Bu maç için henüz tahmin yapmamış görünüyorsun.
        </Text>
      ) : (
        <Text style={{ color: Colors.muted, fontSize: 11, marginBottom: 8 }}>
          Tahmin durumu şu an net değil (bağlantı hatası olabilir).
        </Text>
      )}

      {/* LC mini şerit */}
      <View
        style={{
          marginBottom: 10,
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
            <Text style={{ color: Colors.muted, fontSize: 11, flex: 1 }} numberOfLines={2}>
              Maç girişi: {wallet.pricing?.matchEntryCost ?? 0} LC · Günlük hak:{" "}
              {wallet.daily?.amount ?? 0} LC
            </Text>
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/me", params: { userId } })}
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

      {loading && !refreshing ? (
        <View style={{ marginTop: 32, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8, color: Colors.muted, fontSize: 12 }}>
            Yükleniyor...
          </Text>
        </View>
      ) : (
        <>
          {/* Benim tahminim kartı */}
          <View
            style={{
              padding: 12,
              backgroundColor: "#fff",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: Colors.border,
              marginBottom: 12,
              gap: 6,
            }}
          >
            <Text style={{ fontWeight: "700" }}>Benim tahminim</Text>
            {myPred ? (
              <>
                <Text style={{ color: Colors.muted, fontSize: 12 }}>Skor: {myScoreText}</Text>
                <Text style={{ color: Colors.muted, fontSize: 12 }}>
                  Maç sonucu: {myOutcomeText}
                </Text>
                <Text style={{ color: Colors.muted, fontSize: 12 }}>
                  İlk gol: {sideLabel(myPred.firstGoal as any)}
                </Text>
                <Text style={{ color: Colors.muted, fontSize: 12 }}>
                  İlk yarı: {labelForOutcome(myPred.firstHalf)}
                </Text>

                <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 6 }}>
                  Gönderim zamanı: {myPred.at || "—"}
                </Text>

                <TouchableOpacity
                  onPress={goToPredict}
                  style={{
                    marginTop: 8,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: Colors.primary,
                  }}
                >
                  <Text
                    style={{
                      textAlign: "center",
                      color: "#fff",
                      fontWeight: "700",
                      fontSize: 13,
                    }}
                  >
                    Tahminimi güncelle
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={{ color: Colors.muted, fontSize: 12, marginBottom: 6 }}>
                  Bu maç için kayıtlı tahmin bulunamadı.
                </Text>
                <TouchableOpacity
                  onPress={goToPredict}
                  style={{
                    marginTop: 2,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: Colors.primary,
                  }}
                >
                  <Text
                    style={{
                      textAlign: "center",
                      color: "#fff",
                      fontWeight: "700",
                      fontSize: 13,
                    }}
                  >
                    Bu maç için tahmin yap
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Maç bazlı mikro tablo */}
          <View
            style={{
              padding: 12,
              backgroundColor: "#020617",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: Colors.border,
              marginBottom: 12,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 6,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
                Maç Bazlı Mikro Tablo
              </Text>
              <Text style={{ color: Colors.muted, fontSize: 10 }}>
                Güncelleme: {boardUpdatedAt || "-"}
              </Text>
            </View>

            {/* Segment toggle (sadece 1987 durum biliniyorsa göster) */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "flex-start",
                marginBottom: 6,
                gap: 6,
              }}
            >
              <TouchableOpacity
                onPress={() => setSegment("all")}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: segment === "all" ? Colors.accent : Colors.border,
                  backgroundColor: segment === "all" ? "#0f172a" : "#020617",
                }}
              >
                <Text
                  style={{
                    color: segment === "all" ? Colors.accent : Colors.muted,
                    fontSize: 11,
                    fontWeight: "600",
                  }}
                >
                  Tümü
                </Text>
              </TouchableOpacity>

              {is1987 && (
                <TouchableOpacity
                  onPress={() => setSegment("1987")}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: segment === "1987" ? Colors.live : Colors.border,
                    backgroundColor: segment === "1987" ? "#022c22" : "#020617",
                  }}
                >
                  <Text
                    style={{
                      color: segment === "1987" ? "#bbf7d0" : Colors.muted,
                      fontSize: 11,
                      fontWeight: "600",
                    }}
                  >
                    1987 alanım
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={{ color: Colors.muted, fontSize: 10, marginBottom: 4 }}>
              Şu an:{" "}
              {segment === "1987" && is1987 ? "1987 üyeleri + tüm botlar" : "Tüm oyuncular ve botlar"}
            </Text>

            {boardRows.length === 0 ? (
              <Text style={{ color: Colors.muted, fontSize: 12, marginTop: 4 }}>
                Bu maç için henüz puanlanmış tahmin yok.
              </Text>
            ) : (
              <View style={{ marginTop: 4 }}>
                {boardRows.map((row) => (
                  <BoardRowView key={`${row.userId}-${row.rank ?? "x"}`} row={row} />
                ))}
              </View>
            )}

            <Text style={{ color: Colors.muted, fontSize: 10, marginTop: 8 }}>
              Not: Tablo hem senin hem de botların maç bazlı puanlarını gösterir. Skoru bilmesen bile yan
              tahminlerden gelen puanlar yansır. 1987 segmentinde yalnızca 1987 alanındaki gerçek kullanıcılar ve tüm
              botlar listelenir.
            </Text>
          </View>

          {/* 1987GS erişimi kartı */}
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
            <Text style={{ fontWeight: "700" }}>1987GS Erişimi</Text>

            <Text style={{ color: Colors.muted, fontSize: 12 }}>
              {checking1987
                ? "Durum kontrol ediliyor..."
                : is1987 === true
                ? "Bu kullanıcı 1987GS alanına erişebilir."
                : is1987 === false
                ? "Bu kullanıcı henüz 1987GS alanına tanımlı görünmüyor."
                : "1987GS durumu şu an belirlenemedi."}
            </Text>

            {is1987 !== true && (
              <>
                <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 4 }}>
                  1987 üyelik kodun / QR kodun varsa buraya girerek hesabına tanımlayabilirsin:
                </Text>
                <TextInput
                  value={codeInput}
                  onChangeText={setCodeInput}
                  autoCapitalize="characters"
                  placeholder="1987 kodu"
                  placeholderTextColor={Colors.muted}
                  style={{
                    borderWidth: 1,
                    borderColor: Colors.border,
                    borderRadius: 8,
                    paddingHorizontal: 8,
                    paddingVertical: 6,
                    fontSize: 13,
                    marginTop: 4,
                  }}
                />
                <TouchableOpacity
                  onPress={verifyCode}
                  disabled={verifyingCode}
                  style={{
                    marginTop: 8,
                    paddingVertical: 10,
                    borderRadius: 999,
                    backgroundColor: verifyingCode ? Colors.muted : Colors.primary,
                  }}
                >
                  <Text style={{ textAlign: "center", color: "#fff", fontWeight: "700", fontSize: 14 }}>
                    {verifyingCode ? "Doğrulanıyor..." : "1987 Kodunu Kullan"}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            <Text style={{ color: Colors.muted, fontSize: 10, marginTop: 6 }}>
              Not: Kod bir kez doğrulandığında profilin 1987GS olarak işaretlenir; sonraki girişlerinde otomatik
              tanınırsın.
            </Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}
