import { Share } from "react-native";
import { apiFetch } from "./apiFetch";

/**
 * PAYLAŞIM METİNLERİ VE DAVET HALKASI
 *
 * Her paylaşım kullanıcının davet kodunu taşır. Kod olmadan paylaşım viral
 * döngü kurmaz: yeni gelen kişi uygulamayı indirse bile kimin davetiyle
 * geldiği bilinmez, ikisi de LC ödülünü alamaz ve paylaşan kişi bir daha
 * paylaşmaz.
 *
 * Derin bağlantı (skorlig://) yalnızca uygulama KURULUYSA çalışır. Kurulu
 * olmayan kişi için kod düz metin olarak da yazılır — elle girebilsin.
 *
 * EKSİK HALKA: Play Store listesi yayına girince buraya bir https iniş
 * sayfası eklenmeli (uygulama varsa aç, yoksa mağazaya götür). O olmadan
 * kurulu olmayan kişi kodu elle yazmak zorunda ve dönüşüm düşük kalır.
 */

const SCHEME = "skorlig://";

/** Kullanıcının davet kodunu getirir (sunucu yoksa/hata olursa null). */
export async function getInviteCode(userId: string): Promise<string | null> {
  const uid = String(userId || "").trim();
  if (!uid) return null;
  try {
    const r = await apiFetch(
      `/api/friends/invite-code?userId=${encodeURIComponent(uid)}`
    ).then((x) => x.json());
    return r?.ok && r.inviteCode ? String(r.inviteCode) : null;
  } catch {
    return null;
  }
}

function deepLink(path: string, params: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) qs.set(k, v);
  }
  const q = qs.toString();
  return `${SCHEME}${path}${q ? `?${q}` : ""}`;
}

/** Paylaşım metninin sonuna davet bloğunu ekler. */
function withInvite(body: string, link: string, code: string | null): string {
  const lines = [body, "", link];
  if (code) {
    lines.push(
      "",
      `Uygulama yoksa: indirdikten sonra Profil → "Davet Kodu Gir" bölümüne ${code} yaz — ikimiz de +15 LC kazanırız.`
    );
  }
  return lines.join("\n");
}

type MatchInfo = {
  fixtureId: string;
  home: string;
  away: string;
  league?: string | null;
};

/** Tahmin gönderildikten sonra: "ben şöyle dedim, sen ne diyorsun?" */
export async function sharePrediction(opts: {
  match: MatchInfo;
  homeScore: number | string;
  awayScore: number | string;
  maxGain?: number | null;
  userId: string;
}): Promise<boolean> {
  const { match, homeScore, awayScore, maxGain, userId } = opts;
  const code = await getInviteCode(userId);

  const head = `⚽ ${match.home} ${homeScore}-${awayScore} ${match.away}`;
  const parts = [
    `${head} dedim.`,
    match.league ? `(${match.league})` : "",
    "",
    "Sen ne diyorsun? SkorLig'de aynı maça tahmin yap, kim daha iyi bilecek görelim.",
  ].filter(Boolean);
  if (maxGain && maxGain > 0) {
    parts.push("", `Bu tahmin tutarsa +${maxGain} puan.`);
  }

  const link = deepLink("predict", { fixtureId: match.fixtureId, ref: code || undefined });
  return doShare(withInvite(parts.join("\n"), link, code), "SkorLig Tahmin");
}

/** Maç bitti, sonuç belli: "şu puanı aldım, şu sıradayım" */
export async function shareResult(opts: {
  match: MatchInfo;
  finalHome: number;
  finalAway: number;
  points: number;
  rank?: number | null;
  total?: number | null;
  userId: string;
}): Promise<boolean> {
  const { match, finalHome, finalAway, points, rank, total, userId } = opts;
  const code = await getInviteCode(userId);

  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "📊";
  const parts = [
    `${medal} ${match.home} ${finalHome}-${finalAway} ${match.away}`,
    `SkorLig'de bu maçtan ${points} puan aldım` +
      (rank && total ? ` — ${total} kişi arasında ${rank}. oldum.` : "."),
    "",
    "Sen de tahmin et, sıralamada beni geçmeye çalış.",
  ];

  const link = deepLink("match-race/" + encodeURIComponent(match.fixtureId), {
    ref: code || undefined,
  });
  return doShare(withInvite(parts.join("\n"), link, code), "SkorLig Sonuç");
}

/** Düello daveti */
export async function shareDuel(opts: {
  match: MatchInfo;
  stake: number;
  duelId: string;
  userId: string;
}): Promise<boolean> {
  const { match, stake, duelId, userId } = opts;
  const code = await getInviteCode(userId);

  const parts = [
    `⚔️ ${match.home} – ${match.away} maçında sana düello açtım.`,
    `Bahis: ${stake} LC. Kim daha doğru tahmin ederse havuzu alır.`,
    "",
    "Kabul etmeye var mısın?",
  ];

  const link = deepLink("duel", { duelId, ref: code || undefined });
  return doShare(withInvite(parts.join("\n"), link, code), "SkorLig Düello");
}

/** Sade davet (profil ekranı) */
export async function shareInvite(userId: string): Promise<boolean> {
  const code = await getInviteCode(userId);
  if (!code) return false;
  const parts = [
    "SkorLig'e katıl, birlikte tahmin yarışalım! 🏆",
    "",
    "Dünyanın her liginden maça tahmin yap, puan topla, arkadaşlarınla düello at.",
  ];
  const link = deepLink("", { ref: code });
  return doShare(withInvite(parts.join("\n"), link, code), "SkorLig Davet");
}

async function doShare(message: string, title: string): Promise<boolean> {
  try {
    const r = await Share.share({ message, title });
    // iOS "dismissedAction" döndürür; Android her zaman sharedAction verir
    return r.action !== Share.dismissedAction;
  } catch {
    return false;
  }
}
