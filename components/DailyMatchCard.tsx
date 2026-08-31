import React, { useEffect, useState, useRef } from "react";
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  Animated, StyleSheet, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import Basinc from "./Basinc";
import GradyanZemin from "./GradyanZemin";
import Konfeti from "./Konfeti";
import { titret } from "../lib/hisler";
import { MacKartiIskeleti } from "./Iskelet";
import { Gradyan } from "../constants/colors";
import { t, useLang } from "../lib/i18n";
import { macSaatiEtiketi, takvimGunFarki } from "../lib/macSaati";
import { ligEtiketi } from "../lib/ulkeler";
import hataMesaji from "../lib/hataMesaji";
import { apiFetch } from "../lib/apiFetch";

type Fixture = {
  fixtureId: string;
  home: string;
  away: string;
  kickoffISO: string | null;
  status: string;
  league: string | null;
  country: string | null;
};

type Props = {
  country?: string | null;
  userId?: string;
};

/* Renkler predict/kupon ile BİREBİR: ev=mavi, beraberlik=kehribar,
 * deplasman=kırmızı. Eskiden beraberlik gri, deplasman turuncuydu — aynı
 * 1X2'yi üç ekranda üç ayrı renkle görmek "renkler kaymış" hissi veriyordu. */
const OUTCOMES = [
  { key: "home", api: "H", color: "#3b82f6" },
  { key: "draw", api: "D", color: "#f59e0b" },
  { key: "away", api: "A", color: "#ef4444" },
] as const;

