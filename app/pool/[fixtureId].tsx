import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, TextInput,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import Colors from "../../constants/colors";
import { getApiBase, resetApiBase } from "../../lib/apiBase";
import { getAuthHeaders, apiFetch as sharedApiFetch } from "../../lib/apiFetch";
import { useUserId } from "../../lib/useUserId";

/**
 * MAÇ HAVUZU EKRANI (bkz. api/lib/pool-store.cjs, docs/ekonomi-tasarim.md §4).
 *
 * ⚠️ EKRANIN ASIL İŞİ İKİ SAYIYI AYIRMAK.
 *
 *   "Tahmin dağılımı: 20 / 38 / 98"  ← bot + insan, BİLGİ sinyali
 *   "Havuz: 60 LC (4 oyuncu)"        ← yalnızca gerçek para
 *
 * 158 kişi tahmin verip havuzda 60 LC olması NORMAL: botlar dağılımı
 * oluşturur, parayı oluşturmaz. Bu ayrım gösterilmezse kullanıcı hata sanar.
 * Uç de bu yüzden iki ayrı alan döndürüyor (`distribution` ve `pool`).
 *
 * Çarpanlar CANLI: kalabalığa gitmenin bedeli düşük çarpan — bu bir kusur
 * değil, oyunun konusu.
 */

type Side = "H" | "D" | "A";

type PoolSummary = {
  fixtureId: string;
  totals: Record<Side, number>;
  counts: Record<Side, number>;
  pool: number;
  players: number;
  multipliers: Record<Side, number | null>;
  cutPct: number;
  minBet: number;
  cap: number;
  settledAt: string | null;
  outcome: Side | null;
};

type Distribution = { H: number; D: number; A: number; total: number; humans: number; bots: number };
type MyBet = { side: Side; amount: number } | null;

const SIDE_LABEL: Record<Side, string> = { H: "Ev", D: "Beraberlik", A: "Deplasman" };

/**
 * Paylasilan apiFetch'e delege eder.
 *
 * ⚠️ Buradaki kopya ham `fetch` kullaniyordu (zaman asimi/yeniden deneme yok)
 * ama bir seyi DOGRU yapiyordu: ag hatasinda `resetApiBase()` ile adresi
 * tazeleyip bir kez yeniden deniyordu. O davranis kaybolmasin diye
 * lib/apiFetch icine tasindi — ve orada yalnizca GET/HEAD icin uygulaniyor
 * (POST'u tekrarlamak cifte tahmin/bahis demek olurdu).
 */
async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const p = path.startsWith("/") ? path : `/${path}`;
  return sharedApiFetch(p, init as any);
}

