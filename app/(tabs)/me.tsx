import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { hataMesaji } from "../../lib/hataMesaji";
import { t, useLang } from "../../lib/i18n";
import { ulkeAdi } from "../../lib/ulkeler";
import { useUserId } from "../../lib/useUserId";
import { useAuth } from "../../contexts/AuthContext";
import Colors, { on } from "../../constants/colors";
import { getApiBase } from "../../lib/apiBase";
import { getAuthHeaders, apiFetch as sharedApiFetch } from "../../lib/apiFetch";
import { getAdminToken, setAdminToken, withAdminHeaders } from "../../lib/adminToken";
import Constants from "expo-constants";
import { getRank, getNextRank, rankProgress, getUnlocked, ACHIEVEMENTS, type AchCtx } from "../../lib/ranks";
import {
  getPushPrefs, setPushPrefs, registerForPush,
  DEFAULT_PREFS as DEFAULT_PUSH_PREFS, type PushPrefs,
} from "../../lib/push";
import { shareInvite as shareInviteLink } from "../../lib/share";
import { sortCountries } from "../../lib/countrySort";

/* ========= Types ========= */
// `is1987` api/routes/users.cjs profil yanıtında dönüyor (1987 segmenti).
type Profile = { nickname?: string | null; mainTeam: string | null; country?: string | null; totals: number; is1987?: boolean };
type CountryOpt = { country: string; flag: string };
type MiniWin = { id: string; name: string; finishedAt: string; rewardLc: number; shared?: boolean };
type Group = { id?: string; name: string; members?: any[] };
type TotRow = {
  userId: string;
  totalPoints: number;
  totalPenalty: number;
  matches: number;
  lastAt?: string;
};
type FriendRow = {
  userId: string;
  name?: string;
  totalPoints?: number;
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
type WalletRegen = {
  active: boolean;
  cap: number;
  amountPerTick: number;
  intervalHours: number;
  nextAt?: string | null;
};
type WalletMonthly = { amount: number; active: boolean; grantedThisMonth: boolean; nextRenewal?: string };
type WalletSummary = {
  user: WalletUser;
  daily: WalletDaily;
  pricing?: WalletPricing | null;
  regen?: WalletRegen | null;
  premium?: boolean;
  premiumMonthly?: WalletMonthly | null;
  updatedAt?: string | null;
};
type StorePkg = { id: string; lc: number; priceTRY: number; label: string; popular?: boolean; emergency?: boolean };

type PendingResp = { ok: boolean; count?: number; items?: any[]; error?: string };

/* ========= Expo extra ========= */
const EXTRA: any =
  (Constants as any)?.expoConfig?.extra ||
  (Constants as any)?.manifest?.extra ||
  (Constants as any)?.manifest2?.extra ||
  {};

// Admin token artık pakete gömülmüyor; cihazda saklanır (lib/adminToken.ts).

// Admin userId listesi (opsiyonel):
// ENV: EXPO_PUBLIC_ADMIN_USERIDS="demo1,admin,uzay1999"
const ADMIN_USERIDS_RAW = EXTRA?.adminUserIds || process.env.EXPO_PUBLIC_ADMIN_USERIDS || "";

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

// Koda gömülü admin UID'leri (app.json/.env cache sorununu bypass eder)
const BUILTIN_ADMIN_UIDS = [
  "admin",
  "demo_admin",
  "demo1",
  "xxhsfvm1sfyn3kuyadmgraukpp53", // hucigo11@gmail.com
];

function isAdminUser(userId: string) {
  const u = String(userId || "").trim().toLowerCase();
  if (!u) return false;

  // hızlı varsayılanlar (istersen sil)
  if (BUILTIN_ADMIN_UIDS.includes(u)) return true;

  const list = String(ADMIN_USERIDS_RAW || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

  if (list.length && list.includes(u)) return true;

  return false;
}

export default function Me() {
  const { userId: qUser } = useLocalSearchParams<{ userId?: string }>();
  const userId = useUserId(qUser);
  const nav = useRouter();
  const { user, logout } = useAuth();
  useLang(); // dil değişince ekran yeniden çizilsin

  const onLogout = useCallback(() => {
    Alert.alert(t("logoutTitle"), t("logoutConfirm"), [
      { text: t("dismiss"), style: "cancel" },
      {
        text: t("logoutDo"),
        style: "destructive",
        onPress: async () => {
          try {
            await logout();
            nav.replace("/login");
          } catch (e: any) {
            Alert.alert(t("error"), e?.message || t("logoutFailed"));
          }
        },
      },
    ]);
  }, [logout, nav]);

  const isAdminLocal = useMemo(() => isAdminUser(userId), [userId]);

  // Remote admin truth
  const [isAdminRemote, setIsAdminRemote] = useState<boolean>(false);
  const [isAdminRemoteLoading, setIsAdminRemoteLoading] = useState<boolean>(false);

  // UI effective admin
  const effectiveIsAdmin = useMemo(() => isAdminRemote || isAdminLocal, [isAdminRemote, isAdminLocal]);

  // Admin token (cihazda saklanır)
  const [adminTokenInput, setAdminTokenInput] = useState("");
  const [tokenReady, setTokenReady] = useState(false);

  useEffect(() => {
    (async () => {
      const t = await getAdminToken();
      setTokenReady(t.length > 0);
      setAdminTokenInput(t);
    })();
  }, []);

  const saveAdminToken = useCallback(async () => {
    await setAdminToken(adminTokenInput);
    const tok = await getAdminToken(); // eski adi t idi, i18n t() golgeleniyordu
    setTokenReady(tok.length > 0);
    Alert.alert("Admin token", tok ? t("savedTitle") : t("noteDeleted"));
  }, [adminTokenInput]);

  // ⚠️ BU BLOK YUKARI TAŞINDI — aşağıdaydı ve gerçek bir çökme üretiyordu.
  // `banUser` useCallback'inin BAĞIMLILIK DİZİSİ (`[banInput, banReason, ...]`)
  // render sırasında değerlendirilir; state tanımları callback'ten SONRA
  // geldiği için `const` geçici ölü bölgesine (TDZ) düşüyor ve Me ekranı
  // her render'da `ReferenceError: Cannot access 'banInput' before
  // initialization` atıyordu. Callback GÖVDESİ sonra çalıştığı için sorun
  // gövdede değil, dizide. Aynı sınıf hata settle2'de de yakalanmıştı.
  // Ban yönetimi
  const [banInput, setBanInput]         = useState("");
  const [banReason, setBanReason]       = useState("");
  const [banBusy, setBanBusy]           = useState(false);
  const [banMsg, setBanMsg]             = useState<string | null>(null);
  const [bannedList, setBannedList]     = useState<{userId:string;reason:string|null;bannedAt:string}[]>([]);
  const [bannedLoading, setBannedLoading] = useState(false);

  const loadBannedList = useCallback(async () => {
    setBannedLoading(true);
    try {
      const base = await getApiBase();
      const tok  = await getAdminToken();
      const r    = await fetch(`${base}/api/admin/banned`, { headers: { "x-admin-token": tok } });
      const j    = await r.json();
      if (j?.ok) setBannedList(j.items ?? []);
    } catch {}
    setBannedLoading(false);
  }, []);

  const banUser = useCallback(async () => {
    const uid = banInput.trim();
    if (!uid) return;
    setBanBusy(true);
    setBanMsg(null);
    try {
      const base = await getApiBase();
      const tok  = await getAdminToken();
      const r    = await fetch(`${base}/api/admin/ban`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": tok },
        body: JSON.stringify({ userId: uid, reason: banReason.trim() || null }),
      });
      const j = await r.json();
      if (j?.ok) {
        setBanMsg(j.already ? t("alreadyBanned") : t("bannedOk", { u: uid }));
        setBanInput("");
        setBanReason("");
        loadBannedList();
      } else {
        setBanMsg(`Hata: ${j.error}`);
      }
    } catch (e: any) { setBanMsg(e.message); }
    setBanBusy(false);
  }, [banInput, banReason, loadBannedList]);

  const unbanUser = useCallback(async (uid: string) => {
    try {
      const base = await getApiBase();
      const tok  = await getAdminToken();
      await fetch(`${base}/api/admin/unban`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": tok },
        body: JSON.stringify({ userId: uid }),
      });
      loadBannedList();
    } catch {}
  }, [loadBannedList]);


  const [profile, setProfile] = useState<Profile | null>(null);
  const [teamInput, setTeamInput] = useState("");

  // Görünen kullanıcı adı (nickname)
  const [nicknameInput, setNicknameInput] = useState("");
  const [nicknameSaving, setNicknameSaving] = useState(false);
  const [countries, setCountries] = useState<CountryOpt[]>([]);

  // Zengin ülke + takım seçici
  type RichCountry = { code: string; name: string; localName: string; flag: string; lang: string; topLeague: string };
  const [richCountries, setRichCountries]   = useState<RichCountry[]>([]);
  const [countryTeams, setCountryTeams]     = useState<string[]>([]);
  const [teamsLoading, setTeamsLoading]     = useState(false);
  const [teamSearch, setTeamSearch]         = useState("");
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(null);
  const [countrySaving, setCountrySaving] = useState(false);

  // Türkiye başta + tr-alfabetik. Sunucu sırası deterministik değil, listenin
  // her yenilenişinde göze çarpan sallama olmasın diye burada sabitliyoruz.
  const sortedRichCountries = useMemo(
    () => sortCountries(richCountries, (c) => c.localName || c.name),
    [richCountries]
  );

  // Ek lig seçici
  const [preferredLeagues, setPreferredLeagues] = useState<string[]>([]);
  const [leagueSaving, setLeagueSaving]         = useState(false);

  // Dil tercihi
  const [preferredLang, setPreferredLang]   = useState<string | null>(null);
  const [langSaving, setLangSaving]         = useState(false);

  // Bildirim tercihleri
  const [pushPrefs, setPushPrefsState]  = useState<PushPrefs>(DEFAULT_PUSH_PREFS);
  const [pushDevices, setPushDevices]   = useState(0);
  const [pushLoading, setPushLoading]   = useState(true);
  const [pushSavingKey, setPushSavingKey] = useState<keyof PushPrefs | null>(null);
  const [miniWins, setMiniWins] = useState<MiniWin[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [totalsRow, setTotalsRow] = useState<TotRow | null>(null);

  const [friendItems, setFriendItems] = useState<FriendRow[]>([]);
  const [friendTarget, setFriendTarget] = useState("");

  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);

  // Davet sistemi
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteInputCode, setInviteInputCode] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [storePkgs, setStorePkgs] = useState<StorePkg[]>([]);
  const [storeMode, setStoreMode] = useState<string>("disabled");
  const [buying, setBuying] = useState<string | null>(null);

  const [predCount, setPredCount] = useState<number | null>(null);

  // Streak verisi (başarımlar için)
  const [streakData, setStreakData] = useState<{
    seriesCount: number; seriesCumOdds: number; activeSeries: boolean;
    bestSeries: number; currentTier: { label: string } | null;
  } | null>(null);

  const [showBanPanel, setShowBanPanel] = useState(false);
  const [predCountLoading, setPredCountLoading] = useState(false);

  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [pendingLoading, setPendingLoading] = useState(false);

  const loadIsAdmin = useCallback(async (uid: string) => {
    try {
      setIsAdminRemoteLoading(true);
      const r = await apiFetch(`/api/admin/is-admin?userId=${encodeURIComponent(uid)}`);
      const j = await r.json();
      const ok = !!(j?.ok && j.isAdmin);
      setIsAdminRemote(ok);
      return ok;
    } catch {
      setIsAdminRemote(false);
      return false;
    } finally {
      setIsAdminRemoteLoading(false);
    }
  }, []);

  const loadWalletSummary = useCallback(async (uid: string) => {
    try {
      setWalletLoading(true);
      const r = await apiFetch(`/api/rt/lc-wallet/summary?userId=${encodeURIComponent(uid)}`).then((x) => x.json());

      if (r?.ok && r.user && r.daily) {
        const summary: WalletSummary = {
          user: r.user as WalletUser,
          daily: r.daily as WalletDaily,
          pricing: r.pricing || null,
          updatedAt: r.updatedAt || null,
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
  }, []);

  const loadInviteCode = useCallback(async (uid: string) => {
    try {
      const r = await apiFetch(`/api/friends/invite-code?userId=${encodeURIComponent(uid)}`).then((x) => x.json());
      if (r?.ok) setInviteCode(r.inviteCode);
    } catch {}
  }, []);

  const useInviteCode = useCallback(async () => {
    const code = inviteInputCode.trim().toUpperCase();
    const uid = userId.trim();
    if (!code || !uid) return;
    setInviteBusy(true);
    try {
      const r = await apiFetch("/api/friends/use-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid, code }),
      }).then((x) => x.json());
      if (r?.ok) {
        setInviteInputCode("");
        Alert.alert("SkorLig 🎉", r.message || t("friendAdded"));
        await loadWalletSummary(uid);
      } else {
        const msg = r?.error === "INVALID_CODE" ? t("invalidInvite")
          : r?.error === "CANNOT_USE_OWN_CODE" ? t("ownInvite")
          : r?.error || t("inviteFailed");
        Alert.alert(t("error"), msg);
      }
    } catch (e: any) {
      Alert.alert(t("error"), String(e?.message || e));
    } finally {
      setInviteBusy(false);
    }
  }, [inviteInputCode, userId, loadWalletSummary]);

  // Paylaşım metinleri lib/share.ts'te — derin bağlantı ve davet kodu
  // orada tek yerden ekleniyor (bkz. viral döngü notu).
  const shareInvite = useCallback(async () => {
    if (!userId) return;
    await shareInviteLink(userId);
  }, [userId]);

  const loadPredCount = useCallback(async (uid: string) => {
    try {
      setPredCountLoading(true);
      const r = await apiFetch(`/api/pred/flags?userId=${encodeURIComponent(uid)}`).then((res) => res.json());

      if (r?.ok) {
        const countFromResp =
          typeof r.count === "number" ? r.count : Array.isArray(r.fixtures) ? r.fixtures.length : 0;
        setPredCount(countFromResp);
      } else {
        setPredCount(null);
      }
    } catch {
      setPredCount(null);
    } finally {
      setPredCountLoading(false);
    }
  }, []);

  const loadPendingCountIfAdmin = useCallback(async (isAdminEffective: boolean) => {
    if (!isAdminEffective) {
      setPendingCount(null);
      setPendingLoading(false);
      return;
    }

    try {
      setPendingLoading(true);

      const headers: Record<string, string> = await withAdminHeaders({});

      const res = await apiFetch(`/api/admin/results/pending`, { headers });
      const j: PendingResp = await res.json();

      if (res.ok && j?.ok) {
        const c = typeof j.count === "number" ? j.count : Array.isArray(j.items) ? j.items.length : 0;
        setPendingCount(c);
      } else {
        setPendingCount(null);
      }
    } catch {
      setPendingCount(null);
    } finally {
      setPendingLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const remote = await loadIsAdmin(userId);
      const isEff = remote || isAdminLocal;

      const p = await apiFetch(`/api/users/profile?userId=${encodeURIComponent(userId)}`).then((r) => r.json());
      if (p?.ok) {
        setProfile(p.profile);
        if (p.profile?.mainTeam) setTeamInput(p.profile.mainTeam);
        setNicknameInput(p.profile?.nickname || "");
        if (Array.isArray(p.profile?.preferredLeagues)) setPreferredLeagues(p.profile.preferredLeagues);
        if (p.profile?.preferredLang) setPreferredLang(p.profile.preferredLang);
      } else {
        setProfile(null);
      }

      const g = await apiFetch(`/api/users/groups/list?userId=${encodeURIComponent(userId)}`).then((r) => r.json());
      setGroups(g?.ok ? g.items || [] : []);

      try {
        // ⚠️ `userId` ŞART. Onsuz sunucu TÜM sıralamayı gönderiyordu (1707 satır
        // / 182 KB) ve biz aşağıda tek satırımızı arayıp gerisini atıyorduk.
        // Sunucu zaten süzebiliyor (profile/[userId].tsx böyle çağırıyordu):
        // 182 KB → 167 bayt. `.find()` tek elemanlı listede de çalışır.
        const t = await apiFetch(
          `/api/rt/totals?userId=${encodeURIComponent(userId)}`
        ).then((r) => r.json());
        if (t?.ok && Array.isArray(t.items)) {
          const mine = (t.items as TotRow[]).find(
            (row) => String(row.userId || "").toLowerCase() === userId.toLowerCase()
          );
          setTotalsRow(mine || null);
        } else {
          setTotalsRow(null);
        }
      } catch {
        setTotalsRow(null);
      }

      try {
        const f = await apiFetch(`/api/friends/board/${encodeURIComponent(userId)}`).then((r) => r.json());
        setFriendItems(f?.ok && Array.isArray(f.items) ? (f.items as FriendRow[]) : []);
      } catch {
        setFriendItems([]);
      }

      await loadWalletSummary(userId);
      await loadPredCount(userId);
      loadInviteCode(userId);

      // Streak verisi (başarımlar + seri rozeti)
      try {
        const sr = await apiFetch(`/api/live/streak?userId=${encodeURIComponent(userId)}`).then(x => x.json());
        if (sr?.ok) setStreakData({
          seriesCount: sr.seriesCount ?? 0, seriesCumOdds: sr.seriesCumOdds ?? 0,
          activeSeries: sr.activeSeries ?? false, bestSeries: sr.bestSeries ?? 0,
          currentTier: sr.currentTier ?? null,
        });
      } catch { setStreakData(null); }

      await loadPendingCountIfAdmin(isEff);
    } catch (e: any) {
      Alert.alert(t("error"), String(e?.message || e));
    }
  }, [userId, isAdminLocal, loadIsAdmin, loadWalletSummary, loadPredCount, loadPendingCountIfAdmin, loadInviteCode]);

  useEffect(() => {
    load();
  }, [load]);

  // Desteklenen ülke listesi (yerel görünüm seçici için)
  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch(`/api/live2/countries`).then((x) => x.json());
        setCountries(r?.ok && Array.isArray(r.countries) ? r.countries : []);
      } catch {
        setCountries([]);
      }
    })();
  }, []);

  // Zengin ülke + takım listesi (yeni seçici)
  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch(`/api/teams/countries`).then(x => x.json());
        setRichCountries(r?.ok && Array.isArray(r.items) ? r.items : []);
      } catch {
        setRichCountries([]);
      }
    })();
  }, []);

  // Profil yüklenince ülkeye ait takımları önceden doldur
  useEffect(() => {
    if (profile?.country && !countryTeams.length) {
      setSelectedCountryCode(profile.country);
      (async () => {
        setTeamsLoading(true);
        try {
          const r = await apiFetch(`/api/teams/by-country?country=${profile.country}`).then(x => x.json());
          setCountryTeams(r?.teams || []);
        } catch {}
        setTeamsLoading(false);
      })();
    }
  }, [profile?.country]);

  // LC mağazası paketleri
  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch(`/api/rt/lc-wallet/store`).then((x) => x.json());
        setStorePkgs(r?.ok && Array.isArray(r.packages) ? r.packages : []);
        setStoreMode(String(r?.mode || "disabled"));
      } catch {
        setStorePkgs([]);
      }
    })();
  }, []);

  async function buyPackage(pkg: StorePkg) {
    Alert.alert(
      t("buyLcTitle"),
      `${pkg.label}: ${pkg.lc} LC — ₺${pkg.priceTRY}${storeMode === "mock" ? "\n\n" + t("buyMockNote") : ""}`,
      [
        { text: t("dismiss"), style: "cancel" },
        {
          text: t("buy"),
          onPress: async () => {
            try {
              setBuying(pkg.id);
              const r = await apiFetch(`/api/rt/lc-wallet/purchase`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId, packageId: pkg.id }),
              }).then((x) => x.json());
              if (r?.ok) {
                Alert.alert("SkorLig", t("lcLoaded", { lc: pkg.lc, bal: r.newBalance }));
                await loadWalletSummary(userId);
              } else {
                Alert.alert("SkorLig", r?.detail || r?.error || t("buyFailed"));
              }
            } catch (e: any) {
              Alert.alert(t("error"), String(e?.message || e));
            } finally {
              setBuying(null);
            }
          },
        },
      ]
    );
  }

  // Kazanılan mini turnuvalar (vitrin)
  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch(`/api/mini/wins?userId=${encodeURIComponent(userId)}`).then((x) => x.json());
        setMiniWins(r?.ok && Array.isArray(r.items) ? r.items : []);
      } catch {
        setMiniWins([]);
      }
    })();
  }, [userId]);

  async function saveCountry(country: string) {
    try {
      setCountrySaving(true);
      const r = await apiFetch(`/api/users/set-country`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, country }),
      }).then((x) => x.json());
      if (r?.ok) {
        Alert.alert("SkorLig", t("countrySet", { c: country }));
        load();
      } else {
        Alert.alert(t("error"), hataMesaji(r?.error));
      }
    } catch (e: any) {
      Alert.alert(t("error"), String(e?.message || e));
    } finally {
      setCountrySaving(false);
    }
  }

  async function saveNickname() {
    const nick = nicknameInput.trim();
    if (nick.length < 2) {
      Alert.alert("SkorLig", t("nickMin"));
      return;
    }
    try {
      setNicknameSaving(true);
      const r = await apiFetch(`/api/users/set-nickname`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: nick }),
      }).then((x) => x.json());
      if (r?.ok) {
        setProfile((prev) => (prev ? { ...prev, nickname: r.nickname } : prev));
        Alert.alert("SkorLig", t("nickSaved"));
      } else {
        const msg =
          r?.error === "NICKNAME_TAKEN" ? t("nickTaken")
          : r?.error === "NICKNAME_RESERVED" ? t("nickReserved")
          : r?.error === "NICKNAME_LENGTH" ? t("nickLength")
          : r?.error === "NICKNAME_INVALID" ? t("nickInvalid")
          : r?.detail || r?.error || t("saveFailed");
        Alert.alert(t("error"), msg);
      }
    } catch (e: any) {
      Alert.alert(t("error"), String(e?.message || e));
    } finally {
      setNicknameSaving(false);
    }
  }

  async function saveMainTeam() {
    try {
      const r = await apiFetch(`/api/users/set-main-team`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, team: teamInput.trim() }),
      }).then((r) => r.json());
      if (r?.ok) {
        Alert.alert("SkorLig", t("mainTeamSaved"));
        load();
      } else Alert.alert(t("error"), hataMesaji(r?.error));
    } catch (e: any) {
      Alert.alert(t("error"), String(e?.message || e));
    }
  }

  async function saveTeamAndCountry(team: string, countryCode: string) {
    try {
      setCountrySaving(true);
      const [r1, r2] = await Promise.all([
        apiFetch(`/api/users/set-main-team`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, team }),
        }).then(x => x.json()),
        apiFetch(`/api/users/set-country`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, country: countryCode }),
        }).then(x => x.json()),
      ]);
      if (r1?.ok && r2?.ok) {
        setTeamInput(team);
        Alert.alert("SkorLig", t("teamCountrySaved", { team, c: countryCode }));
        load();
      } else {
        Alert.alert(t("error"), r1?.error || r2?.error || "SAVE_FAILED");
      }
    } catch (e: any) {
      Alert.alert(t("error"), String(e?.message || e));
    } finally {
      setCountrySaving(false);
    }
  }

  async function saveLeagues(leagues: string[]) {
    try {
      setLeagueSaving(true);
      const r = await apiFetch(`/api/users/set-leagues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagues }),
      }).then(x => x.json());
      if (r?.ok) {
        setPreferredLeagues(r.leagues || leagues);
        Alert.alert("SkorLig", t("leaguesSaved"));
      } else Alert.alert(t("error"), hataMesaji(r?.error));
    } catch (e: any) {
      Alert.alert(t("error"), String(e?.message || e));
    } finally {
      setLeagueSaving(false);
    }
  }

  async function saveLang(lang: string) {
    try {
      setLangSaving(true);
      const r = await apiFetch(`/api/users/set-lang`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang }),
      }).then(x => x.json());
      if (r?.ok) {
        setPreferredLang(lang);
        const { setLang } = require("../../lib/i18n");
        setLang(lang);
        Alert.alert("SkorLig", t("langSaved"));
      } else Alert.alert(t("error"), hataMesaji(r?.error));
    } catch (e: any) {
      Alert.alert(t("error"), String(e?.message || e));
    } finally {
      setLangSaving(false);
    }
  }

  // Bildirim tercihlerini sunucudan çek
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { prefs, deviceCount } = await getPushPrefs();
        if (!alive) return;
        setPushPrefsState(prefs);
        setPushDevices(deviceCount);
      } finally {
        if (alive) setPushLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [userId]);

  async function togglePushPref(key: keyof PushPrefs) {
    const next = { ...pushPrefs, [key]: !pushPrefs[key] };
    setPushPrefsState(next);           // iyimser güncelleme — anahtar anında dönsün
    setPushSavingKey(key);
    try {
      const ok = await setPushPrefs({ [key]: next[key] });
      if (!ok) {
        setPushPrefsState(pushPrefs);  // sunucu reddetti, geri al
        Alert.alert(t("error"), t("pushPrefFailed"));
      }
    } finally {
      setPushSavingKey(null);
    }
  }

  // Cihaz kayıtlı değilse izin akışını tekrar başlat
  async function enablePushOnDevice() {
    setPushLoading(true);
    const token = await registerForPush();
    if (token) {
      const { prefs, deviceCount } = await getPushPrefs();
      setPushPrefsState(prefs);
      setPushDevices(deviceCount);
    } else {
      Alert.alert(t("pushPermTitle"), t("pushPermMsg"));
    }
    setPushLoading(false);
  }

  async function createGroup() {
    try {
      const name = "Grubum " + Math.random().toString(36).slice(2, 6);
      const r = await apiFetch(`/api/users/groups/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: userId, name }),
      }).then((r) => r.json());
      if (r?.ok) {
        Alert.alert("SkorLig", t("groupCreated"));
        load();
      }
    } catch (e: any) {
      Alert.alert(t("error"), String(e?.message || e));
    }
  }

  async function sendFriendRequest() {
    const toId = friendTarget.trim();
    if (!toId) {
      Alert.alert("SkorLig", t("friendFirstWrite"));
      return;
    }
    if (toId.toLowerCase() === userId.toLowerCase()) {
      Alert.alert("SkorLig", t("friendSelf"));
      return;
    }

    try {
      const r = await apiFetch(`/api/friends/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromUserId: userId, toUserId: toId }),
      }).then((x) => x.json());

      if (r?.ok) {
        Alert.alert("SkorLig", t("friendReqSent"));
        setFriendTarget("");
        load();
      } else {
        Alert.alert(t("error"), hataMesaji(r?.error));
      }
    } catch (e: any) {
      Alert.alert(t("error"), String(e?.message || e));
    }
  }

  async function claimDaily() {
    if (!userId) return;
    try {
      setClaiming(true);
      const r = await apiFetch(`/api/rt/lc-wallet/daily-claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      }).then((x) => x.json());

      if (r?.ok) {
        const gained = r.daily?.amount ?? 0;
        Alert.alert("SkorLig", t("dailyAdded", { n: gained }));
        await loadWalletSummary(userId);
        await loadPredCount(userId);
        await loadPendingCountIfAdmin(effectiveIsAdmin);
      } else {
        const code = r?.error || "DAILY_CLAIM_FAILED";
        let msg = t("dailyUnavailable");
        if (code === "DAILY_ALREADY_CLAIMED") msg = t("dailyAlready");
        Alert.alert("SkorLig", msg);
      }
    } catch (e: any) {
      Alert.alert(t("error"), String(e?.message || e));
    } finally {
      setClaiming(false);
    }
  }

  const totalPoints = totalsRow?.totalPoints ?? (profile ? profile.totals ?? 0 : undefined);

  const myFriendRow = useMemo(
    () => friendItems.find((r) => String(r.userId || "").toLowerCase() === userId.toLowerCase()) || null,
    [friendItems, userId]
  );

  const myFriendRank = useMemo(() => {
    if (!myFriendRow) return null;
    const idx = friendItems.findIndex((r) => String(r.userId || "").toLowerCase() === userId.toLowerCase());
    return idx >= 0 ? idx + 1 : null;
  }, [friendItems, myFriendRow, userId]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <View style={{ padding: 16, gap: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: "800", color: Colors.slate900 }}>{t("myProfile")}</Text>

        {/* Google hesap kartı + çıkış */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            padding: 12,
            backgroundColor: "#0f172a",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.border,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "800", color: Colors.slate900, fontSize: 15 }} numberOfLines={1}>
              {profile?.nickname || user?.displayName || t("userFallback")}
            </Text>
            {user?.email ? (
              <Text style={{ color: Colors.muted, fontSize: 12 }} numberOfLines={1}>
                {user.email}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity
            onPress={onLogout}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: "#7f1d1d",
              backgroundColor: "#1a0606",
            }}
          >
            <Text style={{ color: "#dc2626", fontWeight: "800", fontSize: 13 }}>{t("logout")}</Text>
          </TouchableOpacity>
        </View>

        {/* Kullanıcı Adı (nickname) */}
        <View
          style={{
            padding: 12,
            backgroundColor: "#0f172a",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.border,
            gap: 8,
          }}
        >
          <Text style={{ fontWeight: "700", color: Colors.slate900 }}>{t("nickname")}</Text>
          <Text style={{ fontSize: 11, color: Colors.muted }}>
            {t("nicknameHelp")}
          </Text>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <TextInput
              value={nicknameInput}
              onChangeText={setNicknameInput}
              placeholder={t("nicknamePh")}
              placeholderTextColor={Colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: "#1f2937",
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 8,
                color: "#e5e7eb",
                fontSize: 14,
              }}
            />
            <TouchableOpacity
              onPress={saveNickname}
              disabled={nicknameSaving || nicknameInput.trim().length < 2}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 999,
                backgroundColor:
                  nicknameSaving || nicknameInput.trim().length < 2 ? "#1e293b" : Colors.primary,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "900", fontSize: 13 }}>
                {nicknameSaving ? "..." : t("save")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ✅ Admin Kartı */}
        {effectiveIsAdmin && (
          <View
            style={{
              padding: 12,
              backgroundColor: "#0f172a",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: Colors.border,
              gap: 10,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontWeight: "900", color: Colors.slate900 }}>Admin</Text>

              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: Colors.border,
                  backgroundColor: "#0f172a",
                }}
              >
                {pendingLoading ? (
                  <Text style={{ fontSize: 11, color: Colors.muted, fontWeight: "800" }}>...</Text>
                ) : (
                  <Text style={{ fontSize: 11, color: tokenReady ? Colors.live : Colors.muted, fontWeight: "900" }}>
                    Pending: {pendingCount ?? "-"}
                  </Text>
                )}
              </View>
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              <Text style={{ fontSize: 11, color: Colors.muted }}>Yetki:</Text>

              {isAdminRemoteLoading ? (
                <Text style={{ fontSize: 11, color: Colors.muted, fontWeight: "800" }}>kontrol...</Text>
              ) : (
                <>
                  <Text style={{ fontSize: 11, fontWeight: "900", color: isAdminRemote ? Colors.live : Colors.muted }}>
                    API {isAdminRemote ? "EVET" : "HAYIR"}
                  </Text>
                  <Text style={{ fontSize: 11, color: Colors.muted }}>·</Text>
                  <Text style={{ fontSize: 11, fontWeight: "900", color: isAdminLocal ? Colors.live : Colors.muted }}>
                    Local {isAdminLocal ? "EVET" : "HAYIR"}
                  </Text>
                </>
              )}
            </View>

            <Text style={{ fontSize: 11, color: Colors.muted }}>
              {t("tokenRow2", { s: tokenReady ? "OK" : t("tokenNoPost") })}
            </Text>

            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <TextInput
                value={adminTokenInput}
                onChangeText={setAdminTokenInput}
                placeholder="Admin token gir"
                placeholderTextColor={Colors.muted}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: "#1f2937",
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  color: "#e5e7eb",
                  fontSize: 12,
                }}
              />
              <TouchableOpacity
                onPress={saveAdminToken}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 999,
                  backgroundColor: Colors.primary,
                }}
              >
                <Text style={{ color: Colors.onAccent, fontWeight: "900", fontSize: 12 }}>Kaydet</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={() => nav.push("/admin")}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 999,
                  backgroundColor: Colors.primary,
                }}
              >
                <Text style={{ textAlign: "center", color: Colors.onAccent, fontWeight: "900" }}>{t("resultMgmt")}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => loadPendingCountIfAdmin(effectiveIsAdmin)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 999,
                  backgroundColor: Colors.headerBlue,
                }}
              >
                <Text style={{ textAlign: "center", color: Colors.slate900, fontWeight: "900" }}>Yenile</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={() => nav.push("/admin-live")}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 999,
                  backgroundColor: Colors.headerBlue,
                }}
              >
                <Text style={{ textAlign: "center", color: Colors.slate900, fontWeight: "900" }}>{t("liveScoreAdmin")}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => nav.push("/admin-runtime")}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 999,
                  backgroundColor: Colors.headerBlue,
                }}
              >
                <Text style={{ textAlign: "center", color: Colors.slate900, fontWeight: "900" }}>{t("runtimeFullScreen")}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => nav.push("/admin-add")}
              style={{
                paddingVertical: 12,
                borderRadius: 999,
                backgroundColor: "#16a34a",
              }}
            >
              <Text style={{ textAlign: "center", color: "#fff", fontWeight: "900" }}>{t("newMatchNote")}</Text>
            </TouchableOpacity>

            <Text style={{ fontSize: 11, color: Colors.muted }}>
              {t("adminPendingHelp")}
            </Text>

            {/* ── Kullanıcı Engelle ── */}
            <TouchableOpacity
              onPress={() => { setShowBanPanel(v => !v); if (!showBanPanel) loadBannedList(); }}
              style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#e5e7eb", marginTop: 4 }}
            >
              <Text style={{ fontWeight: "800", fontSize: 13, color: "#dc2626" }}>{t("banUserTitle")}</Text>
              <Text style={{ fontSize: 12, color: Colors.muted }}>{showBanPanel ? "▲" : "▼"}</Text>
            </TouchableOpacity>

            {showBanPanel && (
              <View style={{ gap: 8 }}>
                <TextInput
                  value={banInput}
                  onChangeText={setBanInput}
                  placeholder={t("userIdPh")}
                  placeholderTextColor={Colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{ borderWidth: 1, borderColor: "#fca5a5", borderRadius: 8,
                    paddingHorizontal: 10, paddingVertical: 8, color: "#e2e8f0", fontSize: 12 }}
                />
                <TextInput
                  value={banReason}
                  onChangeText={setBanReason}
                  placeholder={t("reasonPh")}
                  placeholderTextColor={Colors.muted}
                  style={{ borderWidth: 1, borderColor: "#1e293b", borderRadius: 8,
                    paddingHorizontal: 10, paddingVertical: 8, color: "#e2e8f0", fontSize: 12 }}
                />
                <TouchableOpacity
                  onPress={banUser}
                  disabled={banBusy || !banInput.trim()}
                  style={{ paddingVertical: 10, borderRadius: 8, alignItems: "center",
                    backgroundColor: banInput.trim() ? "#dc2626" : "#f5f5f5",
                    opacity: banBusy ? 0.6 : 1 }}
                >
                  <Text style={{ fontWeight: "900", fontSize: 13,
                    color: banInput.trim() ? "#fff" : Colors.muted }}>
                    {banBusy ? "..." : t("banBtn")}
                  </Text>
                </TouchableOpacity>

                {banMsg && (
                  <Text style={{ fontSize: 12, color: banMsg.startsWith("✅") ? "#16a34a" : "#dc2626" }}>
                    {banMsg}
                  </Text>
                )}

                {/* Engellenen liste */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: "700", color: Colors.muted }}>
                    {t("bannedListTitle", { n: bannedList.length })}
                  </Text>
                  <TouchableOpacity onPress={loadBannedList}>
                    <Text style={{ fontSize: 11, color: Colors.primary }}>
                      {bannedLoading ? "..." : t("refresh")}
                    </Text>
                  </TouchableOpacity>
                </View>

                {bannedList.map(b => (
                  <View key={b.userId} style={{ flexDirection: "row", alignItems: "center", gap: 8,
                    backgroundColor: "#1a0606", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: "#7f1d1d" }} numberOfLines={1}>
                        {b.userId}
                      </Text>
                      {b.reason && (
                        <Text style={{ fontSize: 10, color: "#b91c1c" }}>{b.reason}</Text>
                      )}
                    </View>
                    <TouchableOpacity onPress={() => unbanUser(b.userId)}
                      style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: "#7f1d1d" }}>
                      <Text style={{ fontSize: 11, fontWeight: "800", color: "#7f1d1d" }}>{t("removeBtn")}</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                {!bannedLoading && bannedList.length === 0 && (
                  <Text style={{ fontSize: 11, color: Colors.muted }}>{t("noBannedUser")}</Text>
                )}
              </View>
            )}
          </View>
        )}

        {/* Rütbe + Puan kartı */}
        {(() => {
          const pts = Number(totalPoints ?? 0);
          const rank = getRank(pts);
          const next = getNextRank(pts);
          const prog = rankProgress(pts);
          return (
            <View style={{
              padding: 14, backgroundColor: rank.bg, borderRadius: 14,
              borderWidth: 1.5, borderColor: rank.border, gap: 10,
            }}>
              {/* Rütbe başlık */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={{ fontSize: 36 }}>{rank.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: rank.color, fontWeight: "900", fontSize: 18 }}>{rank.label}</Text>
                  <Text style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>
                    {totalsRow ? t("matchesPlayed", { n: totalsRow.matches }) : ""}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontSize: 28, fontWeight: "900", color: rank.color }}>
                    {totalPoints !== undefined ? totalPoints : "—"}
                  </Text>
                  <Text style={{ color: "#64748b", fontSize: 10 }}>{t("points")}</Text>
                </View>
              </View>

              {/* İlerleme çubuğu */}
              {next && (
                <View style={{ gap: 4 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ color: "#64748b", fontSize: 10 }}>
                      {next.emoji} {next.label}: {next.minPts} {t("points")}
                    </Text>
                    <Text style={{ color: rank.color, fontSize: 10, fontWeight: "700" }}>
                      {Math.round(prog * 100)}%
                    </Text>
                  </View>
                  <View style={{ height: 6, backgroundColor: "#1e293b", borderRadius: 999 }}>
                    <View style={{
                      height: 6, borderRadius: 999, backgroundColor: rank.color,
                      width: `${Math.round(prog * 100)}%` as any,
                    }} />
                  </View>
                  <Text style={{ color: "#475569", fontSize: 10 }}>
                    {t("ptsToNext", { n: next.minPts - pts, rank: next.label })}
                  </Text>
                </View>
              )}
              {!next && (
                <Text style={{ color: rank.color, fontSize: 12, fontWeight: "700" }}>
                  {t("maxRank")}
                </Text>
              )}

              {/* Seri durumu */}
              {streakData && streakData.activeSeries && streakData.seriesCount > 0 && (
                <View style={{
                  flexDirection: "row", alignItems: "center", gap: 8,
                  backgroundColor: "#00000033", borderRadius: 10, padding: 10,
                }}>
                  <Text style={{ fontSize: 20 }}>🔥</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: streakData.currentTier ? "#fbbf24" : "#60a5fa", fontWeight: "800", fontSize: 13 }}>
                      {t("streakOf", { n: streakData.seriesCount })}
                      {streakData.currentTier ? ` · ${streakData.currentTier.label}` : ""}
                    </Text>
                    <Text style={{ color: "#475569", fontSize: 10 }}>
                      {t("bestStreak", { n: streakData.bestSeries.toFixed(1) })}
                    </Text>
                  </View>
                </View>
              )}

              {totalsRow && (
                <Text style={{ color: "#475569", fontSize: 11 }}>
                  {t("totalPenalty", { n: totalsRow.totalPenalty })}
                </Text>
              )}

              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  onPress={() => nav.push({ pathname: "/stats", params: { userId } })}
                  style={{ flex: 1, padding: 10, backgroundColor: "#1e293b", borderRadius: 10 }}
                >
                  <Text style={{ textAlign: "center", color: "#94a3b8", fontWeight: "600" }}>
                    {t("statsGeneral")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => nav.push({ pathname: "/profile/[userId]", params: { userId } } as any)}
                  style={{ flex: 1, padding: 10, backgroundColor: rank.color, borderRadius: 10 }}
                >
                  <Text style={{ textAlign: "center", color: "#fff", fontWeight: "700" }}>
                    {t("profileHistory")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })()}

        {/* Başarımlar */}
        {(() => {
          const achCtx: AchCtx = {
            matches: totalsRow?.matches ?? 0,
            totalPoints: Number(totalPoints ?? 0),
            totalEarned: wallet?.user?.totalEarned ?? 0,
            bestSeries: streakData?.bestSeries ?? 0,
            seriesCount: streakData?.seriesCount ?? 0,
            activeSeries: streakData?.activeSeries ?? false,
          };
          const unlocked = getUnlocked(achCtx);
          const locked = ACHIEVEMENTS.filter(a => !a.check(achCtx));
          if (ACHIEVEMENTS.length === 0) return null;
          return (
            <View style={{
              padding: 14, backgroundColor: "#0f172a", borderRadius: 14,
              borderWidth: 1, borderColor: Colors.border, gap: 10,
            }}>
              <Text style={{ fontWeight: "800", fontSize: 15, color: "#e2e8f0" }}>
                {t("achievements")} ({unlocked.length}/{ACHIEVEMENTS.length})
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {unlocked.map(a => (
                  <View key={a.key} style={{
                    flexDirection: "row", alignItems: "center", gap: 6,
                    backgroundColor: "#1e293b", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
                    borderWidth: 1, borderColor: "#334155",
                  }}>
                    <Text style={{ fontSize: 18 }}>{a.emoji}</Text>
                    <View>
                      <Text style={{ color: "#e2e8f0", fontWeight: "700", fontSize: 12 }}>{a.label}</Text>
                      <Text style={{ color: "#64748b", fontSize: 9 }}>{a.desc}</Text>
                    </View>
                  </View>
                ))}
                {locked.map(a => (
                  <View key={a.key} style={{
                    flexDirection: "row", alignItems: "center", gap: 6,
                    backgroundColor: "#0f172a", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
                    borderWidth: 1, borderColor: "#1e293b", opacity: 0.4,
                  }}>
                    <Text style={{ fontSize: 18 }}>🔒</Text>
                    <Text style={{ color: "#475569", fontWeight: "600", fontSize: 12 }}>{a.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })()}

        {/* Sıradaki Adımın — oyun önerileri */}
        {(() => {
          const steps = [
            {
              key: "predict",
              done: (predCount ?? 0) > 0,
              icon: "⚽",
              title: t("stepPredict"),
              desc: t("stepPredictDesc"),
              color: "#16a34a",
              bg: "#dcfce7",
              action: () => nav.replace({ pathname: "/(tabs)/live", params: { mode: "open" } } as any),
            },
            {
              key: "team",
              done: !!profile?.mainTeam,
              icon: "🏆",
              title: t("stepTeam"),
              desc: t("stepTeamDesc"),
              color: Colors.accent,
              bg: "#edf4ff",
              action: () => null, // zaten bu sayfada
            },
            {
              key: "tournament",
              done: false,
              icon: "🎯",
              title: t("stepTournament"),
              desc: t("stepTournamentDesc"),
              color: "#7c3aed",
              bg: "#f5f3ff",
              action: () => nav.replace({ pathname: "/(tabs)/live", params: { mode: "tournaments" } } as any),
            },
            {
              key: "mini",
              done: false,
              icon: "🏅",
              title: t("stepMini"),
              desc: t("stepMiniDesc"),
              color: "#ea580c",
              bg: "#fff7ed",
              action: () => nav.push({ pathname: "/mini/create", params: { userId } } as any),
            },
            {
              key: "friends",
              done: false,
              icon: "👥",
              title: t("stepFriends"),
              desc: t("stepFriendsDesc"),
              color: "#0891b2",
              bg: "#ecfeff",
              action: () => nav.push({ pathname: "/friends/board", params: { userId } } as any),
            },
            {
              // Haftalik kupon: yeni oyun. Giris noktasi olmadan kullanici
              // ekrani hic bulamaz — sunucu hazir olsa da ozellik gorunmez.
              key: "kupon",
              done: false,
              icon: "🎟️",
              title: t("stepKupon"),
              desc: t("stepKuponDesc"),
              color: "#0e7490",
              bg: "#082f3a",
              textColor: "#67e8f9",
              action: () => nav.push({ pathname: "/kupon" } as any),
            },
            {
              key: "gs1987",
              done: !!profile?.is1987,
              icon: "🔴",
              title: t("stepGs1987"),
              desc: t("stepGs1987Desc"),
              color: "#991b1b",
              bg: "#1a0a0a",
              textColor: "#c9a227",
              action: () => nav.replace({ pathname: "/(tabs)/live", params: { mode: "gs1987" } } as any),
            },
          ];

          const nextStep = steps.find(s => !s.done);
          const doneCount = steps.filter(s => s.done).length;

          return (
            <View style={{
              backgroundColor: "#0f172a", borderRadius: 14,
              borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 10,
            }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontWeight: "800", fontSize: 14, color: Colors.slate900 }}>
                  {t("nextStepTitle")}
                </Text>
                <Text style={{ fontSize: 12, color: Colors.muted }}>
                  {t("stepsDone", { done: doneCount, total: steps.length })}
                </Text>
              </View>

              {/* İlerleme çubuğu */}
              <View style={{ height: 6, backgroundColor: "#0a1a2a", borderRadius: 999 }}>
                <View style={{
                  height: 6, borderRadius: 999,
                  width: `${Math.round((doneCount / steps.length) * 100)}%` as any,
                  backgroundColor: "#16a34a",
                }} />
              </View>

              {/* Adımlar */}
              <View style={{ gap: 6 }}>
                {steps.map((s) => (
                  <TouchableOpacity
                    key={s.key}
                    onPress={s.action}
                    disabled={s.done}
                    style={{
                      flexDirection: "row", alignItems: "center", gap: 10,
                      paddingVertical: 8, paddingHorizontal: 10,
                      borderRadius: 10, borderWidth: 1,
                      borderColor: s.done ? "#d1fae5" : s.key === nextStep?.key ? s.bg : Colors.border,
                      backgroundColor: s.done ? "#f0fdf4" : s.key === nextStep?.key ? s.bg : "#fafafa",
                      opacity: s.done ? 0.7 : 1,
                    }}
                  >
                    <Text style={{ fontSize: 20 }}>{s.done ? "✅" : s.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{
                        fontWeight: "700", fontSize: 13,
                        color: s.done ? Colors.muted : (s as any).textColor || s.color,
                        textDecorationLine: s.done ? "line-through" : "none",
                      }}>
                        {s.title}
                      </Text>
                      {!s.done && (
                        <Text style={{ fontSize: 11, color: Colors.muted }}>{s.desc}</Text>
                      )}
                    </View>
                    {!s.done && s.key === nextStep?.key && (
                      <Text style={{ fontSize: 11, fontWeight: "700", color: s.color }}>→</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        })()}

        {/* LC Cüzdanım kartı */}
        <View
          style={{
            padding: 12,
            backgroundColor: "#0f172a",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.border,
            gap: 8,
          }}
        >
          <Text style={{ fontWeight: "700" }}>{t("myWallet")}</Text>

          {walletLoading && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
              <ActivityIndicator />
              <Text style={{ color: Colors.muted, fontSize: 12 }}>{t("walletLoading")}</Text>
            </View>
          )}

          {!walletLoading && wallet && (
            <>
              {/* Bakiye banner */}
              <View style={{
                backgroundColor: "#1a1600", borderRadius: 12, padding: 14,
                borderWidth: 1, borderColor: "#fde047",
                flexDirection: "row", alignItems: "center", gap: 10,
              }}>
                <Text style={{ fontSize: 32 }}>🪙</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 32, fontWeight: "900", color: "#92400e", lineHeight: 36 }}>
                    {wallet.user?.balance ?? 0}
                    <Text style={{ fontSize: 18, fontWeight: "700" }}> LC</Text>
                  </Text>
                  {wallet.daily?.canClaim && (
                    <Text style={{ fontSize: 11, color: "#78350f", fontWeight: "600" }}>
                      {t("dailyReady")}
                    </Text>
                  )}
                </View>
              </View>
              <Text style={{ color: Colors.muted, fontSize: 12 }}>
                {t("earnSpend", { e: wallet.user?.totalEarned ?? 0, s: wallet.user?.totalSpent ?? 0 })}
              </Text>

              {wallet.user?.lastDailyAt && (
                <Text style={{ color: Colors.muted, fontSize: 11 }}>
                  {t("lastDaily", { d: String(wallet.user.lastDailyAt).slice(0, 10) })}
                </Text>
              )}

              {wallet.daily && (
                <Text style={{ color: Colors.muted, fontSize: 12 }}>
                  {t("dailyInfo", { n: wallet.daily.amount, d: wallet.daily.today })}
                </Text>
              )}

              {wallet.pricing && (
                <Text style={{ color: Colors.muted, fontSize: 11 }}>
                  {t("pricingInfo", { entry: wallet.pricing.matchEntryCost, init: wallet.pricing.initialDefault, init87: wallet.pricing.initial1987 })}
                </Text>
              )}

              <TouchableOpacity
                onPress={claimDaily}
                disabled={claiming || !wallet.daily?.canClaim}
                style={{
                  marginTop: 6,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: !wallet.daily?.canClaim ? Colors.border : Colors.live,
                  opacity: claiming ? 0.7 : 1,
                }}
              >
                <Text style={{ textAlign: "center", color: "#fff", fontWeight: "700", fontSize: 13 }}>
                  {wallet.daily?.canClaim ? t("claimDaily") : t("dailyUsed")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => nav.push({ pathname: "/lc-ledger", params: { userId } })}
                style={{
                  marginTop: 6,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: Colors.headerBlue,
                }}
              >
                <Text style={{ textAlign: "center", color: Colors.slate900, fontWeight: "700", fontSize: 13 }}>
                  {t("seeLedger")}
                </Text>
              </TouchableOpacity>

              {/* Premium aylık kasa bilgisi */}
              {wallet.premium && wallet.premiumMonthly?.active && (
                <View
                  style={{
                    marginTop: 6,
                    padding: 8,
                    borderRadius: 8,
                    backgroundColor: "#1a1200",
                    borderWidth: 1,
                    borderColor: "#fde68a",
                  }}
                >
                  <Text style={{ color: "#92400e", fontSize: 11, fontWeight: "600" }}>
                    {t("premiumMonthly", { n: wallet.premiumMonthly.amount })}
                    {wallet.premiumMonthly.grantedThisMonth
                      ? t("premiumGranted", { d: String(wallet.premiumMonthly.nextRenewal) })
                      : t("premiumWaiting")}
                  </Text>
                </View>
              )}

              {/* Otomatik birikim bilgisi (token bitince bekle) */}
              {wallet.regen && (
                <View
                  style={{
                    marginTop: 6,
                    padding: 8,
                    borderRadius: 8,
                    backgroundColor: "#071a0f",
                    borderWidth: 1,
                    borderColor: "#bbf7d0",
                  }}
                >
                  <Text style={{ color: "#166534", fontSize: 11 }}>
                    {t("regenInfo", { cap: wallet.regen.cap, h: wallet.regen.intervalHours, n: wallet.regen.amountPerTick })}
                    {wallet.regen.active && wallet.regen.nextAt
                      ? t("regenNext", { t: new Date(wallet.regen.nextAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) })
                      : ""}
                  </Text>
                </View>
              )}

              {/* LC Mağazası */}
              {storePkgs.length > 0 && storeMode !== "disabled" && (
                <View style={{ marginTop: 8, gap: 6 }}>
                  <Text style={{ fontWeight: "700", fontSize: 13 }}>
                    {t("lcStore")}{storeMode === "mock" ? t("testMode") : ""}
                  </Text>
                  {storePkgs.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      disabled={buying === p.id}
                      onPress={() => buyPackage(p)}
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: 10,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: p.emergency ? "#f97316" : p.popular ? Colors.accent : Colors.border,
                        backgroundColor: p.emergency ? "#fff7ed" : p.popular ? "#eef2ff" : "#fff",
                        opacity: buying === p.id ? 0.6 : 1,
                      }}
                    >
                      <View>
                        <Text style={{ fontWeight: "700", fontSize: 13 }}>
                          {p.emergency ? "🚨 " : ""}
                          {p.label}
                          {p.popular ? " ⭐" : ""}
                        </Text>
                        <Text style={{ color: Colors.muted, fontSize: 11 }}>
                          {p.lc} LC{p.emergency ? t("emergencyPkg") : ""}
                        </Text>
                      </View>
                      <Text style={{ fontWeight: "800", color: Colors.accent }}>
                        {buying === p.id ? "..." : `₺${p.priceTRY}`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}

          {!walletLoading && !wallet && (
            <Text style={{ color: Colors.muted, fontSize: 12 }}>{t("walletFailed")}</Text>
          )}

          {predCountLoading ? (
            <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 6 }}>{t("predCountLoading")}</Text>
          ) : predCount !== null ? (
            <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 6 }}>
              {t("predCountInfo", { n: predCount })}
            </Text>
          ) : null}
        </View>

        {/* Takımım & Ülkem — kombine seçici */}
        <View
          style={{
            padding: 12,
            backgroundColor: "#0f172a",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.border,
            gap: 10,
          }}
        >
          <Text style={{ fontWeight: "700" }}>{t("teamCountry")}</Text>
          <Text style={{ color: Colors.muted, fontSize: 12 }}>
            {t("teamCountryHelp")}
          </Text>

          {/* Mevcut kayıtlı seçimler */}
          {(profile?.mainTeam || profile?.country) && (
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {profile?.country && (
                <View style={{
                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
                  backgroundColor: "#edf4ff", borderWidth: 1, borderColor: Colors.accent,
                }}>
                  <Text style={{ fontWeight: "600", fontSize: 12 }}>
                    {richCountries.find(c => c.code === profile.country)?.flag || "🌍"}{" "}
                    {(() => {
                      const bulunan = richCountries.find(c => c.code === profile.country);
                      return bulunan ? ulkeAdi(bulunan.name) || bulunan.name : profile.country;
                    })()}
                  </Text>
                </View>
              )}
              {profile?.mainTeam && (
                <View style={{
                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
                  backgroundColor: Colors.accent,
                }}>
                  <Text style={{ fontWeight: "600", fontSize: 12, color: Colors.onAccent }}>
                    ⚽ {profile.mainTeam}
                  </Text>
                </View>
              )}
              {!!profile?.mainTeam && (
                <TouchableOpacity
                  onPress={() => nav.push({ pathname: "/stats/team", params: { team: profile!.mainTeam! } })}
                  style={{
                    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
                    backgroundColor: Colors.live,
                  }}
                >
                  <Text style={{ fontWeight: "600", fontSize: 12, color: on(Colors.live) }}>
                    {t("teamPanel", { team: profile.mainTeam })}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Ülke seçici — yatay kaydırmalı */}
          <Text style={{ fontSize: 12, color: Colors.muted, fontWeight: "600" }}>{t("pickCountry")}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -12 }}
            contentContainerStyle={{ paddingHorizontal: 12, flexDirection: "row", gap: 6 }}
          >
            {sortedRichCountries.map(c => {
              const active = selectedCountryCode === c.code;
              return (
                <TouchableOpacity
                  key={c.code}
                  onPress={async () => {
                    setSelectedCountryCode(c.code);
                    setCountryTeams([]);
                    setTeamSearch("");
                    setTeamsLoading(true);
                    try {
                      const r = await apiFetch(`/api/teams/by-country?country=${c.code}`).then(x => x.json());
                      setCountryTeams(r?.teams || []);
                    } catch {}
                    setTeamsLoading(false);
                  }}
                  style={{
                    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? Colors.accent : Colors.border,
                    backgroundColor: active ? Colors.accent : "#fff",
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: active ? Colors.onAccent : Colors.slate900 }}>
                    {c.flag} {c.localName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Takım listesi — ülke seçilince açılır */}
          {!!selectedCountryCode && (
            <>
              <TextInput
                placeholder={t("searchTeam")}
                value={teamSearch}
                onChangeText={setTeamSearch}
                style={{
                  borderWidth: 1, borderColor: Colors.border,
                  borderRadius: 8, padding: 8,
                }}
              />
              {teamsLoading ? (
                <ActivityIndicator size="small" color={Colors.accent} />
              ) : (
                <View style={{ gap: 4 }}>
                  {(teamSearch
                    ? countryTeams.filter(t => t.toLowerCase().includes(teamSearch.toLowerCase()))
                    : countryTeams
                  ).slice(0, 12).map(team => {
                    const active = teamInput === team;
                    return (
                      <TouchableOpacity
                        key={team}
                        onPress={() => setTeamInput(active ? "" : team)}
                        style={{
                          padding: 10, borderWidth: 1, borderRadius: 8,
                          borderColor: active ? Colors.accent : Colors.border,
                          backgroundColor: active ? "#edf4ff" : "#fff",
                        }}
                      >
                        <Text style={{ fontWeight: active ? "700" : "400", color: active ? Colors.accent : Colors.slate900 }}>
                          {team}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {!!teamInput && (
                <TouchableOpacity
                  onPress={() => saveTeamAndCountry(teamInput, selectedCountryCode)}
                  disabled={countrySaving}
                  style={{
                    padding: 12, backgroundColor: Colors.live, borderRadius: 10,
                    opacity: countrySaving ? 0.6 : 1,
                  }}
                >
                  <Text style={{ textAlign: "center", color: "#fff", fontWeight: "700" }}>
                    {countrySaving ? t("saving") : t("saveTeamBtn", { team: teamInput })}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {/* ── Bildirimler ── */}
        <View style={{ backgroundColor: "#0f172a", borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontWeight: "800", fontSize: 14 }}>{t("notifications")}</Text>
            {pushLoading && <ActivityIndicator size="small" color={Colors.accent} />}
          </View>

          {!pushLoading && pushDevices === 0 ? (
            <>
              <Text style={{ color: Colors.muted, fontSize: 12 }}>
                {t("pushOffHelp")}
              </Text>
              <TouchableOpacity
                onPress={enablePushOnDevice}
                style={{
                  alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 9,
                  borderRadius: 999, backgroundColor: Colors.accent,
                }}
              >
                <Text style={{ color: "#020617", fontWeight: "900", fontSize: 13 }}>
                  {t("pushEnable")}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={{ color: Colors.muted, fontSize: 12 }}>
                {t("pushDevices", { n: pushDevices })}
              </Text>

              {([
                { key: "matchStart" as const, icon: "⏱", label: t("pushMatchStart"),
                  desc: t("pushMatchStartD") },
                { key: "result" as const, icon: "🏁", label: t("pushResult"),
                  desc: t("pushResultD") },
                { key: "duel" as const, icon: "⚔️", label: t("pushDuel"),
                  desc: t("pushDuelD") },
                { key: "daily" as const, icon: "🪙", label: t("pushDaily"),
                  desc: t("pushDailyD") },
              ]).map((row) => {
                const on = pushPrefs[row.key];
                const busy = pushSavingKey === row.key;
                return (
                  <TouchableOpacity
                    key={row.key}
                    onPress={() => togglePushPref(row.key)}
                    disabled={busy}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: "row", alignItems: "center", gap: 12,
                      paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12,
                      backgroundColor: "#0b1424",
                      borderWidth: 1,
                      borderColor: on ? Colors.accent + "55" : Colors.border,
                      opacity: busy ? 0.6 : 1,
                    }}
                  >
                    <Text style={{ fontSize: 18 }}>{row.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "#e2e8f0", fontWeight: "700", fontSize: 13 }}>
                        {row.label}
                      </Text>
                      <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 1 }}>
                        {row.desc}
                      </Text>
                    </View>
                    {/* Anahtar */}
                    <View
                      style={{
                        width: 44, height: 26, borderRadius: 13, padding: 3,
                        backgroundColor: on ? Colors.accent : "#1e293b",
                        justifyContent: "center",
                        alignItems: on ? "flex-end" : "flex-start",
                      }}
                    >
                      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff" }} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </View>

        {/* ── Dil Tercihi ── */}
        <View style={{ backgroundColor: "#0f172a", borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 10 }}>
          <Text style={{ fontWeight: "800", fontSize: 14 }}>{t("langPref")}</Text>
          <Text style={{ color: Colors.muted, fontSize: 12 }}>{t("langPrefHelp")}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {[
              { code: "tr", label: "🇹🇷 Türkçe" }, { code: "en", label: "🏴󠁧󠁢󠁥󠁮󠁧󠁿 English" },
              { code: "fr", label: "🇫🇷 Français" }, { code: "de", label: "🇩🇪 Deutsch" },
              { code: "es", label: "🇪🇸 Español" }, { code: "pt", label: "🇵🇹 Português" },
              { code: "it", label: "🇮🇹 Italiano" }, { code: "nl", label: "🇳🇱 Nederlands" },
              { code: "el", label: "🇬🇷 Ελληνικά" }, { code: "pl", label: "🇵🇱 Polski" },
              { code: "ru", label: "🇷🇺 Русский" }, { code: "uk", label: "🇺🇦 Українська" },
              { code: "ar", label: "🇸🇦 العربية" },  { code: "ja", label: "🇯🇵 日本語" },
              { code: "hr", label: "🇭🇷 Hrvatski" }, { code: "sr", label: "🇷🇸 Srpski" },
              { code: "cs", label: "🇨🇿 Čeština" },  { code: "ro", label: "🇷🇴 Română" },
              { code: "hu", label: "🇭🇺 Magyar" },   { code: "sk", label: "🇸🇰 Slovenčina" },
              { code: "bg", label: "🇧🇬 Български" },
            ].map(l => {
              const active = preferredLang === l.code;
              return (
                <TouchableOpacity
                  key={l.code}
                  disabled={langSaving}
                  onPress={() => saveLang(l.code)}
                  style={{
                    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? Colors.accent : Colors.border,
                    backgroundColor: active ? Colors.accent : "#fff",
                    opacity: langSaving ? 0.6 : 1,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: active ? Colors.onAccent : Colors.slate900 }}>
                    {l.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {preferredLang && (
            <TouchableOpacity
              onPress={() => saveLang("")}
              disabled={langSaving}
              style={{ alignSelf: "flex-start" }}
            >
              <Text style={{ fontSize: 11, color: Colors.muted }}>{t("langClear")}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Takip Ettiğim Ligler ── */}
        <View style={{ backgroundColor: "#0f172a", borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 10 }}>
          <Text style={{ fontWeight: "800", fontSize: 14 }}>{t("myLeagues")}</Text>
          <Text style={{ color: Colors.muted, fontSize: 12 }}>
            {t("myLeaguesHelp")}
          </Text>
          {preferredLeagues.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {preferredLeagues.map(l => (
                <View key={l} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: Colors.accent }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: Colors.onAccent }}>
                    {richCountries.find(c => c.name === l || c.localName === l)?.flag || "🏆"} {l}
                  </Text>
                </View>
              ))}
            </View>
          )}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {sortedRichCountries.map(c => {
              const selected = preferredLeagues.includes(c.name);
              return (
                <TouchableOpacity
                  key={c.code}
                  disabled={leagueSaving}
                  onPress={() => {
                    const next = selected
                      ? preferredLeagues.filter(l => l !== c.name)
                      : [...preferredLeagues, c.name];
                    saveLeagues(next);
                  }}
                  style={{
                    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
                    borderWidth: 1,
                    borderColor: selected ? Colors.live : Colors.border,
                    backgroundColor: selected ? "#f0fdf4" : "#fff",
                    opacity: leagueSaving ? 0.6 : 1,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: selected ? "700" : "400", color: selected ? Colors.live : Colors.slate900 }}>
                    {selected ? "✓ " : ""}{c.flag} {c.localName}
                  </Text>
                  <Text style={{ fontSize: 10, color: Colors.muted }}>{c.topLeague}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {preferredLeagues.length > 0 && (
            <TouchableOpacity
              onPress={() => saveLeagues([])}
              disabled={leagueSaving}
              style={{ alignSelf: "flex-start" }}
            >
              <Text style={{ fontSize: 11, color: Colors.muted }}>{t("clearAll")}</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
          <TouchableOpacity
            onPress={() => nav.push({ pathname: "/friends/board", params: { userId } })}
            style={{
              flex: 1,
              padding: 10,
              backgroundColor: Colors.headerBlue,
              borderRadius: 10,
            }}
          >
            <Text style={{ textAlign: "center", color: Colors.slate900, fontWeight: "600" }}>{t("friendLeague")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => nav.push({ pathname: "/friends/list", params: { userId } })}
            style={{
              flex: 1,
              padding: 10,
              backgroundColor: Colors.headerBlue,
              borderRadius: 10,
            }}
          >
            <Text style={{ textAlign: "center", color: Colors.slate900, fontWeight: "600" }}>{t("friendRequests")}</Text>
          </TouchableOpacity>
        </View>

        {/* Gruplar kartı */}
        <View
          style={{
            padding: 12,
            backgroundColor: "#0f172a",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.border,
            gap: 8,
          }}
        >
          <Text style={{ fontWeight: "700" }}>{t("myGroups")}</Text>
          {groups.length === 0 ? (
            <Text style={{ color: Colors.muted }}>{t("noGroups")}</Text>
          ) : (
            groups.map((g, i) => (
              <View
                key={String(g.id || g.name || "group") + "_" + i}
                style={{
                  padding: 8,
                  borderWidth: 1,
                  borderColor: Colors.border,
                  borderRadius: 8,
                  marginBottom: 6,
                }}
              >
                <Text style={{ fontWeight: "600" }}>{g.name}</Text>
                <Text style={{ color: Colors.muted, fontSize: 12 }}>
                  {t("memberCount", { n: Array.isArray(g.members) ? g.members.length : 0 })}
                </Text>
              </View>
            ))
          )}
          <TouchableOpacity onPress={createGroup} style={{ padding: 10, backgroundColor: Colors.purple, borderRadius: 10 }}>
            <Text style={{ textAlign: "center", color: "#fff", fontWeight: "700" }}>{t("createGroup")}</Text>
          </TouchableOpacity>
        </View>

        {/* Arkadaş ligi kartı */}
        <View
          style={{
            padding: 12,
            backgroundColor: "#0f172a",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.border,
            gap: 8,
          }}
        >
          <Text style={{ fontWeight: "700" }}>{t("friendLeague")}</Text>
          <Text style={{ color: Colors.muted, fontSize: 12 }}>
            {t("friendLeagueHelp")}
          </Text>

          <View
            style={{
              marginTop: 4,
              padding: 8,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: Colors.border,
              gap: 6,
            }}
          >
            <Text style={{ color: Colors.muted, fontSize: 11 }}>
              {t("friendIdHelp")}
            </Text>
            <TextInput
              placeholder={t("friendIdPh")}
              value={friendTarget}
              onChangeText={setFriendTarget}
              autoCapitalize="none"
              style={{
                borderWidth: 1,
                borderColor: Colors.border,
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 6,
                fontSize: 13,
              }}
            />
            <TouchableOpacity
              onPress={sendFriendRequest}
              style={{ marginTop: 4, paddingVertical: 8, borderRadius: 999, backgroundColor: Colors.live }}
            >
              <Text style={{ textAlign: "center", color: "#fff", fontWeight: "700", fontSize: 13 }}>
                {t("sendFriendReq")}
              </Text>
            </TouchableOpacity>
          </View>

          {friendItems.length === 0 ? (
            <Text style={{ color: Colors.muted, fontSize: 12, marginTop: 6 }}>{t("noFriendLeague")}</Text>
          ) : (
            friendItems.slice(0, 10).map((row, idx) => {
              const isMe = String(row.userId || "").toLowerCase() === userId.toLowerCase();
              return (
                <View
                  key={row.userId + "_" + idx}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingVertical: 4,
                    borderTopWidth: idx === 0 ? 0 : 1,
                    borderTopColor: Colors.border,
                  }}
                >
                  <View>
                    <Text
                      style={{
                        color: isMe ? Colors.live : Colors.slate900,
                        fontWeight: isMe ? "800" : "600",
                        fontSize: 13,
                      }}
                    >
                      {idx + 1}. {row.name || row.userId}
                      {isMe ? t("me2") : ""}
                    </Text>
                  </View>
                  <Text style={{ color: Colors.accent, fontWeight: "700", fontSize: 12 }}>
                    {(row.totalPoints ?? 0) + " p"}
                  </Text>
                </View>
              );
            })
          )}

          {myFriendRow && myFriendRank && (
            <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 4 }}>
              {t("friendRank", { n: myFriendRank })}
            </Text>
          )}
        </View>

        {/* Diğer araçlar kartı */}
        <View
          style={{
            padding: 12,
            backgroundColor: "#0f172a",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.border,
            gap: 8,
          }}
        >
          <Text style={{ fontWeight: "700" }}>{t("otherTools")}</Text>

          {/* Kazanılan turnuvalar vitrini */}
          {miniWins.length > 0 && (
            <View
              style={{
                padding: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "#fbbf24",
                backgroundColor: "#1a1200",
                gap: 4,
              }}
            >
              <Text style={{ fontWeight: "800", color: "#92400e" }}>
                {t("wonTournaments", { n: miniWins.length })}
              </Text>
              {miniWins.slice(0, 5).map((w) => (
                <TouchableOpacity
                  key={w.id}
                  onPress={() => nav.push({ pathname: "/mini/[id]", params: { id: w.id, userId } })}
                >
                  <Text style={{ color: "#92400e", fontSize: 12 }} numberOfLines={1}>
                    • {w.name}
                    {w.shared ? t("sharedChampion") : ""} · +{w.rewardLc} LC ·{" "}
                    {String(w.finishedAt).slice(0, 10)}
                  </Text>
                </TouchableOpacity>
              ))}
              {miniWins.length > 5 && (
                <Text style={{ color: "#b45309", fontSize: 11 }}>{t("andMore", { n: miniWins.length - 5 })}</Text>
              )}
            </View>
          )}

          <TouchableOpacity
            onPress={() => nav.push({ pathname: "/premium", params: { userId } })}
            style={{ padding: 10, backgroundColor: "#f59e0b", borderRadius: 10 }}
          >
            <Text style={{ textAlign: "center", color: "#fff", fontWeight: "800" }}>
              {t("premiumBtn")}
            </Text>
          </TouchableOpacity>
          {/* ===== ARKADAŞ DAVET PANELİ ===== */}
          <View style={{ borderRadius: 12, borderWidth: 1, borderColor: "#22c55e55", backgroundColor: "#0a1a0f", overflow: "hidden" }}>
            {/* Benim kodum + paylaş */}
            <View style={{ padding: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#4ade80", fontSize: 11, fontWeight: "700" }}>{t("inviteTitle")}</Text>
                <Text style={{ color: "#94a3b8", fontSize: 10, marginTop: 2 }}>
                  {t("inviteHelp")}
                </Text>
              </View>
              <TouchableOpacity
                onPress={shareInvite}
                disabled={!inviteCode}
                style={{ backgroundColor: "#22c55e", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignItems: "center", minWidth: 70 }}
              >
                <Text style={{ color: "#000", fontWeight: "900", fontSize: 13, letterSpacing: 2 }}>
                  {inviteCode || "..."}
                </Text>
                <Text style={{ color: "#000", fontSize: 9, fontWeight: "700" }}>{t("share")}</Text>
              </TouchableOpacity>
            </View>

            {/* Kodu gir */}
            <View style={{ borderTopWidth: 1, borderTopColor: "#1a2e1a", padding: 10, flexDirection: "row", gap: 8 }}>
              <TextInput
                value={inviteInputCode}
                onChangeText={setInviteInputCode}
                placeholder={t("inviteCodePh")}
                placeholderTextColor="#475569"
                autoCapitalize="characters"
                maxLength={6}
                style={{ flex: 1, color: "#e2e8f0", fontSize: 14, fontWeight: "700", borderWidth: 1, borderColor: "#334155", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, letterSpacing: 2 }}
              />
              <TouchableOpacity
                onPress={useInviteCode}
                disabled={inviteBusy || inviteInputCode.trim().length < 4}
                style={{ backgroundColor: inviteInputCode.trim().length >= 4 ? "#3b82f6" : "#1e293b", borderRadius: 8, paddingHorizontal: 14, justifyContent: "center" }}
              >
                <Text style={{ color: inviteInputCode.trim().length >= 4 ? "#fff" : "#475569", fontWeight: "800", fontSize: 13 }}>
                  {inviteBusy ? "..." : t("enter")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            onPress={() => nav.push({ pathname: "/(tabs)/live", params: { userId, tab: "mine" } })}
            style={{ padding: 10, backgroundColor: "#0F172A", borderRadius: 10, borderWidth: 1, borderColor: Colors.accent }}
          >
            <Text style={{ textAlign: "center", color: Colors.accent, fontWeight: "700" }}>
              {t("myPredsBtn")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => nav.push({ pathname: "/(tabs)/live", params: { userId, tab: "tournaments" } })}
            style={{ padding: 10, backgroundColor: "#0F172A", borderRadius: 10, borderWidth: 1, borderColor: "#fbbf24" }}
          >
            <Text style={{ textAlign: "center", color: "#fbbf24", fontWeight: "700" }}>
              {t("myTournamentsBtn")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => nav.push({ pathname: "/tr-league", params: { userId } })}
            style={{ padding: 10, backgroundColor: "#dc2626", borderRadius: 10 }}
          >
            <Text style={{ textAlign: "center", color: "#fff", fontWeight: "700" }}>
              {t("trLeagueBtn")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => nav.push({ pathname: "/mini", params: { userId } })}
            style={{ padding: 10, backgroundColor: Colors.live, borderRadius: 10 }}
          >
            <Text style={{ textAlign: "center", color: "#fff", fontWeight: "700" }}>
              {t("miniBtn")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => nav.push("/gs1987-verify")}
            style={{ padding: 10, backgroundColor: Colors.purple, borderRadius: 10 }}
          >
            <Text style={{ textAlign: "center", color: "#fff", fontWeight: "700" }}>
              {t("gs1987VerifyBtn")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => nav.push("/kings")}
            style={{ padding: 10, backgroundColor: Colors.accent, borderRadius: 10 }}
          >
            <Text style={{ textAlign: "center", color: Colors.onAccent, fontWeight: "700" }}>
              {t("goalKingsBtn")}
            </Text>
          </TouchableOpacity>

          {/* Hesap Silme */}
          <TouchableOpacity
            onPress={() => {
              Alert.alert(
                t("deleteAccTitle"),
                t("deleteAccMsg"),
                [
                  { text: t("dismiss"), style: "cancel" },
                  {
                    text: t("deleteAccYes"),
                    style: "destructive",
                    onPress: async () => {
                      try {
                        const base = await getApiBase();
                        const authH = await getAuthHeaders();
                        const r = await fetch(`${base}/api/users/delete-account`, {
                          method: "DELETE",
                          headers: authH,
                        });
                        const json = await r.json();
                        if (!json.ok) throw new Error(json.error || t("serverError"));
                        Alert.alert(t("deleteAccDone"), t("deleteAccDoneMsg"), [
                          { text: t("ok"), onPress: () => nav.replace("/login") },
                        ]);
                      } catch (e: any) {
                        Alert.alert(t("error"), e.message || t("deleteAccFailed"));
                      }
                    },
                  },
                ]
              );
            }}
            style={{ padding: 10, backgroundColor: "#1a0a0a", borderRadius: 10, borderWidth: 1, borderColor: "#7f1d1d", marginTop: 8 }}
          >
            <Text style={{ textAlign: "center", color: "#ef4444", fontWeight: "700" }}>
              🗑️ {t("deleteAccount")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}