export default function DailyMatchCard({ country, userId }: Props) {
  useLang(); // dil değişince yeniden çizilsin
  const router = useRouter();
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [oranlar, setOranlar] = useState<{ home: number; draw: number; away: number } | null>(null);
  const lcAnim = useRef(new Animated.Value(0)).current;
  // Geri sayım her dakika yenilensin — saniyelik tik pil ve render israfı.
  const [, setTik] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTik((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const qs = country ? `?country=${encodeURIComponent(country)}` : "";
        const r = await apiFetch(`/api/live/daily-featured${qs}`);
        const json = await r.json();
        if (!cancelled && json.ok && json.fixture) setFixture(json.fixture);
      } catch {}
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [country]);

  /* Oranlar karta da gelsin: kullanıcı "kim yener"i ORANSIZ seçiyordu —
   * hangi seçimin kaç puan getireceği ancak tahmin ekranında görünüyordu.
   * Aynı ucu (pred/weights) kullanıyoruz; hata olursa kart oransız çalışmaya
   * devam eder, tahmin engellenmez. */
  useEffect(() => {
    if (!fixture) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await apiFetch(
          `/api/pred/weights?fixtureId=${encodeURIComponent(fixture.fixtureId)}`
        ).then((x) => x.json());
        if (!cancelled && r?.ok && r.odds) setOranlar(r.odds);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [fixture?.fixtureId]);

  /* ⚠️ SEÇİM ARTIK GÖNDERMİYOR — yalnızca taslak.
   *
   * Eskiden bir seçeneğe dokunmak DOĞRUDAN /api/pred/submit'e gidiyordu:
   * yanlışlıkla basan ya da fikrini değiştiren kullanıcının geri dönüşü
   * yoktu, tahmini LC harcanmış olarak kaydolmuştu. Aynı ekranda
   * `predict.tsx` zaten toggle + ayrı gönder deseniyle çalışıyordu; kart
   * o desenin dışında kalmıştı.
   *
   * Yeni akış: dokun → taslak · aynısına dokun → seçim kalkar · Gönder → API.
   */
  function handlePick(outcome: string) {
    if (submitted || busy || !fixture) return;
    titret("hafif");
    setSelected(cur => (cur === outcome ? null : outcome));
  }

  async function gonder() {
    if (submitted || busy || !fixture || !selected) return;
    const outcome = selected;
    setBusy(true);
    try {
      // ⚠️ YANIT KONTROL EDILIYOR. Eskiden `await fetch(...)` sonrasi dogrudan
      // "kaydedildi" gosteriliyordu: sunucu "bakiyen yetmiyor" / "mac basladi"
      // / "zaten tahmin ettin" dese bile kullanici tahminini kaydettigini
      // saniyordu. Para yolunda sessiz basarisizlik.
      const res = await apiFetch(`/api/pred/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fixtureId: fixture.fixtureId,
          outcome: OUTCOMES.find(o => o.key === outcome)?.api ?? outcome,
          type: "result",
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || j?.ok === false) {
        /* ⚠️ SEÇİM KORUNUYOR. Eskiden `setSelected(null)` vardı: sunucu
         * geçici bir hata döndüğünde kullanıcı seçimini de kaybediyor,
         * baştan seçmek zorunda kalıyordu. Taslak akışında seçim kullanıcıya
         * ait — hata gönderimi başarısız kılar, seçimi değil. */
        Alert.alert(t("predFailedTitle"), hataMesaji(j?.error));
        setBusy(false);
        return;
      }
      setSubmitted(true);
      titret("gol");
      // LC animasyonu
      Animated.sequence([
        Animated.timing(lcAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.delay(1200),
        Animated.timing(lcAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    } catch {
      /* Ağ hatası da sessiz kalmamalı: eskiden `catch {}` idi ve kullanıcı
       * düğmeye bastığında hiçbir şey olmuyormuş gibi görünüyordu. */
      Alert.alert(t("predFailedTitle"), t("netErr"));
    }
    setBusy(false);
  }

  if (loading) return (
    <View style={s.card}>
      <MacKartiIskeleti />
    </View>
  );

  if (!fixture) return null;

  const kickDt = fixture.kickoffISO ? new Date(fixture.kickoffISO) : null;
  const bugun = new Date();
  // TAKVİM günü farkı: 24 saate bölen eski hesap, bugün 14:00te bakılırken
  // YARIN 20:00 maçına "2 gün sonra" diyordu (30/24 -> ceil 2).
  const gunFarki = kickDt ? Math.max(0, takvimGunFarki(kickDt, bugun)) : 0;

  const kickoff = macSaatiEtiketi(fixture.kickoffISO, { bugun: t("today"), yarin: t("tomorrow") }) || null;

  // Bugünkü maçta saatten çok "ne kadar kaldı" heyecan verir: son 6 saatte
  // canlı geri sayım gösterilir, dakikada bir yenilenir.
  const kalanMs = kickDt ? kickDt.getTime() - Date.now() : -1;
  const geriSayim =
    kalanMs > 0 && kalanMs < 6 * 3600_000
      ? kalanMs >= 3600_000
        ? `${Math.floor(kalanMs / 3600_000)}s ${Math.floor((kalanMs % 3600_000) / 60_000)}dk`
        : `${Math.max(1, Math.floor(kalanMs / 60_000))}dk`
      : null;

  const lcOpacity = lcAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const lcY = lcAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -24] });

  return (
    <View style={s.card}>
      <GradyanZemin renkler={Gradyan.card} yon="dikey" />
      {/* Üst bilgi */}
      <View style={s.meta}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
          <Text style={s.league}>{ligEtiketi(fixture.league, fixture.country) || t("matchFallback")}</Text>
          {gunFarki >= 2 && (
            <View style={s.countdownBadge}>
              <Text style={s.countdownText}>{t("inDays", { n: gunFarki })}</Text>
            </View>
          )}
        </View>
        {geriSayim ? (
          <View style={s.geriSayimRozet}>
            <Text style={s.geriSayimYazi}>⏳ {geriSayim}</Text>
          </View>
        ) : kickoff ? (
          <Text style={s.kickoff}>⏱ {kickoff}</Text>
        ) : null}
      </View>

      {/* Takım isimleri */}
      <View style={s.teams}>
        <Text style={s.teamName} numberOfLines={2}>{fixture.home}</Text>
        <Text style={s.vs}>vs</Text>
        <Text style={s.teamName} numberOfLines={2}>{fixture.away}</Text>
      </View>

      {/* Sonuç butonları */}
      {!submitted ? (
        <View style={s.buttons}>
          {OUTCOMES.map(o => {
            const label = o.key === "home" ? fixture.home
              : o.key === "away" ? fixture.away
              : "X";

            const isSelected = selected === o.key;
            const oran = oranlar?.[o.key];
            return (
              <Basinc
                key={o.key}
                onPress={() => handlePick(o.key)}
                disabled={busy}
                style={{ flex: 1 }}
                scaleTo={0.92}
              >
                <View
                  style={[
                    s.btn,
                    { borderColor: o.color },
                    isSelected && { backgroundColor: o.color, shadowColor: o.color, shadowOpacity: 0.6, shadowRadius: 8, elevation: 6 },
                  ]}
                >
                  {busy && isSelected
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <>
                        <Text style={[s.btnText, isSelected && { color: "#fff" }]} numberOfLines={1}>
                          {label}
                        </Text>
                        {typeof oran === "number" && oran > 1 && (
                          <Text style={[s.oranText, isSelected && { color: "#fff" }]}>
                            {oran.toFixed(2)}
                          </Text>
                        )}
                      </>
                  }
                </View>
              </Basinc>
            );
          })}
        </View>
      ) : (
        <View style={s.doneRow}>
          <Konfeti anahtar={fixture.fixtureId} />
          <Text style={s.doneText}>{t("predSaved")}</Text>
          <Animated.Text style={[s.lcBadge, { opacity: lcOpacity, transform: [{ translateY: lcY }] }]}>
            +LC
          </Animated.Text>
        </View>
      )}

      {/* ── GÖNDER ── yalnızca taslak seçim varken.
          Seçim yapılana kadar hiç yer kaplamaz; çıktığında kartın asıl
          eylemi olduğu belli olsun diye dolu ve geniş. */}
      {!submitted && !!selected && (
        <>
          <TouchableOpacity onPress={gonder} disabled={busy} style={[s.gonderBtn, busy && { opacity: 0.6 }]}>
            {busy
              ? <ActivityIndicator color="#052e16" size="small" />
              : <Text style={s.gonderYazi}>{t("sendPred")}</Text>}
          </TouchableOpacity>
          <Text style={s.iptalIpucu}>{t("tapToCancel")}</Text>
        </>
      )}

      {/**
        * ⚠️ TAHMİNDEN SONRA SIRALAMA — DÖNGÜYÜ KAPATAN ADIM.
        *
        * Kart tahmini alıyordu ama kullanıcıyı hiçbir yere götürmüyordu:
        * "kaydedildi" yazısı çıkıyor, sonrası yok. Oysa asıl geri bildirim
        * "bu maçta kaç kişi arasında neredeyim" — o ekran (`match-race`)
        * zaten vardı, sadece buradan erişilemiyordu.
        *
        * Tahmin ÖNCESİ "detaylı tahmin" (diğer tahmin türleri), tahmin
        * SONRASI "sıralamayı gör" gösteriliyor: her aşamada tek ve net bir
        * sonraki adım.
        */}
      {submitted ? (
        <TouchableOpacity
          onPress={() => router.push({
            pathname: "/match-race/[fixtureId]",
            params: { fixtureId: fixture.fixtureId, userId },
          })}
          style={s.detailLink}
        >
          <Text style={s.detailText}>{t("seeMatchRank")}</Text>
        </TouchableOpacity>
      ) : (
        /* ⚠️ ESKİDEN live sekmesine "focusId" ile atıyordu — kullanıcı maçı
         * listede kendisi bulup Tahmin'e bir daha basmak zorundaydı; çoğu
         * burada kopuyordu. Artık DOĞRUDAN tahmin ekranına, maç bilgisiyle. */
        <TouchableOpacity
          onPress={() => router.push({
            pathname: "/(tabs)/predict",
            params: {
              fixtureId: fixture.fixtureId,
              userId: userId || "",
              home: fixture.home,
              away: fixture.away,
              league: fixture.league || "",
              kickoffISO: fixture.kickoffISO || "",
            },
          })}
          style={s.detayDugme}
        >
          <Text style={s.detayDugmeYazi}>{t("detailedPred2")} →</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: "#0f172a",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1e293b",
    overflow: "hidden",
    padding: 16,
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 4,
  },
  meta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  league: { color: "#a3e635", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  kickoff: { color: "#64748b", fontSize: 11 },
  teams: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    gap: 8,
  },
  teamName: {
    flex: 1,
    color: "#f1f5f9",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  vs: { color: "#475569", fontSize: 12, fontWeight: "600", paddingHorizontal: 4 },
  buttons: { flexDirection: "row", gap: 8, marginBottom: 10 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#94a3b8", fontWeight: "800", fontSize: 12 },
  doneRow: { alignItems: "center", paddingVertical: 10, position: "relative" },
  doneText: { color: "#a3e635", fontWeight: "700", fontSize: 14 },
  lcBadge: {
    position: "absolute",
    top: -8,
    color: "#fbbf24",
    fontWeight: "900",
    fontSize: 16,
  },
  detailLink: { alignItems: "flex-end", marginTop: 4 },
  detailText: { color: "#475569", fontSize: 11 },
  oranText: { color: "#94a3b8", fontSize: 10, fontWeight: "700", marginTop: 2 },
  /* Eski hali 11px soluk gri bir yazıydı — fiilen görünmezdi. Skor ve alt
   * tahminlere giden TEK kapı olduğu için düğme gibi görünmek zorunda. */
  detayDugme: {
    marginTop: 10,
    alignSelf: "stretch",
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#fbbf2455",
    backgroundColor: "#fbbf2411",
  },
  detayDugmeYazi: { color: "#fbbf24", fontSize: 13, fontWeight: "800" },
  gonderBtn: {
    marginTop: 12,
    alignSelf: "stretch",
    alignItems: "center",
    paddingVertical: 13,
    borderRadius: 999,
    backgroundColor: "#4ade80",
  },
  gonderYazi: { color: "#052e16", fontSize: 15, fontWeight: "900" },
  iptalIpucu: { color: "#64748b", fontSize: 11, textAlign: "center", marginTop: 6 },
  countdownBadge: {
    backgroundColor: "#22c55e22",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  countdownText: {
    color: "#22c55e",
    fontSize: 10,
    fontWeight: "700",
  },
  geriSayimRozet: {
    backgroundColor: "#f59e0b22",
    borderWidth: 1,
    borderColor: "#f59e0b55",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  geriSayimYazi: {
    color: "#fbbf24",
    fontSize: 11,
    fontWeight: "800",
  },
});
