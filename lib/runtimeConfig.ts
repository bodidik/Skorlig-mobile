import { useCallback, useEffect, useMemo, useState } from "react";
import Constants from "expo-constants";

/**
 * API_BASE çözümleme stratejisi:
 * 1) EXPO_PUBLIC_API_BASE
 * 2) app.json / app.config extra.apiBase
 * 3) Expo debuggerHost/hostUri içinden LAN IP yakala -> http://<ip>:4102
 * 4) localhost fallback
 */
function resolveApiBase(): string {
  const extraBase =
    (Constants?.expoConfig?.extra?.apiBase as string) ||
    (Constants as any)?.manifest?.extra?.apiBase;

  const envBase = process.env.EXPO_PUBLIC_API_BASE;

  const pick = (x?: string | null) => (x && String(x).trim() ? String(x).trim() : "");

  const a = pick(envBase);
  if (a) return a;

  const b = pick(extraBase);
  if (b) return b;

  // Expo host bilgisi (dev)
  const dbg =
    (Constants as any)?.expoConfig?.hostUri ||
    (Constants as any)?.manifest2?.extra?.expoClient?.hostUri ||
    (Constants as any)?.manifest?.debuggerHost ||
    (Constants as any)?.manifest2?.extra?.expoClient?.debuggerHost ||
    "";

  // debuggerHost formatı genelde: "192.168.0.26:19000"
  const host = String(dbg || "");
  const ip = host.split(":")[0]?.trim();
  if (ip && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    return `http://${ip}:4102`;
  }

  // Son çare
  return "http://localhost:4102";
}

export const API_BASE = resolveApiBase();

/** Backend runtime-mode yapısı ile uyumlu tip */
export type RuntimeMode = {
  profile: string; // DEV_4_TEAMS | TR_30_TEAMS | GLOBAL_100_TEAMS | GLOBAL_456_TEAMS | ...
  maxTeams?: number | null;
  maxLeagues?: number | null;
  notes?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
  [key: string]: any;
};

export type FeaturesConfig = {
  mode?: "GS_ONLY" | "MULTI_LEAGUE" | string;
  showProfile?: boolean;
  showLeaderboard?: boolean;
  enableCoupons?: boolean;
  [key: string]: any;
};

export type ScoringConfig = {
  startBalance?: number;
  useProbabilityEngine?: boolean;
  K_outcome?: number;
  epsilon?: number;
  unknownPenaltyPct?: number;
  [key: string]: any;
};

export type ApiConfigPayload = {
  ok: boolean;
  config?: {
    features?: FeaturesConfig;
    scoring?: ScoringConfig;
  };
  // bazı eski sürümlerde root'a da koymuş olabilirsin:
  features?: FeaturesConfig;
  scoring?: ScoringConfig;

  runtimeMode?: RuntimeMode | null;
  from?: string;
  [key: string]: any;
};

export type RuntimeStage =
  | {
      profile: string;
      maxTeams: number | null;
      maxLeagues: number | null;
      label: string;
      level: "DEV" | "TR" | "GLOBAL_LIGHT" | "GLOBAL_FULL" | "CUSTOM";
    }
  | null;

export type RuntimeConfigState = {
  loading: boolean;
  error: string | null;

  features: FeaturesConfig;
  scoring: ScoringConfig;

  runtimeMode: RuntimeMode | null;
  stage: RuntimeStage;

  reload: () => void;
};

export function mapRuntimeStage(mode: RuntimeMode | null | undefined): RuntimeStage {
  if (!mode) return null;

  const profile = String(mode.profile || "").toUpperCase();
  const maxTeams = typeof mode.maxTeams === "number" ? mode.maxTeams : null;
  const maxLeagues = typeof mode.maxLeagues === "number" ? mode.maxLeagues : null;

  if (profile === "DEV_4_TEAMS") {
    return {
      profile,
      maxTeams: maxTeams ?? 4,
      maxLeagues: maxLeagues ?? 1,
      label: "4 takımlı geliştirme modu",
      level: "DEV",
    };
  }
  if (profile === "TR_30_TEAMS") {
    return {
      profile,
      maxTeams: maxTeams ?? 30,
      maxLeagues: maxLeagues ?? 1,
      label: "Türkiye ligi testi (≈30 takım)",
      level: "TR",
    };
  }
  if (profile === "GLOBAL_100_TEAMS") {
    return {
      profile,
      maxTeams: maxTeams ?? 100,
      maxLeagues: maxLeagues ?? 5,
      label: "Kısıtlı global test modu (≈100 takım)",
      level: "GLOBAL_LIGHT",
    };
  }
  if (profile === "GLOBAL_456_TEAMS") {
    return {
      profile,
      maxTeams: maxTeams ?? 456,
      maxLeagues: maxLeagues ?? 20,
      label: "Tam global yüksek yük modu",
      level: "GLOBAL_FULL",
    };
  }

  return {
    profile,
    maxTeams,
    maxLeagues,
    label: mode.notes || `Custom profil: ${profile}`,
    level: "CUSTOM",
  };
}

export function useRuntimeConfig(): RuntimeConfigState {
  const defaultFeatures: FeaturesConfig = useMemo(
    () => ({
      mode: "GS_ONLY",
      showProfile: true,
      showLeaderboard: true,
      enableCoupons: false,
    }),
    []
  );

  const defaultScoring: ScoringConfig = useMemo(
    () => ({
      startBalance: 500,
      useProbabilityEngine: false,
      K_outcome: 3,
      epsilon: 0.05,
      unknownPenaltyPct: 0.1,
    }),
    []
  );

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [features, setFeatures] = useState<FeaturesConfig>(defaultFeatures);
  const [scoring, setScoring] = useState<ScoringConfig>(defaultScoring);

  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode | null>(null);
  const [stage, setStage] = useState<RuntimeStage>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/config`);
      const j = (await res.json()) as ApiConfigPayload;

      if (!res.ok || !j?.ok) {
        setError(j && (j as any)?.error ? String((j as any).error) : "CONFIG_NOT_OK");
        setFeatures(defaultFeatures);
        setScoring(defaultScoring);
        setRuntimeMode(null);
        setStage(null);
        return;
      }

      const f =
        (j.config?.features as FeaturesConfig) ||
        (j.features as FeaturesConfig) ||
        {};

      const s =
        (j.config?.scoring as ScoringConfig) ||
        (j.scoring as ScoringConfig) ||
        {};

      const rm = (j.runtimeMode as RuntimeMode) || null;

      const nextFeatures = { ...defaultFeatures, ...f };
      const nextScoring = { ...defaultScoring, ...s };

      setFeatures(nextFeatures);
      setScoring(nextScoring);

      setRuntimeMode(rm);
      setStage(mapRuntimeStage(rm));
      setError(null);
    } catch (e: any) {
      setError(String(e?.message || e || "CONFIG_FETCH_FAILED"));
      setFeatures(defaultFeatures);
      setScoring(defaultScoring);
      setRuntimeMode(null);
      setStage(null);
    } finally {
      setLoading(false);
    }
  }, [defaultFeatures, defaultScoring]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  return {
    loading,
    error,
    features,
    scoring,
    runtimeMode,
    stage,
    reload: load,
  };
}
