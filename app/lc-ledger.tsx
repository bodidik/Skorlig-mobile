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
import { getAuthHeaders } from "../lib/apiFetch";
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
async function apiFetch(path: string, init?: RequestInit) {
  const base = await getApiBase();
  const authH = await getAuthHeaders();
  const p = path.startsWith("/") ? path : `/${path}`;
  return fetch(`${base}${p}`, { ...init, headers: { ...authH, ...(init?.headers as any) } });
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
    if (reason === "initial_1987") return "Başlangıç (1987 üyesi)";
    if (reason === "initial_default") return "Başlangıç bakiyesi";
    return "Başlangıç";
  }
  if (kind === "reward") {
    if (reason === "daily") return "Günlük LC ödülü";
    if (reason === "match_reward") return "Maç ödülü";
    return "Ödül";
  }
  if (kind === "spend") {
    if (reason === "match_entry" || reason === "match_pred") {
      return "Maç tahmini girişi";
    }
    return "Harcanan LC";
  }
  return kind || "işlem";
}

export default function LcLedgerScreen() {
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
    } catch {
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
    } catch {
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
        LC Hareketlerim
      </Text>
      <Text style={{ color: Colors.muted, fontSize: 12 }}>Kullanıcı: {userId}</Text>

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
              Cüzdan yükleniyor...
            </Text>
          </View>
        ) : wallet ? (
          <>
            <Text style={{ fontWeight: "700" }}>Güncel Bakiye</Text>
            <Text style={{ fontSize: 26, fontWeight: "800", color: Colors.accent }}>
              {wallet.user?.balance ?? 0} LC
            </Text>
            <Text style={{ color: Colors.muted, fontSize: 12 }}>
              Toplam kazanç: {wallet.user?.totalEarned ?? 0} · Toplam harcama:{" "}
              {wallet.user?.totalSpent ?? 0}
            </Text>
            {wallet.pricing && (
              <Text style={{ color: Colors.muted, fontSize: 11 }}>
                Maç girişi: {wallet.pricing.matchEntryCost} LC · Günlük hak:{" "}
                {wallet.pricing.daily} LC
              </Text>
            )}
          </>
        ) : (
          <Text style={{ color: Colors.muted, fontSize: 12 }}>
            Cüzdan bilgisi alınamadı.
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
        <Text style={{ fontWeight: "700", marginBottom: 4 }}>Son işlemler</Text>
        <Text style={{ color: Colors.muted, fontSize: 11, marginBottom: 8 }}>
          Son 100 LC hareketin görüntülenir. Artı değerler eklenen, eksi değerler
          harcanan LC’yi gösterir.
        </Text>

        {loading && (
          <Text style={{ color: Colors.muted, fontSize: 12, marginBottom: 4 }}>
            Yükleniyor...
          </Text>
        )}

        {items.length === 0 && !loading ? (
          <Text style={{ color: Colors.muted, fontSize: 12 }}>
            Henüz kayıtlı işlem yok.
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
                  {formatDate(tx.createdAt)} {tx.fixtureId ? `• Maç: ${tx.fixtureId}` : ""}
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
