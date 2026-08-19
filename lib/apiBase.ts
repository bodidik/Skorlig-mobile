import Constants from "expo-constants";
import {
  yerelAdresMi, ilanEdilenAdresKarari, guvenliBaseSec,
} from "./apiBaseKurallari";
import { NativeModules, Platform } from "react-native";

let resolvedBase: string | null = null;

/**
 * API_BASE çözümleme stratejisi.
 *
 * ÖNCELİK KURALI (2026-07-29'da düzeltildi):
 *   1) AÇIK yapılandırma UZAK bir adres ise (https://... ya da alan adı)
 *      her zaman kazanır — geliştirici bilerek production/staging seçmiştir.
 *   2) DEV modda: Metro'nun LAN IP'si -> http://<ip>:4102
 *   3) EXPO_PUBLIC_API_BASE / app.json extra.apiBase (LAN IP biçiminde olabilir)
 *   4) localhost
 *
 * NEDEN BU SIRA: Eskiden DEV dalı EN BAŞTAYDI ve açık yapılandırmayı koşulsuz
 * eziyordu. `.env` production'ı gösterse bile uygulama `http://192.168.x.x:4102`
 * deniyordu. Telefon **mobil veriye** geçtiğinde (ya da farklı ağdayken) o
 * adrese ulaşmak imkânsız — uygulama tamamen ölü görünüyordu:
 * "Network request failed", her ekranda. Yaşandı ve teşhisi zaman aldı çünkü
 * sunucu ayakta, API sağlıklı, sorun yalnızca ADRESTEYDİ.
 *
 * Otomatik LAN tespiti korunuyor: asıl amacı `.env`'de BAYATLAMIŞ bir LAN IP
 * varken ağ değişince elle güncelleme derdini kaldırmaktı. O yüzden yalnızca
 * yapılandırma da yerel bir adres gösteriyorsa (ya da hiç yoksa) devreye girer.
 */

/* Yerel adres tespiti ve adres kabul kuralları SAF ÇEKİRDEKTE:
 * lib/apiBaseKurallari.ts — bu dosya expo-constants ve react-native içe
 * aktardığı için Node altında yüklenemiyor ve kurallar hiç ölçülemiyordu.
 * İkisi de üretimde kesintiye yol açmıştı. */
const isLocalAddress = yerelAdresMi;