export default function PoolScreen() {
  const { fixtureId } = useLocalSearchParams<{ fixtureId: string }>();
  const userId = useUserId();
  const fid = String(fixtureId || "");

  const [pool, setPool] = useState<PoolSummary | null>(null);
  const [dist, setDist] = useState<Distribution | null>(null);
  const [myBet, setMyBet] = useState<MyBet>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [yenileniyor, setYenileniyor] = useState(false);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [secilenTaraf, setSecilenTaraf] = useState<Side | null>(null);
  const [tutar, setTutar] = useState("");

  const yukle = useCallback(async () => {
    if (!fid) return;
    try {
      const q = userId ? `?userId=${encodeURIComponent(userId)}` : "";
      const r = await apiFetch(`/api/pool/${encodeURIComponent(fid)}${q}`);
      const j = await r.json();
      if (j?.ok) {
        setPool(j.pool);
        setDist(j.distribution);
        setMyBet(j.myBet ? { side: j.myBet.side, amount: Number(j.myBet.amount || 0) } : null);
        // Taraf kilitliyse seçimi ona sabitle: sunucu taraf değişimini
        // reddediyor, arayüzün aksini ima etmesi kullanıcıyı yanıltırdı.
        if (j.myBet?.side) setSecilenTaraf(j.myBet.side);
      }
    } catch {
      // Sessiz: yenileme başarısızsa eldeki veri durur.
    } finally {
      setYukleniyor(false);
      setYenileniyor(false);
    }
  }, [fid, userId]);

  useEffect(() => { yukle(); }, [yukle]);

  const bahisKoy = async () => {
    if (!secilenTaraf) return Alert.alert("Taraf seç", "Önce Ev / Beraberlik / Deplasman seç.");
    const miktar = Math.round(Number(tutar || 0));
    if (!Number.isFinite(miktar) || miktar <= 0) {
      return Alert.alert("Tutar", "Geçerli bir LC tutarı gir.");
    }
    setGonderiliyor(true);
    try {
      const r = await apiFetch(`/api/pool/${encodeURIComponent(fid)}/bet`, {
        method: "POST",
        body: JSON.stringify({ side: secilenTaraf, amount: miktar }),
      });
      const j = await r.json();
      if (!j?.ok) {
        // Sunucu sebebi kod olarak dönüyor; kullanıcıya ne yapabileceğini söyle.
        const mesajlar: Record<string, string> = {
          LC_NOT_ENOUGH: `Bakiyen yetmiyor (${j.lc ?? "?"} LC).`,
          OVER_CAP: `Bu maçta şu an en fazla ${j.cap} LC oynanabilir. Havuz büyüdükçe sınır da artar.`,
          MIN_BET: `En az ${j.minBet} LC oynanabilir.`,
          SIDE_LOCKED: `Bu maçta "${SIDE_LABEL[j.side as Side]}" seçmiştin. Taraf değiştirilemez, üstüne ekleyebilirsin.`,
          POOL_SETTLED: "Bu maçın havuzu kapandı.",
          BOT_NOT_ALLOWED: "Bu hesap havuza katılamaz.",
          AUTH_REQUIRED: "Bahis için giriş yapmalısın.",
        };
        Alert.alert("Olmadı", mesajlar[j.error] || "Bahis kaydedilemedi.");
        return;
      }
      setTutar("");
      setPool(j.summary);
      setMyBet(j.bet);
      Alert.alert("Tamam", `${miktar} LC ${SIDE_LABEL[secilenTaraf]} tarafına kondu.`);
    } catch {
      Alert.alert("Bağlantı", "Sunucuya ulaşılamadı.");
    } finally {
      setGonderiliyor(false);
    }
  };

  if (yukleniyor) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  const kapali = !!pool?.settledAt;
  const toplamDagilim = dist?.total || 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={{ padding: 16, gap: 14 }}
      refreshControl={
        <RefreshControl
          refreshing={yenileniyor}
          onRefresh={() => { setYenileniyor(true); yukle(); }}
          tintColor={Colors.accent}
        />
      }
    >
      <Text style={{ color: Colors.text, fontSize: 20, fontWeight: "700" }}>Maç Havuzu</Text>

      {/* ── HAVUZ: yalnızca gerçek para ───────────────────────────────── */}
      <View style={{ backgroundColor: Colors.card, borderColor: Colors.cardBorder, borderWidth: 1, borderRadius: 12, padding: 14, gap: 6 }}>
        <Text style={{ color: Colors.muted, fontSize: 12 }}>HAVUZ</Text>
        {/**
          * ⚠️ VERİ GELMEDEN "0 LC" VE "KESİNTİ %0" YAZIYORDU.
          *
          * `pool` null başlıyor, yalnızca başarılı yüklemede yazılıyor ve iki
          * yükleme yolunun ikisi de sessiz `catch {}`. Yükleme başarısızsa
          * (ya da henüz bitmediyse) ekran şunu diyordu:
          *     "0 LC · 0 oyuncu · kesinti %0 (yakılır)"
          *
          * İkisi de yanlış bilgi:
          *   - havuz DOLU olabilir, boş gösteriliyordu
          *   - kesinti GERÇEKTE var, kullanıcıya %0 deniyordu — yani para
          *     şartı hakkında yanlış beyan. Düello ekranında kesinti oranı
          *     tam bu sebeple sunucudan alınıyor.
          *
          * Bilinmeyen ile sıfır aynı şey değil; aynı sınıf bugün premium
          * tablosunda, mini profilde ve tahmin ekranındaki bakiyede de çıktı.
          */}
        <Text style={{ color: Colors.accent, fontSize: 26, fontWeight: "800" }}>
          {pool ? `${pool.pool ?? 0} LC` : "— LC"}
        </Text>
        <Text style={{ color: Colors.muted, fontSize: 13 }}>
          {pool
            ? `${pool.players ?? 0} oyuncu · kesinti %${Math.round((pool.cutPct ?? 0) * 100)} (yakılır)`
            : "Havuz bilgisi yüklenemedi"}
        </Text>
        {kapali && (
          <Text style={{ color: Colors.finished, fontSize: 13, fontWeight: "600" }}>
            Kapandı · sonuç {pool?.outcome ? SIDE_LABEL[pool.outcome] : "—"}
          </Text>
        )}
      </View>

      {/* ── TARAFLAR: canlı çarpanlar ─────────────────────────────────── */}
      <View style={{ gap: 8 }}>
        {(["H", "D", "A"] as Side[]).map((s) => {
          const secili = secilenTaraf === s;
          const carpan = pool?.multipliers?.[s];
          const kilitli = !!myBet && myBet.side !== s;
          return (
            <TouchableOpacity
              key={s}
              disabled={kapali || kilitli}
              onPress={() => setSecilenTaraf(s)}
              style={{
                backgroundColor: secili ? Colors.accent : Colors.card,
                borderColor: secili ? Colors.accent : Colors.cardBorder,
                borderWidth: 1, borderRadius: 12, padding: 14,
                opacity: kapali || kilitli ? 0.45 : 1,
                flexDirection: "row", alignItems: "center", justifyContent: "space-between",
              }}
            >
              <View>
                <Text style={{ color: secili ? Colors.onAccent : Colors.text, fontWeight: "700", fontSize: 15 }}>
                  {SIDE_LABEL[s]}
                </Text>
                <Text style={{ color: secili ? Colors.onAccent : Colors.muted, fontSize: 12 }}>
                  {pool?.totals?.[s] ?? 0} LC · {pool?.counts?.[s] ?? 0} kişi
                </Text>
              </View>
              <Text style={{ color: secili ? Colors.onAccent : Colors.accent, fontWeight: "800", fontSize: 18 }}>
                {carpan == null ? "—" : `${carpan}×`}
              </Text>
            </TouchableOpacity>
          );
        })}
        <Text style={{ color: Colors.muted, fontSize: 12 }}>
          Çarpanlar canlı: az tutulan taraf daha çok kazandırır.
        </Text>
      </View>

      {/* ── BAHİS ─────────────────────────────────────────────────────── */}
      {!kapali && (
        <View style={{ backgroundColor: Colors.card, borderColor: Colors.cardBorder, borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 }}>
          {myBet && (
            <Text style={{ color: Colors.text, fontSize: 13 }}>
              Mevcut bahsin: <Text style={{ fontWeight: "700" }}>{myBet.amount} LC · {SIDE_LABEL[myBet.side]}</Text>
              {"  "}(taraf değiştirilemez, üstüne ekleyebilirsin)
            </Text>
          )}
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <TextInput
              value={tutar}
              onChangeText={setTutar}
              keyboardType="number-pad"
              placeholder={`${pool?.minBet ?? 5}–${pool?.cap ?? 20} LC`}
              placeholderTextColor={Colors.muted}
              style={{
                flex: 1, color: Colors.text, backgroundColor: Colors.bg,
                borderColor: Colors.cardBorder, borderWidth: 1, borderRadius: 10,
                paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
              }}
            />
            <TouchableOpacity
              disabled={gonderiliyor}
              onPress={bahisKoy}
              style={{
                backgroundColor: Colors.accent, borderRadius: 10,
                paddingHorizontal: 18, paddingVertical: 12, opacity: gonderiliyor ? 0.6 : 1,
              }}
            >
              <Text style={{ color: Colors.onAccent, fontWeight: "800" }}>
                {gonderiliyor ? "..." : "Oyna"}
              </Text>
            </TouchableOpacity>
          </View>
          {/* Tavan kuralını gizlemek yerine açıkla: kullanıcı reddedilince
              "neden" diye sormasın. */}
          <Text style={{ color: Colors.muted, fontSize: 12 }}>
            Bu maçta üst sınır {pool?.cap ?? 20} LC. Sınır havuzun dörtte biri kadar —
            havuz büyüdükçe artar.
          </Text>
        </View>
      )}

      {/* ── TAHMİN DAĞILIMI: bot + insan, PARA DEĞİL ──────────────────── */}
      <View style={{ backgroundColor: Colors.card, borderColor: Colors.cardBorder, borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 }}>
        <Text style={{ color: Colors.muted, fontSize: 12 }}>TAHMİN DAĞILIMI</Text>
        <Text style={{ color: Colors.text, fontSize: 16, fontWeight: "700" }}>
          {dist?.H ?? 0} / {dist?.D ?? 0} / {dist?.A ?? 0}
        </Text>
        {(["H", "D", "A"] as Side[]).map((s) => {
          const adet = dist?.[s] ?? 0;
          const oran = toplamDagilim > 0 ? adet / toplamDagilim : 0;
          return (
            <View key={s} style={{ gap: 3 }}>
              <Text style={{ color: Colors.muted, fontSize: 11 }}>
                {SIDE_LABEL[s]} · {Math.round(oran * 100)}%
              </Text>
              <View style={{ height: 6, backgroundColor: Colors.bg, borderRadius: 3, overflow: "hidden" }}>
                <View style={{ width: `${Math.round(oran * 100)}%`, height: 6, backgroundColor: Colors.info }} />
              </View>
            </View>
          );
        })}
        {/* ⚠️ Bu satır olmazsa "158 kişi oynadı ama havuz 60 LC" hata sanılır. */}
        <Text style={{ color: Colors.muted, fontSize: 12, marginTop: 4 }}>
          {toplamDagilim} tahmin ({dist?.humans ?? 0} oyuncu, {dist?.bots ?? 0} bot).
          Dağılım tahminleri gösterir; havuzdaki para yalnızca gerçek oyunculardan gelir.
        </Text>
      </View>
    </ScrollView>
  );
}
