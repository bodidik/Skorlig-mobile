import { Stack, useRouter, useSegments } from "expo-router";
import { t, useLang } from "../lib/i18n";
import { duelloBildirimHedefi } from "../lib/ozellikler";
import { ozellikAnlik } from "../hooks/useOzellikler";
import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "../constants/colors";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { isFirstRun } from "../lib/firstRun";
import { configureNotificationHandler, registerForPush } from "../lib/push";
import { flushPendingCountry } from "../lib/pendingCountry";
import { flushPendingTeam } from "../lib/pendingTeam";
import ErrorBoundary from "../components/ErrorBoundary";
import CountryBackfillPrompt from "../components/CountryBackfillPrompt";
import GeriEv, { GERIEV_ALANI } from "../components/GeriEv";
import {
  capturePendingRef, captureRefFromInitialUrl, applyPendingRef,
} from "../lib/referral";

configureNotificationHandler();

/** Bildirime tıklanınca ilgili ekrana götür. */
function routeForNotification(data: any): string | null {
  if (!data) return null;
  const fid = data.fixtureId ? String(data.fixtureId) : null;

  switch (data.screen) {
    case "match-race":
      return fid ? `/match-race/${encodeURIComponent(fid)}` : "/(tabs)/live";
    case "predict":
      return fid ? `/(tabs)/predict?fixtureId=${encodeURIComponent(fid)}` : "/(tabs)/predict";
    case "duel":
      // Düello kapalıyken de sonuç/iade bildirimi gelir — o zaman LC geçmişine.
      return duelloBildirimHedefi(ozellikAnlik());
    default:
      return null;
  }
}

function AuthGuard() {
  const { user, loading } = useAuth();
  const router   = useRouter();
  const segments = useSegments();

  const [firstRunChecked, setFirstRunChecked] = useState(false);
  const [firstRun, setFirstRun]               = useState(false);
  const pushDone    = useRef(false);
  const refDone     = useRef(false);
  const countryDone = useRef(false);

  useEffect(() => {
    isFirstRun().then((v) => {
      setFirstRun(v);
      setFirstRunChecked(true);
    });
  }, []);

  useEffect(() => {
    if (loading || !firstRunChecked) return;

    const inLogin = segments[0] === "login";

    /**
     * ⚠️ GİRİŞ DUVARI KALDIRILDI — misafir gezinebilir.
     *
     * Eskiden `user` yoksa KOŞULSUZ `/login`'e atılıyordu: yeni kullanıcı tek
     * bir maç bile görmeden Google girişiyle karşılaşıyordu. Uygulamanın ne
     * yaptığını görmeden hesap açmak istemeyen kişi orada kayboluyor.
     *
     * Üstelik bu, kodun kendi tasarımıyla ÇELİŞİYORDU: AuthContext
     * "başarısız olursa MİSAFİR devam, uygulama maç listesini ve sıralamaları
     * zaten oturumsuz gösteriyor" diyor. Ama anonim giriş Firebase'de kapalı
     * olduğu için `user` hep null kalıyor ve yönlendirme misafir yolunu
     * erişilemez kılıyordu. `GuestBanner` de bu yüzden hiç görünmüyordu.
     *
     * Okuma uçları (maç listesi, sıralama) kimlik istemiyor; YAZAN uçların
     * hepsinde `verifyToken` var. Yani misafir güvenle gezebilir, eylem
     * denediğinde girişe yönlendirilir.
     */
    if (user && inLogin) {
      // Girişten sonra: ilk kez ise onboarding, değilse doğrudan maçlar.
      router.replace(firstRun ? "/" : "/(tabs)/live");
    }
    // Misafir (user yok): yönlendirme YOK. Kök rota app/index.tsx zaten
    // onboarding'i gösterip maç listesine bırakıyor ve kimliksiz çalışıyor.
    // user + welcome → WelcomeScreen handle eder
    // user + tabs   → dokunma
  }, [user, loading, segments, firstRunChecked, firstRun]);

  // Push kaydı: kimlik oturduktan sonra, oturum başına bir kez.
  // Girişten önce denenirse apiFetch auth header'ı boş gider ve 401 alınır.
  useEffect(() => {
    if (!user || pushDone.current) return;
    pushDone.current = true;
    registerForPush();
    // Ses oynatıcısını ısıt: oturumun İLK gol sesi yutulmasın
    // (oynatıcı gol anında kurulursa WAV yüklenmeden play çağrılıyordu).
    require("../lib/hisler").sesiIsit();
  }, [user]);

  // Onboarding'de seçilen ülke oturum yokken gönderilememiş olabilir —
  // kimlik oturur oturmaz gönder. Başarısızsa kayıt durur, sonraki açılışta
  // tekrar denenir.
  //
  // ⚠️ TAKIM DA AYNI YOLDAN. Onboarding'e takım adımı eklendi ve o da
  // auth'tan önce seçiliyor; buraya eklenmezse seçim yerelde kalır ve
  // sunucuya HİÇ gitmez — ülke tarafında tam bu sebeple 837 kullanıcı
  // ülkesiz kalmıştı. bkz. lib/pendingChoice.ts
  useEffect(() => {
    if (!user || countryDone.current) return;
    countryDone.current = true;
    flushPendingCountry();
    flushPendingTeam();
  }, [user]);

  // Paylaşılan bağlantıdaki davet kodunu yakala (uygulama kapalıyken açıldı)
  useEffect(() => { captureRefFromInitialUrl(); }, []);

  // Uygulama açıkken gelen bağlantı
  useEffect(() => {
    const sub = Linking.addEventListener("url", ({ url }) => {
      try {
        const ref = Linking.parse(url).queryParams?.ref;
        if (typeof ref === "string") capturePendingRef(ref);
      } catch {}
    });
    return () => sub.remove();
  }, []);

  // Bekleyen davet kodunu giriş sonrası uygula — oturum başına bir kez
  useEffect(() => {
    if (!user || refDone.current) return;
    refDone.current = true;
    applyPendingRef().then((r) => {
      if (r?.ok) {
        Alert.alert(
          t("inviteAccepted"),
          r.reward ? t("linkedReward", { n: r.reward }) : t("linkedPlain")
        );
      }
    });
  }, [user]);

  // Kapalıyken gelen bildirime tıklanıp uygulama açıldıysa
  useEffect(() => {
    let alive = true;
    Notifications.getLastNotificationResponseAsync().then((resp) => {
      if (!alive || !resp) return;
      const to = routeForNotification(resp.notification.request.content.data);
      if (to) router.push(to as any);
    });
    return () => { alive = false; };
  }, []);

  // Uygulama açıkken bildirime tıklama
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const to = routeForNotification(resp.notification.request.content.data);
      if (to) router.push(to as any);
    });
    return () => sub.remove();
  }, [router]);

  return null;
}