function resolveApiBase(): string {
  const pick = (x?: string | null) =>
    x && String(x).trim() ? String(x).trim() : "";

  const envBase0 = pick(process.env.EXPO_PUBLIC_API_BASE);
  const extraBase0 = pick(
    (Constants?.expoConfig?.extra?.apiBase as string) ||
      (Constants as any)?.manifest?.extra?.apiBase
  );

  // `EXPO_PUBLIC_API_BASE=auto` → "yerel makinemdeki API'yi bul".
  //
  // NEDEN AYRI ANAHTAR: Yerel sunucuya dönmek için hem .env'i hem app.json'u
  // elle yorumlamak gerekiyordu (ikisi de production'ı gösteriyor) ve sonra
  // geri almayı unutmak kolay. Tek satırla gidip gelmek için açık bir değer.
  const otomatikIstendi = /^(auto|lan|local)$/i.test(envBase0);
  const acikBase = otomatikIstendi ? "" : envBase0 || extraBase0;

  // 1) Açıkça UZAK bir adres verilmişse otomatik tespit devreye GİRMEZ.
  //    Geliştirici production/staging'e bakmak istiyor demektir.
  if (acikBase && !isLocalAddress(acikBase)) return acikBase;

  // Web: sayfa hangi host'tan servis ediliyorsa API de o makinede (4102) varsayılır.
  //
  // ⚠️ `typeof window !== "undefined"` İLE KONTROL ETMEYİN. React Native'de
  // `window` TANIMLIDIR ve `window.location.hostname` "localhost" döner. O
  // koşul kullanıldığında bu dal TELEFONDA da çalışıyor, adres koşulsuz
  // `http://localhost:4102` oluyor ve altındaki hiçbir kod (scriptURL tespiti,
  // .env, app.json) devreye giremiyordu. Uygulama her ekranda
  // "Network request failed" veriyordu ve sebebi görünmüyordu — bu tuzak
  // saatlerce yanlış katmanlarda arattı.
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.hostname) {
    return `http://${window.location.hostname}:4102`;
  }

  if (__DEV__) {
    const C = Constants as any;
    // EN GÜVENİLİR KAYNAK ÖNCE: paketin indirildiği adres.
    //
    // `NativeModules.SourceCode.scriptURL` uygulamanın JS paketini HANGİ
    // sunucudan aldığını söyler (örn. "http://192.168.43.245:8081/index.bundle").
    // Uygulama çalışıyorsa bu adres tanım gereği erişilebilirdir — API de aynı
    // makinede olduğu için doğru IP budur.
    //
    // NEDEN ÖNCE BU: Expo'nun `hostUri`/`debuggerHost` alanları ÖZEL GELİŞTİRME
    // DERLEMELERİNDE (dev client) boş dönüyor. Bu projede Google girişi Expo
    // Go'da çalışmadığı için dev client kullanılıyor — yani o alanlar hep boştu,
    // uygulama sessizce localhost'a düşüyor ve her ekranda
    // "Network request failed" veriyordu.
    //
    // Ayrıca ağ değişince IP de değişir (ölçüldü: 192.168.0.58 → 192.168.43.245).
    // scriptURL her zaman GÜNCEL adresi verir; .env'e yazılan IP bayatlar.
    const scriptURL = String(
      (NativeModules as any)?.SourceCode?.scriptURL || ""
    );

    // Expo sürümleri kalan bilgiyi farklı yerlerde tutuyor; tek bir yola
    // güvenmek sessiz başarısızlık demek.
    const adaylar: string[] = [
      scriptURL,
      C?.expoConfig?.hostUri,
      C?.expoGoConfig?.debuggerHost,
      C?.manifest2?.extra?.expoClient?.hostUri,
      C?.manifest?.debuggerHost,
      C?.manifest?.hostUri,
      C?.manifest2?.extra?.expoClient?.debuggerHost,
      C?.experienceUrl,
      C?.linkingUri,
    ].filter(Boolean).map(String);

    for (const aday of adaylar) {
      // "exp://192.168.0.58:8081", "192.168.0.58:8081" gibi biçimlerden IP çek
      const m = aday.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
      if (m) return `http://${m[1]}:4102`;
    }

    if (otomatikIstendi) {
      // Açıkça "auto" istendi ama IP bulunamadı — sessizce localhost'a düşmek
      // "Network request failed" olarak görünür ve sebebi anlaşılmaz.
      //
      // ⚠️ EN SIK SEBEP: USB BAĞLANTISI. Telefon Metro'ya USB üzerinden
      // bağlıysa scriptURL "http://localhost:8081/..." olur ve içinden IP
      // ÇIKMAZ — bu bir hata değil, adb reverse'in doğal sonucu. O modda
      // `localhost:4102` DOĞRU adrestir; eksik olan tek şey API portunun da
      // yönlendirilmesidir. Metro yalnızca 8081'i otomatik yönlendirir.
      // Yaşandı (2026-07-29): uygulama açıldı ama tek maç gelmedi; sebep
      // buydu ve hiçbir mesaj bunu söylemiyordu.
      const usbGibi = adaylar.some((a) => /localhost|127\.0\.0\.1/.test(a));
      if (usbGibi) {
        console.warn(
          "[apiBase] Metro'ya USB uzerinden bagli gorunuyorsun (scriptURL localhost). " +
            "API portu da yonlendirilmeli, yoksa hicbir veri gelmez. " +
            "Calistir:  adb reverse tcp:4102 tcp:4102  " +
            "Sonra uygulamayi yeniden yukleyin."
        );
      } else {
        console.warn(
          "[apiBase] EXPO_PUBLIC_API_BASE=auto ama Metro IP'si bulunamadi. " +
            "Bakilan alanlar bos. .env'e adresi elle yazin: " +
            "EXPO_PUBLIC_API_BASE=http://<bilgisayar-ip>:4102"
        );
      }
    }
  }

  // 3) Yerel biçimdeki açık yapılandırma (bayat LAN IP olabilir; otomatik
  //    tespit başarısızsa yine de deneriz).
  if (acikBase) return acikBase;

  return "http://localhost:4102";
}

/**
 * YAYIN DERLEMESİ KORUMASI.
 *
 * `EXPO_PUBLIC_*` değişkenleri paket derlenirken KODUN İÇİNE gömülür. Geliştirme
 * sırasında `.env`'de LAN IP tutmak normaldir (`http://192.168.0.58:4102`) —
 * ama o hâlde alınan bir YAYIN derlemesi, tüm kullanıcılarda ulaşılamayan bir
 * özel ağ adresini arar. Uygulama herkeste tamamen ölü çıkar ve bu ancak
 * mağazadan indirildikten sonra fark edilir.
 *
 * Bu yüzden production derlemesinde yerel adres KABUL EDİLMEZ: app.json'daki
 * uzak adrese düşülür. app.json da yerelse hata net biçimde loglanır —
 * sessizce kırık bir sürüm yayınlamaktan iyidir.
 */
