// D:\APPden\SkorLig\mobile\app\lc-ledger.tsx
import React, { useEffect, useMemo, useState } from "react";
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
import BackBar from "../components/BackBar";

type LedgerItem = {
  id: string;
  userId: string;
  kind: string; // "init" | "reward" | "spend" | ...
  amount: number;
  reason?: string | null;
  fixtureId?: string | null;
  meta?: any;
  createdAt?: string;
};

type LedgerResponse = {
  ok: boolean;
  userId: string;
  count: number;
  items: LedgerItem[];
};

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

// Tek kalıp: base’i içeriden alıp çağır
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

function formatDate(iso?: string) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const dd = d.toLocaleDateString("tr-TR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const tt = d.toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${dd} ${tt}`;
  } catch {
    return iso;
  }
}

function describeKind(tx: LedgerItem) {
  const { kind, reason } = tx;
  if (kind === "init") {
    if (reason === "initial_1987") return t("txInit1987");
    if (reason === "initial_default") return t("txInitDefault");
    return t("txInit");
  }
  if (kind === "reward") {
    if (reason === "daily") return t("txDaily");
    if (reason === "match_reward") return t("txMatchReward");
    return t("txReward");
  }
  if (kind === "spend") {
    if (reason === "match_entry" || reason === "match_pred") {
      return t("txMatchEntry");
    }
    return t("txSpend");
  }
  return kind || t("txGeneric");
}

export default function LcLedgerScreen() {
  useLang(); // dil değişince ekran yeniden çizilsin
  const { userId: qUser } = useLocalSearchParams<{ userId?: string }>();
  const userId = useMemo(() => String(qUser || "demo1"), [qUser]);
  const router = useRouter();

  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);

  const [items, setItems] = useState<LedgerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function loadWallet() {
    if (!userId) return;
    try {
      setWalletLoading(true);
      const res = await apiFetch(
        `/api/rt/lc-wallet/summary?userId=${encodeURIComponent(userId)}`
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
    } catch (e) {
      console.error("[lc-ledger] wallet load failed:", e);
      setWallet(null);
    } finally {
      setWalletLoading(false);
    }
  }

  async function loadLedger() {
    if (!userId) return;
    try {
      setLoading(true);
      const res = await apiFetch(
        `/api/rt/lc-wallet/ledger?userId=${encodeURIComponent(userId)}&limit=100`
      );
      const j: LedgerResponse = await res.json();
      if (j?.ok && Array.isArray(j.items)) {
        setItems(j.items);
      } else {
        setItems([]);
      }
    } catch (e) {
      console.error("[lc-ledger] ledger load failed:", e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function reloadAll() {
    await Promise.all([loadWallet(), loadLedger()]);
  }

  useEffect(() => {
    reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function onRefresh() {
    setRefreshing(true);
    await reloadAll();
    setRefreshing(false);
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg }}>
      <BackBar title="LC Hareketlerim" />
    <ScrollView
      style={{ flex: 1 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      contentContainerStyle={{ padding: 16, gap: 12 }}
    >
      <Text style={{ fontSize: 20, fontWeight: "800", color: Colors.slate900 }}>
        {t("lcHistory")}
      </Text>
      <Text style={{ color: Colors.muted, fontSize: 12 }}>{t("userLbl", { u: userId })}</Text>

      {/* Özet kartı */}
      <View
        style={{
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: Colors.border,
          backgroundColor: "#fff",
          gap: 6,
        }}
      >
        {walletLoading ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <ActivityIndicator />
            <Text style={{ color: Colors.muted, fontSize: 12 }}>
              {t("walletLoading")}
            </Text>
          </View>
        ) : wallet ? (
          <>
            <Text style={{ fontWeight: "700" }}>{t("currentBalance")}</Text>
            <Text style={{ fontSize: 26, fontWeight: "800", color: Colors.accent }}>
              {wallet.user?.balance ?? 0} LC
            </Text>
            <Text style={{ color: Colors.muted, fontSize: 12 }}>
              {t("earnSpend", { e: wallet.user?.totalEarned ?? 0, s: wallet.user?.totalSpent ?? 0 })}
            </Text>
            {wallet.pricing && (
              <Text style={{ color: Colors.muted, fontSize: 11 }}>
                {t("entryDaily", { e: wallet.pricing.matchEntryCost, d: wallet.pricing.daily })}
              </Text>
            )}
          </>
        ) : (
          <Text style={{ color: Colors.muted, fontSize: 12 }}>
            {t("walletInfoShort")}
          </Text>
        )}
      </View>

      {/* Ledger listesi */}
      <View
        style={{
          marginTop: 4,
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: Colors.border,
          backgroundColor: "#fff",
        }}
      >
        <Text style={{ fontWeight: "700", marginBottom: 4 }}>{t("lastTx")}</Text>
        <Text style={{ color: Colors.muted, fontSize: 11, marginBottom: 8 }}>
          {t("last100")}
        </Text>

        {loading && (
          <Text style={{ color: Colors.muted, fontSize: 12, marginBottom: 4 }}>
            {t("loading")}
          </Text>
        )}

        {items.length === 0 && !loading ? (
          <Text style={{ color: Colors.muted, fontSize: 12 }}>
            {t("noTx")}
          </Text>
        ) : (
          items.map((tx) => {
            const sign = tx.amount > 0 ? "+" : "";
            const color = tx.amount >= 0 ? Colors.live : "#f97373";
            return (
              <View
                key={tx.id}
                style={{
                  paddingVertical: 8,
                  borderTopWidth: 1,
                  borderTopColor: Colors.border,
                }}
              >
                <Text style={{ fontWeight: "600", fontSize: 13, color: Colors.slate900 }}>
                  {describeKind(tx)}
                </Text>
                <Text style={{ color: Colors.muted, fontSize: 11 }}>
                  {formatDate(tx.createdAt)} {tx.fixtureId ? t("txMatchRow", { f: tx.fixtureId }) : ""}
                </Text>
                <Text style={{ marginTop: 2, fontWeight: "700", fontSize: 14, color }}>
                  {sign}
                  {tx.amount} LC
                </Text>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
    </View>
  );
}
