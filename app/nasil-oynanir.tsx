import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { apiFetch } from "../lib/apiFetch";
import { t, useLang } from "../lib/i18n";
import Colors from "../constants/colors";
import BackBar from "../components/BackBar";
import { TIER_KEYS } from "../components/StreakBar";

/**
 * NASIL OYNANIR — kuralların sade ve aranabilir tek sayfası.
 *
 * ⚠️ NEDEN VAR (kullanıcı isteği 2026-09-13): kuralları anlatan tek yüzey
 * `app/index.tsx`teki dört giriş slaydıydı ve o ekran `isFirstRun()` ile
 * kapılı — ÖMÜRDE BİR KEZ. Hızlı geçen kullanıcı kuralları bir daha
 * bulamıyordu; sonradan aranıp bulunabilecek bir sayfa yoktu.
 *
 * ⚠️ İLK ÖLÇÜMÜM YANLIŞTI, kayda o hâliyle geçmesin: "hiçbir yüzey yok"
 * demiştim; slaytlar ilk grep'imin ÇIKTISINDAYDI ve dosyayı açmamıştım.
 * Boşluk yokluk değil ERİŞİLEMEZLİKTİ — çare de o yüzden yeni bir anlatı
 * değil, kalıcı bir adres.
 *
 * ⚠️ SAYILAR SUNUCUDAN, METİNDEN DEĞİL. Bedel, açılış bakiyesi, seri
 * bonusları, kupon bedeli ve 1987 tavanı DÖNEME bağlı: 30 Eylül'de maç
 * bedeli 1 → 3 olacak ve oranlı sabitlerin hepsi onunla birlikte değişecek.
 * Metne gömülmüş bir rakam o gün sayfayı yalancı yapardı — bu depoda aynı
 * sınıf üç kez ölçüldü. Kaynak: `GET /api/config` → `kurallar`.
 *
 * ⚠️ KÂRLILIK VAADİ YOK, bilerek. Ölçüldü (2026-09-13): "sonucu doğru bil"
 * ortalama ödülü iki dönemde de 2.50 LC, bedel 1 → 3; yani ödül/bedel oranı
 * 2.50x'ten 0.83x'e düşüyor. "Şu kadar kazanırsın" demek bir dönem doğru,
 * öteki dönem yanlış olurdu. Sayfa yalnızca merdiveni ve güncel bedeli
 * gösteriyor.
 *
 * ⚠️ SAYILAR OKUNAMAZSA SESSİZ KALMIYOR. Kurallar metni yine basılıyor ama
 * üstte sebebi yazan bir satır çıkıyor — eksik sayıyı boş bırakmak,
 * kullanıcının yanlış bir rakam uydurmasına yol açardı.
 */

type Kurallar = {
  macBedeli: number;
  lansman: { aktif: boolean; bitis?: string; normalBedel?: number };
  acilisBakiyesi: number;
  kilitDk: number;
  gunluk: { taban: number; regenTavan: number; regenSaat: number; regenMiktar: number };
  puanlama: Record<string, number>;
  odulMerdiveni: { tabanEnAz: number; lc: number; sifirHaric?: boolean }[];
  seri: { esik: number; bonus: number; etiket: string }[];
  kupon: { macSayisi: number; bedel: number };
  bonus1987: { tavan: number; kapsam: string };
};

/** Sunucudan gelen Türkçe kademe etiketini çevirir; tanımadığını olduğu gibi
 *  basar — bilinmeyen kademe boş satır göstermekten iyi. */
const kademeAdi = (etiket: string) => {
  const anahtar = TIER_KEYS[etiket];
  return anahtar ? t(anahtar) : etiket;
};

const sayi = (n: number | undefined) =>
  n == null ? "—" : Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);

