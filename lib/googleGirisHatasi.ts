/**
 * GOOGLE GİRİŞ HATASI → OKUNABİLİR CÜMLE + GÖRÜNÜR KOD.
 *
 * ⚠️ NEDEN VAR: mağaza sürümünde Google girişi bir kez bile sürülemedi ve
 * sürülse de ÖLÇÜLEMEZDİ. Üç çağrı yerinin üçü de hatayı yutuyordu:
 * `login.tsx` `catch {}` ile düğmeyi geri gösteriyor, `GuestBanner`
 * "tekrar dene" yazıyor, `predict.tsx` ise `.catch(() => {})`. Play'den
 * kurulmuş bir derlemede giriş DEVELOPER_ERROR ile düşse bile ekranda
 * "iptal ettin" ile aynı şey görünüyordu.
 *
 * ⚠️ MAĞAZA TUZAĞI — DEVELOPER_ERROR (kod 10): EAS paketi YÜKLEME anahtarıyla
 * imzalar, Google Play sonra KENDİ uygulama imzalama anahtarıyla YENİDEN
 * imzalar. Cihazdaki imza parmak izi bu yüzden dâhilî APK'dakinden farklıdır.
 * Google Cloud'da `com.skorlig` için yalnız yükleme anahtarının SHA-1'i kayıtlı
 * ise giriş dâhilî derlemede ÇALIŞIR, mağaza derlemesinde kod 10 ile düşer.
 * Bu tam olarak elimizde ölçülemeyen durumdu.
 *
 * ⚠️ ANDROID KODLARI SAYIDIR, METİN DEĞİL. Kütüphanenin yerel katmanı
 * (`ErrorDto.kt`) `statusCode` tamsayısını DİZEYE çevirip veriyor: "10",
 * "12501", "7"… `statusCodes` sabitinde v16'da DEVELOPER_ERROR YOK, o yüzden
 * sayılar burada elle karşılanıyor (kaynak: GoogleSignInStatusCodes).
 *
 * İLKE: kod HER ZAMAN cümlenin sonunda görünür — `hataMesaji.ts`'nin aksine
 * yalnız `__DEV__`'de değil. Mağaza derlemesinde elimizdeki TEK ölçü aleti
 * testçinin ekran görüntüsü.
 */

export type GirisHatasi = {
  /** Kullanıcı vazgeçti — hiçbir şey gösterme. */
  sessiz: boolean;
  /** Ham kod ("10", "auth/…", "YOK"). */
  kod: string;
  /** Kullanıcıya gösterilecek cümle; kod sonunda parantez içinde. */
  mesaj: string;
};

/* Kullanıcının vazgeçmesi: Android "12501", iOS "-5", kütüphane metni. */
const IPTAL = new Set(["12501", "-5", "SIGN_IN_CANCELLED", "16"]);

const SOZLUK: Record<string, string> = {
  // Cihazın imzası Google'da kayıtlı değil / istemci kimliği uyuşmuyor.
  // Kullanıcının yapabileceği bir şey YOK — "tekrar dene" demek yalan olur.
  "10": "Google girişi bu sürümde yapılandırılmamış. Bu bizim tarafımızda bir ayar eksiği; lütfen aşağıdaki kodu bize bildir.",
  "7": "İnternet bağlantısı kurulamadı. Bağlantını kontrol edip tekrar dene.",
  "8": "Google tarafında geçici bir hata oldu. Birazdan tekrar dene.",
  "2": "Google Play Hizmetleri güncel değil. Güncelleyip tekrar dene.",
  "4": "Google oturumu bulunamadı. Tekrar dene.",
  "12500": "Google girişi tamamlanamadı. Birazdan tekrar dene.",
  "12502": "Google girişi zaten sürüyor, bekle.",
  PLAY_SERVICES_NOT_AVAILABLE: "Google Play Hizmetleri bu cihazda yok ya da güncel değil.",
  IN_PROGRESS: "Google girişi zaten sürüyor, bekle.",
  // Expo Go'da yerel modül yok — geliştirme derlemesi gerekir.
  EXPO_GO: "Google girişi Expo Go'da kullanılamaz, development build gerekiyor.",
  // Kod 10'un Firebase tarafındaki eşleniği değil ama aynı sınıf: yapılandırma.
  "auth/invalid-credential": "Google kimliği doğrulanamadı. Lütfen aşağıdaki kodu bize bildir.",
  "auth/account-exists-with-different-credential": "Bu e-posta başka bir giriş yöntemiyle kayıtlı.",
  "auth/network-request-failed": "İnternet bağlantısı kurulamadı. Bağlantını kontrol edip tekrar dene.",
};

const YEDEK = "Google girişi tamamlanamadı. Lütfen aşağıdaki kodu bize bildir.";

/**
 * @param e         yakalanan hata
 * @param iptalKodu `statusCodes.SIGN_IN_CANCELLED` — çalışma anındaki gerçek
 *                  sabit. Kütüphane yüklenmemişse `undefined` gelir; o zaman
 *                  KODSUZ hata iptal SAYILMAZ (eski kod `undefined === undefined`
 *                  ile her kodsuz hatayı sessizce yutuyordu).
 */
export function googleGirisHatasi(e: unknown, iptalKodu?: unknown): GirisHatasi {
  const ham = (e as any)?.code;
  const kod = ham === undefined || ham === null || ham === "" ? "" : String(ham);

  if (kod && (IPTAL.has(kod) || (iptalKodu != null && kod === String(iptalKodu)))) {
    return { sessiz: true, kod, mesaj: "" };
  }

  const gorunen = kod || "YOK";
  return { sessiz: false, kod: gorunen, mesaj: `${SOZLUK[kod] || YEDEK}  (kod ${gorunen})` };
}

export default googleGirisHatasi;
