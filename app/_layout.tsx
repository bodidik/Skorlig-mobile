import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect, useRef, useState } from "react";
import * as Notifications from "expo-notifications";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { isFirstRun } from "../lib/firstRun";
import { configureNotificationHandler, registerForPush } from "../lib/push";

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
  const pushDone = useRef(false);

  useEffect(() => {
    isFirstRun().then((v) => {
      setFirstRun(v);
      setFirstRunChecked(true);
    });
  }, []);

  useEffect(() => {
    if (loading || !firstRunChecked) return;

    const inLogin = segments[0] === "login";

    if (!user && !inLogin) {
      router.replace("/login");
    } else if (user && inLogin) {
      // İlk giriş → onboarding; dönüş → direkt live
      router.replace(firstRun ? "/" : "/(tabs)/live");
    }
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
    </AuthProvider>
  );
}