function guvenliBase(aday: string): string {
  const uzakYedek =
    (Constants?.expoConfig?.extra?.apiBase as string) ||
    (Constants as any)?.manifest?.extra?.apiBase ||
    "";

  const karar = guvenliBaseSec(aday, String(uzakYedek || ""), !!__DEV__);

  if (karar.durum === "yedege-dusuldu") {
    console.warn(
      `[apiBase] YAYIN derlemesinde yerel adres (${aday}) yok sayildi; ` +
        `app.json'daki ${karar.base} kullaniliyor.`
    );
  } else if (karar.durum === "yedek-yok") {
    console.error(
      `[apiBase] YAYIN derlemesi YEREL adrese isaret ediyor (${aday}) ve uzak ` +
        `yedek yok. Uygulama sunucuya ULASAMAZ. .env'deki ` +
        `EXPO_PUBLIC_API_BASE degerini derlemeden once production adresi yapin.`
    );
  }

  return karar.base;
}

// guvenliBase: yayın derlemesinde yerel adrese düşmeyi engeller (bkz. yukarı).
const FALLBACK_BASE = guvenliBase(resolveApiBase());

/**
 * TEŞHİS: hangi kaynaktan ne geldiği tek satırda.
 *
 * NEDEN KALICI: Bu dosyanın yanlış adres seçmesi "Network request failed"
 * olarak görünüyor ve sebebi hiçbir yerde yazmıyordu. Bir kurulumda gün
 * kaybettirdi: Windows'ta KALICI bir ortam değişkeni `.env` dosyasını tamamen
 * etkisiz kılıyordu, Expo'nun `hostUri` alanı özel derlemede boş dönüyordu ve
 * makinenin IP'si değişmişti — üçü aynı anda. Hiçbiri loglanmıyordu.
 */
try {
  const C = Constants as any;
  console.log(
    "[apiBase] secilen:", FALLBACK_BASE,
    "| __DEV__:", typeof __DEV__ !== "undefined" ? __DEV__ : "?",
    "| env:", JSON.stringify(process.env.EXPO_PUBLIC_API_BASE ?? null),
    "| app.json:", JSON.stringify(C?.expoConfig?.extra?.apiBase ?? null),
    "| scriptURL:", JSON.stringify(
      String((NativeModules as any)?.SourceCode?.scriptURL || "").slice(0, 60) || null
    ),
    "| hostUri:", JSON.stringify(C?.expoConfig?.hostUri ?? null)
  );
} catch {}

export async function getApiBase(): Promise<string> {
  if (resolvedBase) return resolvedBase;

  resolvedBase = FALLBACK_BASE;

  try {
    const r = await fetch(`${resolvedBase}/api/runtime/config`);
    const j = await r.json();
    if (j?.ok && j.apiBase) {
      const aday = String(j.apiBase).trim();
      /* ⚠️ SUNUCUNUN İLAN ETTİĞİ ADRESE KOŞULSUZ GÜVENİLMEZ.
       *
       * YAŞANDI (2026-08-09, üretim): sunucuda trust proxy yoktu, config
       * `apiBase: "http://skorlig87.onrender.com"` döndü. Buradaki eski kod
       * https adresimizi o değerle EZDİ; Android yayın derlemesi cleartext
       * HTTP'yi engellediği için sonraki her istek öldü — "hiçbir alanda
       * maç yok". İki kural:
       *   1. https → http DÜŞÜŞÜ hiçbir modda kabul edilmez.
       *   2. Yayın derlemesinde yalnızca https kabul edilir. */
      const karar = ilanEdilenAdresKarari(resolvedBase, aday, !!__DEV__);
      if (karar.kabul) {
        resolvedBase = aday;
      } else if (karar.sebep !== "bos") {
        console.warn(
          `[apiBase] sunucunun ilan ettigi adres reddedildi (${aday}, ` +
          `sebep: ${karar.sebep}); ${resolvedBase} kullaniliyor.`
        );
      }
    }
  } catch (e) {
    console.warn(`[apiBase] "${resolvedBase}" adresine ulaşılamadı, bu adresle devam ediliyor:`, e);
  }

  return resolvedBase;
}

export function resetApiBase() {
  resolvedBase = null;
}

/* =========================================================
  ⏱️ SERVER TIME SYNC  (NİHAİ EKLEME – BURADAN SONRASI YENİ)
   ========================================================= */

let serverOffsetMs = 0;

// ===== Server time sync (client) =====
export async function syncServerTime() {
  try {
    const base = await getApiBase();
    const r = await fetch(`${base}/health`);
    const j = await r.json();

    if (j?.ts) {
      const serverMs = new Date(j.ts).getTime();
      const localMs = Date.now();
      if (Number.isFinite(serverMs)) {
        serverOffsetMs = serverMs - localMs;
        return;
      }
    }
    serverOffsetMs = 0;
  } catch {
    serverOffsetMs = 0;
  }
}

export function nowFromServer(): number {
  return Date.now() + serverOffsetMs;
}
