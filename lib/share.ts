import { Share } from "react-native";
import { apiFetch } from "./apiFetch";
import { getApiBase } from "./apiBase";
import { davetLinkiKur, type DavetHedefi } from "./davetLinkKurallari";

/**
 * PAYLAŞIM METİNLERİ VE DAVET HALKASI
 *
 * Her paylaşım kullanıcının davet kodunu taşır. Kod olmadan paylaşım viral
 * döngü kurmaz: yeni gelen kişi uygulamayı indirse bile kimin davetiyle
 * geldiği bilinmez, ikisi de LC ödülünü alamaz ve paylaşan kişi bir daha
 * paylaşmaz.
 *
 * ⚠️ EKSİK HALKA KAPATILDI (20 Eylül 2026). Bu başlık bir dönem şöyle
 * diyordu: *"Play Store listesi yayına girince buraya bir https iniş sayfası
 * eklenmeli … O olmadan kurulu olmayan kişi kodu elle yazmak zorunda ve
 * dönüşüm düşük kalır."* Dönüşüm ölçüldü ve tahminden kötüydü:
 * **129 davet kodu, 0 kullanım** (13 Eylül).
 *
 * Artık paylaşılan bağlantı `https://<api>/d/<KOD>` — sunucudaki iniş sayfası
 * (`api/routes/davet.cjs`). Uygulaması olan kişiyi `skorlig://` ile içeri
 * alıyor, olmayanı mağazaya götürüyor ve kodu ekranda kopyalanabilir
 * tutuyor. Derin bağlantı YEDEK olarak duruyor: kod alınamazsa `/d/` kurulamaz.
 *
 * ⚠️ ADRES `getApiBase()`TEN GELİYOR. Geliştirme derlemesinde bu bir LAN
 * adresi olabilir (`http://192.168.x.x:4102`) ve öyle bir bağlantı ağ
 * dışında açılmaz. Üretim derlemesinde `extra.apiBase` geçerli — paylaşım
 * üretimde yapıldığı için kabul edilen bir sınır, gizli bir kusur değil.
 */

const SCHEME = "skorlig://";

/**
 * İniş sayfası bağlantısı — kural gövdesi `lib/davetLinkKurallari.ts`te.
 *
 * ⚠️ GÖVDE NEDEN ORADA: bu dosya `react-native` ve `./apiBase` içe aktardığı
 * için Node altında YÜKLENEMİYOR; kural burada kalsaydı hiç ölçülemezdi.
 * Aynı ayrım `apiBaseKurallari.ts`te de yapıldı ve o başlıkta gerekçesi
 * yazılı (ölçülemeyen kurallar iki kez üretimde kesinti yaptı).
 *
 * ⚠️ `getApiBase()` ASENKRON. İlk yazımda `String(getApiBase() || "")` diye
 * çağırmıştım: `String(Promise)` `"[object Promise]"` veriyor ve tsc bunu
 * YAKALAMIYOR (String her şeyi kabul eder). Paylaşılan her bağlantı
 * `[object Promise]/d/KOD` olurdu — yani düzeltmenin kendisi, düzelttiği
 * kusurdan beter bir şey üretirdi. Kuralı saf çekirdeğe ayırınca tip
 * uyuşmazlığı ortaya çıktı ve derleme durdu.
 */
const davetLinki = async (code: string | null, hedef: DavetHedefi = {}) =>
  davetLinkiKur(await getApiBase(), code, hedef);

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

/**
 * Paylaşım metninin sonuna bağlantıyı ekler.
 *
 * ⚠️ "KODU ELLE YAZ" CÜMLESİ KALDIRILDI. Mesaj bir dönem şunu taşıyordu:
 * *"Uygulama yoksa: indirdikten sonra Profil → Davet Kodu Gir bölümüne ABC123
 * yaz — ikimiz de +15 LC kazanırız."* Alıcıya ödev veren bu cümle ölçülen
 * dönüşümün (129 kod / 0 kullanım) bir parçasıydı; artık aynı yönlendirme
 * iniş sayfasında, kopyalanabilir kodun YANINDA duruyor.
 *
 * Bağlantı https ise (iniş sayfası) hiçbir ek cümle gerekmiyor. Derin
 * bağlantıya düşüldüyse (kod alınamadı) kod da yok, yani yazılacak bir şey
 * yok — eski cümlenin `if (code)` koşulu zaten bunu söylüyordu.
 */
function withInvite(body: string, link: string): string {
  return [body, "", link].join("\n");
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

  /* İniş sayfası önce; kod alınamadıysa eski derin bağlantıya düşülür. */
  const link =
    (await davetLinki(code, { y: "predict", m: match.fixtureId })) ??
    deepLink("predict", { fixtureId: match.fixtureId, ref: code || undefined });
  return doShare(withInvite(parts.join("\n"), link), "SkorLig Tahmin");
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

  const link =
    (await davetLinki(code, { y: "race", m: match.fixtureId })) ??
    deepLink("match-race/" + encodeURIComponent(match.fixtureId), {
      ref: code || undefined,
    });
  return doShare(withInvite(parts.join("\n"), link), "SkorLig Sonuç");
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

  const link =
    (await davetLinki(code, { y: "duel", d: duelId })) ??
    deepLink("duel", { duelId, ref: code || undefined });
  return doShare(withInvite(parts.join("\n"), link), "SkorLig Düello");
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
  const link = (await davetLinki(code)) ?? deepLink("", { ref: code });
  return doShare(withInvite(parts.join("\n"), link), "SkorLig Davet");
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
