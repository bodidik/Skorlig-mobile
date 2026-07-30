/**
 * SUNUCU HATA KODU → KULLANICI CÜMLESİ.
 *
 * ⚠️ NEDEN VAR: ekranlar sunucudan gelen kodu olduğu gibi basıyordu —
 * "LIVE2_SCHEDULE_FAILED", "LC_NOT_ENOUGH", "STATE_NOT_FOUND". Kullanıcı bunu
 * okuyamaz; okuyamadığı bir hatada yapabileceği bir şey de yoktur, çıkar.
 *
 * İKİ İLKE:
 *  1. Her mesaj NE OLDUĞUNU ve mümkünse NE YAPILACAĞINI söyler.
 *  2. Bilinmeyen kod için genel cümle döner — ama ham kod GELİŞTİRMEDE
 *     görünür kalır (`__DEV__`), yoksa hata ayıklamak imkânsızlaşır.
 *
 * Kodlar api/routes/*.cjs içinden toplandı, uydurulmadı.
 */

const SOZLUK: Record<string, string> = {
  // ── Para / cüzdan ────────────────────────────────────────────────
  LC_NOT_ENOUGH: "LC bakiyen yetersiz. Günlük hakkını alabilir ya da başka bir maç seçebilirsin.",
  DAILY_ALREADY_CLAIMED: "Günlük hakkını bugün zaten aldın. Yarın tekrar.",
  WALLET_NOT_FOUND: "Cüzdanın henüz oluşmamış. Bir tahmin yaptığında otomatik açılır.",
  STORE_DISABLED: "Mağaza şu an kapalı.",
  STORE_PROVIDER_NOT_IMPLEMENTED: "Bu ödeme yöntemi henüz aktif değil.",

  // ── Tahmin / maç ─────────────────────────────────────────────────
  MATCH_STARTED: "Maç başladı, tahmin kapandı.",
  MATCH_ALREADY_STARTED: "Maç başladı, tahmin kapandı.",
  NOT_OPEN_YET: "Bu maç tahmine henüz açılmadı. Başlamasına 24 saat kala açılır.",
  FIXTURE_NOT_FOUND: "Maç bulunamadı. Listeye dönüp tekrar dene.",
  STATE_NOT_FOUND: "Maçın durumu henüz gelmedi. Birazdan tekrar dene.",
  SCHEDULE_FAILED: "Maç listesi alınamadı. Aşağı çekerek yenile.",
  LIVE2_SCHEDULE_FAILED: "Maç listesi alınamadı. Aşağı çekerek yenile.",
  OPEN_FAILED: "Açık maçlar alınamadı. Aşağı çekerek yenile.",
  LIVE2_OPEN_FAILED: "Açık maçlar alınamadı. Aşağı çekerek yenile.",

  // ── Turnuva / düello / grup ──────────────────────────────────────
  TOURNAMENT_NOT_FOUND: "Turnuva bulunamadı. Kod doğru mu?",
  TOURNAMENT_FULL: "Turnuva dolu.",
  TOO_MANY_OPEN_DUELS: "Aynı anda bu kadar açık düellon olamaz. Birinin sonuçlanmasını bekle.",
  GROUP_NOT_FOUND: "Grup bulunamadı. Kod doğru mu?",
  SELF_NOT_ALLOWED: "Kendine bu işlemi yapamazsın.",
  NOT_FRIENDS: "Bunun için arkadaş olmanız gerekiyor.",
  NOT_A_MEMBER: "Bu turnuvanın üyesi değilsin.",

  // ── Kimlik / yetki ───────────────────────────────────────────────
  UNAUTHORIZED: "Bu işlem için giriş yapman gerekiyor.",
  AUTH_REQUIRED: "Bu işlem için giriş yapman gerekiyor.",
  USER_REQUIRED: "Bu işlem için giriş yapman gerekiyor.",
  USER_ID_REQUIRED: "Bu işlem için giriş yapman gerekiyor.",
  BAD_USERID: "Kullanıcı bilgisi okunamadı. Çıkıp tekrar giriş yapmayı dene.",
  WRONG_CODE: "Kod yanlış.",
  CODE_EXHAUSTED: "Bu kodun kullanım hakkı dolmuş.",
  INVALID_CODE: "Kod geçersiz.",

  // ── Yönetim (kullanıcı normalde görmez) ──────────────────────────
  ADMIN_TOKEN_REQUIRED: "Bu alana erişim yetkin yok.",
  ADMIN_TOKEN_NOT_CONFIGURED: "Yönetim erişimi yapılandırılmamış.",
};

/** Sunucu doğrulama kodları: "…_REQUIRED", "…_MISSING" → tek ortak cümle. */
function kalipla(kod: string): string | null {
  if (/_REQUIRED$|_MISSING$|^REQ$|^REQUIRED$/.test(kod)) {
    return "Eksik bilgi var. Alanları kontrol edip tekrar dene.";
  }
  if (/_NOT_FOUND$/.test(kod)) return "Aradığın kayıt bulunamadı.";
  if (/_FAILED$|_ERR$/.test(kod)) return "İşlem tamamlanamadı. Birazdan tekrar dene.";
  return null;
}

/**
 * Kodu okunabilir cümleye çevirir.
 *
 * @param kod    sunucudan gelen `error` alanı
 * @param yedek  sözlükte yoksa kullanılacak cümle
 */
export function hataMesaji(kod: unknown, yedek = "Bir şeyler ters gitti. Birazdan tekrar dene."): string {
  const k = String(kod ?? "").trim();
  if (!k) return yedek;

  const cumle = SOZLUK[k] || kalipla(k) || yedek;

  // Ham kod yalnızca geliştirmede görünür: kullanıcıya gürültü, bize gerekli.
  return __DEV__ && !SOZLUK[k] ? `${cumle}  (${k})` : cumle;
}

export default hataMesaji;
