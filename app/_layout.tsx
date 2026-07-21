import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { isFirstRun } from "../lib/firstRun";

function AuthGuard() {
  const { user, loading } = useAuth();
  const router   = useRouter();
  const segments = useSegments();

  const [firstRunChecked, setFirstRunChecked] = useState(false);
  const [firstRun, setFirstRun]               = useState(false);

  useEffect(() => {
    isFirstRun().then((v) => {
      setFirstRun(v);
      setFirstRunChecked(true);
    });
  }, []);

  useEffect(() => {
    if (loading || !firstRunChecked) return;

    const inLogin   = segments[0] === "login";
    const inWelcome = segments.length === 0 || segments[0] === "index";

    if (!user && !inLogin) {
      router.replace("/login");
    } else if (user && inLogin) {
      // İlk giriş → onboarding; dönüş → direkt live
      router.replace(firstRun ? "/" : "/(tabs)/live");
    }
    // user + welcome → WelcomeScreen handle eder
    // user + tabs   → dokunma
  }, [user, loading, segments, firstRunChecked, firstRun]);

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