export default function RootLayout() {
  useLang(); // dil değişince yeniden çizilsin
  const insets = useSafeAreaInsets();
  return (
    // ⚠️ EN DIŞTA: uygulamada hiç hata sınırı yoktu. Render sırasındaki tek bir
    // hata tüm ağacı söküyor, yayında uygulama beyaz ekrana/kapanmaya gidiyordu.
    // Kullanıcı ne olduğunu anlamadan gidiyor. bkz. components/ErrorBoundary.tsx
    <ErrorBoundary>
      <AuthProvider>
        <AuthGuard />
        {/* ⚠️ GERİ/ANA SAYFA ÇUBUĞUNA YER AYRILIYOR — BİR KEZ, BURADA.
          * Çubuk mutlak konumlu ve her yığın ekranının üstüne biniyordu;
          * ölçüldü, sekme dışı 32 ekranın hiçbiri telafi etmiyordu ve
          * başlıklar yarı yarıya örtülüydü. Alanı her ekrana ayrı ayrı
          * eklemek kopya olurdu — biri unutulur, sessizce örtülü kalır.
          *
          * `(tabs)` MUAF: orada çubuk zaten çizilmiyor (alt sekme çubuğu
          * var), boşluk bırakmak ekranı aşağı iterdi. `index` ve `login` de
          * muaf, çünkü GeriEv o yollarda kendini gizliyor (GIZLI_YOL).
          *
          * ⚠️ BU MUAFİYET LİSTESİ GeriEv'inkiyle EL İLE EŞLEŞİYOR — rota
          * ADI (index/login) ile yol ("/", "/login") ayrı şeyler olduğu
          * için türetmek okunaksız olurdu. İkisi ayrışırsa ya boşluk boşuna
          * kalır ya da başlık yine örtülür; eşitliği nöbetçi ölçüyor:
          * api/tests/geriev-alani-tek-kaynak.test.cjs */}
        {/* ⚠️ DURUM ÇUBUĞU DA BURADA (2026-09-17, emülatörde ölçüldü).
          * app.json `edgeToEdgeEnabled: true`: Android içeriği durum çubuğunun
          * ALTINA çiziyor. Buradaki boşluk yalnız GeriEv alanıydı; "içerik
          * gezginin güvenli alanından başlıyor" varsayımı web önizlemesinde
          * (insets.top = 0) doğruydu, cihazda değil. v35'te: ana ekran
          * kaydıkça saat 1-X-2 düğmelerinin, profilde "Profilim" başlığının,
          * kupon ekranında geri düğmesi "Haftalık Tahmin"in üstüne biniyordu —
          * kullanıcının "süperpozisyonlar" dediği şeyin bir parçası.
          * Sekmeler de güvenli alanı alıyor (GeriEv'den muaflar, durum
          * çubuğundan değil). Zemin rengi de burada: yoksa yığının açık tema
          * zemini durum çubuğunun arkasında gri şerit olarak görünüyordu.
          * `index` ve `login` kendi üst boşluklarını taşıyor (paddingTop 56). */}
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { paddingTop: insets.top + GERIEV_ALANI, backgroundColor: Colors.bg },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ contentStyle: { paddingTop: insets.top, backgroundColor: Colors.bg } }} />
          <Stack.Screen name="index" options={{ contentStyle: { paddingTop: 0 } }} />
          <Stack.Screen name="login" options={{ contentStyle: { paddingTop: 0 } }} />
        </Stack>
        {/* Sekme dışı ekranlarda her an görünen geri + ana sayfa */}
        <GeriEv />
        {/* Ülkesi eksik mevcut kullanıcılar için geri doldurma (engellemez) */}
        <CountryBackfillPrompt />
      </AuthProvider>
    </ErrorBoundary>
  );
}