export default function NasilOynanir() {
  useLang();
  const [k, setK] = useState<Kurallar | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState(false);

  const yukle = useCallback(async () => {
    try {
      const r = await apiFetch("/api/config");
      const j = await r.json();
      if (j?.kurallar) { setK(j.kurallar); setHata(false); }
      else setHata(true);
    } catch {
      /* Ağ ya da sunucu hatası: kurallar yine gösterilir, sayılar gizlenir. */
      setHata(true);
    } finally {
      setYukleniyor(false);
    }
  }, []);

  useEffect(() => { yukle(); }, [yukle]);

  const Bolum = ({ baslik, children }: { baslik: string; children: React.ReactNode }) => (
    <View style={s.bolum}>
      <Text style={s.baslik}>{baslik}</Text>
      {children}
    </View>
  );

  return (
    <View style={s.kok}>
      <BackBar title={t("howTitle")} />
      <ScrollView contentContainerStyle={s.icerik}>
        {yukleniyor && <ActivityIndicator style={{ marginBottom: 12 }} />}

        {hata && (
          <View style={s.uyari} accessibilityRole="alert">
            <Text style={s.uyariTxt}>{t("howNumbersFail")}</Text>
          </View>
        )}

        <Text style={s.giris}>{t("howLead")}</Text>

        <Bolum baslik={t("howStep1")}>
          <Text style={s.p}>{t("howStep1Desc", { n: sayi(k?.kilitDk) })}</Text>
        </Bolum>

        <Bolum baslik={t("howStep2")}>
          <Text style={s.p}>{t("howStep2Desc")}</Text>
        </Bolum>

        <Bolum baslik={t("howStep3")}>
          <Text style={s.p}>{t("howStep3Desc")}</Text>
        </Bolum>

        <Bolum baslik={t("howStep4")}>
          <Text style={s.p}>{t("howStep4Desc")}</Text>
          {(k?.odulMerdiveni || []).map((b) => (
            <View key={b.tabanEnAz} style={s.satir}>
              {/* ⚠️ EN ALT BASAMAK `> 0`, `>= 0` DEĞİL. "0+ puan" yazmak
                  sıfır puana da LC vaat ederdi; `macOdulu` vermiyor. */}
              <Text style={s.satirSol}>{b.sifirHaric ? "> 0" : `${b.tabanEnAz}+`} {t("points")}</Text>
              <Text style={s.satirSag}>{b.lc} LC</Text>
            </View>
          ))}
        </Bolum>

        <Bolum baslik={t("howEntry")}>
          <Text style={s.p}>{t("howEntryDesc", { n: sayi(k?.macBedeli) })}</Text>
          {k?.lansman?.aktif && (
            <Text style={s.lansman}>
              {t("howLaunch", {
                n: sayi(k.macBedeli),
                d: String(k.lansman.bitis || "").slice(0, 10),
                normal: sayi(k.lansman.normalBedel),
              })}
            </Text>
          )}
        </Bolum>

        <Bolum baslik={t("howLcTitle")}>
          <Text style={s.p}>{t("howLcStart", { n: sayi(k?.acilisBakiyesi) })}</Text>
          <Text style={s.p}>{t("howLcDaily", { n: sayi(k?.gunluk?.taban) })}</Text>
          <Text style={s.p}>
            {t("howLcRegen", {
              miktar: sayi(k?.gunluk?.regenMiktar),
              saat: sayi(k?.gunluk?.regenSaat),
              tavan: sayi(k?.gunluk?.regenTavan),
            })}
          </Text>
        </Bolum>

        <Bolum baslik={t("howStreakTitle")}>
          <Text style={s.p}>{t("howStreakDesc")}</Text>
          {(k?.seri || []).map((x) => (
            <View key={x.esik} style={s.satir}>
              {/* ⚠️ "ardışık" SABİT TÜRKÇE YAZILMIŞTI ve kademe etiketi
                  sunucudan da Türkçe geliyor — İngilizce arayüzde iki kelime
                  birden Türkçe kalıyordu. Etiket çevirisi zaten çözülmüş bir
                  iş: `StreakBar`ın `TIER_KEYS` haritası tek kaynak, ikinci
                  kopya çıkarmıyoruz. */}
              <Text style={s.satirSol}>
                {t("howStreakRow", { n: String(x.esik) })} · {kademeAdi(x.etiket)}
              </Text>
              <Text style={s.satirSag}>+{sayi(x.bonus)} LC</Text>
            </View>
          ))}
        </Bolum>

        <Bolum baslik={t("howCouponTitle")}>
          <Text style={s.p}>
            {t("howCouponDesc", { n: sayi(k?.kupon?.macSayisi), bedel: sayi(k?.kupon?.bedel) })}
          </Text>
        </Bolum>

        <Bolum baslik={t("how1987Title")}>
          <Text style={s.p}>{t("how1987Desc", { n: sayi(k?.bonus1987?.tavan) })}</Text>
        </Bolum>

        <Bolum baslik={t("howFairTitle")}>
          <Text style={s.p}>{t("howFairDesc")}</Text>
        </Bolum>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  kok:       { flex: 1, backgroundColor: Colors.bg ?? "#0b1220" },
  icerik:    { padding: 16, paddingBottom: 48 },
  giris:     { fontSize: 15, lineHeight: 22, color: "#e5e7eb", marginBottom: 18 },
  bolum:     { marginBottom: 18 },
  baslik:    { fontSize: 14, fontWeight: "800", color: "#f59e0b", marginBottom: 6 },
  p:         { fontSize: 14, lineHeight: 21, color: "#cbd5e1", marginBottom: 4 },
  satir:     { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4,
               borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#1e293b" },
  satirSol:  { fontSize: 13, color: "#cbd5e1" },
  satirSag:  { fontSize: 13, color: "#e5e7eb", fontWeight: "700" },
  lansman:   { fontSize: 13, lineHeight: 20, color: "#fbbf24", marginTop: 6 },
  uyari:     { backgroundColor: "#3f2d14", borderRadius: 10, padding: 10, marginBottom: 14 },
  uyariTxt:  { fontSize: 13, lineHeight: 19, color: "#fde68a" },
});
