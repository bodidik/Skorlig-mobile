import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import * as Notifications from "expo-notifications";
import * as Linking from "expo-linking";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { isFirstRun } from "../lib/firstRun";
import { configureNotificationHandler, registerForPush } from "../lib/push";
import { flushPendingCountry } from "../lib/pendingCountry";
import CountryBackfillPrompt from "../components/CountryBackfillPrompt";
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
      return "/(tabs)/arena";
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
  }, [user]);

  // Onboarding'de seçilen ülke oturum yokken gönderilememiş olabilir —
  // kimlik oturur oturmaz gönder. Başarısızsa kayıt durur, sonraki açılışta
  // tekrar denenir.
  useEffect(() => {
    if (!user || countryDone.current) return;
    countryDone.current = true;
    flushPendingCountry();
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
          "Davet kabul edildi 🎉",
          r.reward
            ? `Arkadaşınla bağlandınız, ikinize de +${r.reward} LC eklendi.`
            : "Arkadaşınla bağlandınız."
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
  return (
    <AuthProvider>
      <AuthGuard />
      <Stack screenOptions={{ headerShown: false }} />
      {/* Ülkesi eksik mevcut kullanıcılar için geri doldurma (engellemez) */}
      <CountryBackfillPrompt />
    </AuthProvider>
  );
}
