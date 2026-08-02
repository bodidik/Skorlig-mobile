import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Colors from "../constants/colors";
import { getApiBase } from "../lib/apiBase";
import { getAuthHeaders, apiFetch as sharedApiFetch } from "../lib/apiFetch";

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

/**
 * ⚠️ ALAN ADI SUNUCUYLA BİRLİKTE DEĞİŞTİ: `monthlyLc` → `monthlyFloor`.
 * Sunucu koşulsuz kasayı taban tamamlamaya çevirmiş, tip burada eski adda
 * kalmıştı — TypeScript uyarmadı çünkü yanıt `any` üzerinden geliyordu ve
 * ekran "undefined LC" bastı. Yanıt tipi elle yazıldığında derleyici bir
 * güvence DEĞİLDİR; alan adını sunucudan doğrula.
 */
type Perks = {
  monthlyFloor: number;
  dailyLc: number;
  regenCap: number;
  regenHours: number;
  storeBonusPct: number;
};
type Plan = { id: string; days: number; priceTRY: number; label: string; popular?: boolean };
type StatusResp = {
  ok: boolean;
  mode?: string;
  /** Maç giriş bedeli (LC) — sunucudaki tek kaynaktan; metne gömülmez. */
  matchEntryCost?: number;
  active?: boolean;
  premiumUntil?: string | null;
  via?: string | null;
  perks?: Perks;
  /** Ücretsiz kademe — ekran bu sayıları elle yazıyordu, artık sunucudan. */
  freePerks?: Perks;
  plans?: Plan[];
  error?: string;
};

export default function PremiumScreen() {
  const router = useRouter();
  const { userId: qUserId } = useLocalSearchParams<{ userId?: string }>();
  const userId = String(qUserId || "demo1").trim();

  const [data, setData] = useState<StatusResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await apiFetch(`/api/rt/lc-wallet/premium/status?userId=${encodeURIComponent(userId)}`).then((x) => x.json());
      setData(r);
    } catch (e: any) {
      setData({ ok: false, error: String(e?.message || e) });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function subscribe(plan: Plan) {
    Alert.alert(
      "Premium Aboneliği",
      `${plan.label} — ₺${plan.priceTRY}${data?.mode === "mock" ? "\n\n(Test modu: gerçek ödeme alınmaz)" : ""}`,
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Abone Ol",
          onPress: async () => {
            try {
              setSubscribing(plan.id);
              const r = await apiFetch(`/api/rt/lc-wallet/premium/subscribe`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, planId: plan.id }),
              }).then((x) => x.json());
              if (r?.ok) {
                Alert.alert("SkorLig", `Premium aktif! 🌟\nBitiş: ${String(r.premiumUntil).slice(0, 10)}`);
                load();
              } else {
                Alert.alert("SkorLig", r?.detail || r?.error || "Abonelik başarısız.");
              }
            } catch (e: any) {
              Alert.alert("Hata", String(e?.message || e));
            } finally {
              setSubscribing(null);
            }
          },
        },
      ]
    );
  }

  const perks = data?.perks;
  const active = !!data?.active;

  const freePerks = data?.freePerks;
  /**
   * ⚠️ BU TABLO GERÇEK PARA KARŞILIĞI SATIN ALINAN ŞİROLARI ANLATIYOR;
   * yanlış sayı = yanlış vaat. Üç hata ölçüldü (2026-08-02):
   *
   *  1) `perks.monthlyLc` sunucuda ARTIK YOK — `monthlyFloor` oldu. Ekran
   *     ilk satırda birebir "undefined LC" yazıyordu.
   *  2) Ücretsiz günlük "5 LC" elle yazılmıştı; ödeme yolundaki taban 3.
   *  3) "Aylık kasa (her ay yenilenir)" mekaniği anlatmıyordu: bu bir
   *     TAMAMLAMA. Bakiyen tavanın üstündeyse verilen 0'dır. "Her ay 60 LC
   *     alırsın" diye sunmak, bakiyesi dolu premium kullanıcıya karşılığı
   *     olmayan bir söz verirdi.
   *
   * ⚠️ ARTIK HİÇBİR SAYI BURADA YAZILI DEĞİL. Hepsi sunucudan; sunucu da
   * onları ödemeyi yapan modüllerin kendi sabitlerinden okuyor
   * (lib/ekonomi.cjs, lib/lc-regen.cjs). Buraya sabit yazmak, bugün
   * düzeltilen sapmayı geri getirir.
   */
  const perkRows = perks && freePerks
    ? [
        { icon: "🛡️", label: "Aylık LC güvencesi", note: "Ay başında bakiyen altına düşmüşse buraya tamamlanır",
          free: "—", prem: `${perks.monthlyFloor} LC'ye tamamlanır` },
        { icon: "🎁", label: "Günlük LC güvencesi", note: "Bakiyen tabanın altındaysa farklı yatırılır",
          free: `${freePerks.dailyLc} LC'ye`, prem: `${perks.dailyLc} LC'ye` },
        { icon: "⏳", label: "Token birikimi", note: null,
          free: `${freePerks.regenCap} tavan / ${freePerks.regenHours} saatte +1`,
          prem: `${perks.regenCap} tavan / ${perks.regenHours} saatte +1` },
        { icon: "🛒", label: "Mağaza bonusu", note: null,
          free: "—", prem: `%${Math.round(perks.storeBonusPct * 100)} ekstra LC` },
      ]
    : [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 4 }}>
        <Text style={{ color: Colors.muted, fontSize: 12 }}>← Geri</Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 22, fontWeight: "900", color: Colors.slate900 }}>🌟 SkorLig Premium</Text>
      <Text style={{ color: Colors.muted, fontSize: 12 }}>
        Her ay yenilenen büyük LC kasası, daha hızlı token birikimi ve mağazada bonus LC. Bol bol tahmin gir.
      </Text>
      <Text style={{ color: "#059669", fontSize: 11, fontWeight: "600" }}>
        {/* ⚠️ Bedel METNE GÖMÜLÜYDU ("(3 LC)"). Sunucudaki değer değişirse ekran
            yalan söylerdi; artık sunucudan geliyor, gelmezse sayı hiç yazılmıyor. */}
        ⚖️ Adil oyun: Puanlar, maç ödülleri ve maç girişi ücreti herkes için eşittir
        {data?.matchEntryCost != null ? ` (${data.matchEntryCost} LC)` : ""}. Premium sıralamada
        avantaj vermez, sadece token'a daha rahat ulaşmanı sağlar.
      </Text>

      {loading && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <ActivityIndicator size="small" />
          <Text style={{ color: Colors.muted }}>Yükleniyor...</Text>
        </View>
      )}

      {!loading && data?.ok && (
        <>
          {/* Durum kartı */}
          <View
            style={{
              padding: 14,
              borderRadius: 14,
              borderWidth: 2,
              borderColor: active ? "#fbbf24" : Colors.border,
              backgroundColor: active ? "#fffbeb" : "#fff",
              alignItems: "center",
              gap: 4,
            }}
          >
            {active ? (
              <>
                <Text style={{ fontSize: 26 }}>🌟</Text>
                <Text style={{ fontWeight: "900", color: "#92400e", fontSize: 16 }}>Premium Aktif</Text>
                {data.via === "1987" ? (
                  <Text style={{ color: "#b45309", fontSize: 12 }}>1987 üyeliğinle premium ayrıcalıkların açık.</Text>
                ) : data.premiumUntil ? (
                  <Text style={{ color: "#b45309", fontSize: 12 }}>Bitiş: {String(data.premiumUntil).slice(0, 10)}</Text>
                ) : null}
              </>
            ) : (
              <Text style={{ color: Colors.muted, fontSize: 13 }}>Şu an ücretsiz kademedesin.</Text>
            )}
          </View>

          {/* Ayrıcalık tablosu */}
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: Colors.border,
              overflow: "hidden",
            }}
          >
            <View style={{ flexDirection: "row", padding: 10, backgroundColor: "#0f172a" }}>
              <Text style={{ flex: 1, color: "#fff", fontWeight: "700", fontSize: 12 }}>Ayrıcalık</Text>
              <Text style={{ width: 90, color: "#94a3b8", fontWeight: "700", fontSize: 11, textAlign: "center" }}>Ücretsiz</Text>
              <Text style={{ width: 100, color: "#fbbf24", fontWeight: "800", fontSize: 11, textAlign: "center" }}>Premium</Text>
            </View>
            {perkRows.map((row, ix) => (
              <View
                key={row.label}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  padding: 10,
                  borderTopWidth: ix === 0 ? 0 : 1,
                  borderTopColor: Colors.border,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: Colors.slate900 }}>
                    {row.icon} {row.label}
                  </Text>
                  {/* ⚠️ TAMAMLAMA olan ayrıcalıklarda mekanik YAZILMAK ZORUNDA:
                      bakiyen tabanın üstündeyse verilen 0. Bu satır olmadan
                      tablo "her ay şu kadar LC alırsın" diye okunuyor. */}
                  {row.note ? (
                    <Text style={{ fontSize: 10, color: Colors.muted, marginTop: 2 }}>{row.note}</Text>
                  ) : null}
                </View>
                <Text style={{ width: 90, fontSize: 11, color: Colors.muted, textAlign: "center" }}>{row.free}</Text>
                <Text style={{ width: 100, fontSize: 11, color: "#059669", fontWeight: "800", textAlign: "center" }}>
                  {row.prem}
                </Text>
              </View>
            ))}
          </View>

          {/* Abonelik planları */}
          {!active || data.via !== "1987" ? (
            <>
              <Text style={{ fontWeight: "700", marginTop: 4 }}>
                {active ? "Uzat" : "Abone Ol"}
                {data.mode === "mock" ? "  (test modu)" : ""}
              </Text>
              {(data.plans || []).map((p) => (
                <TouchableOpacity
                  key={p.id}
                  disabled={subscribing === p.id}
                  onPress={() => subscribe(p)}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: 14,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: p.popular ? "#fbbf24" : Colors.border,
                    backgroundColor: p.popular ? "#fffbeb" : "#fff",
                    opacity: subscribing === p.id ? 0.6 : 1,
                  }}
                >
                  <View>
                    <Text style={{ fontWeight: "800", fontSize: 14, color: Colors.slate900 }}>
                      {p.label}
                      {p.popular ? " ⭐" : ""}
                    </Text>
                    <Text style={{ color: Colors.muted, fontSize: 11 }}>{p.days} gün</Text>
                  </View>
                  <Text style={{ fontWeight: "900", color: Colors.accent, fontSize: 16 }}>
                    {subscribing === p.id ? "..." : `₺${p.priceTRY}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </>
          ) : null}
        </>
      )}

      {!loading && !data?.ok && (
        <Text style={{ color: "#f97316", marginTop: 8 }}>Premium bilgisi yüklenemedi: {data?.error || "?"}</Text>
      )}
    </ScrollView>
  );
}
