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
  // Sunucu JSON yerine baska bir sey dondurdu (Render 502 HTML sayfasi,
  // sogumus kapta bos govde). Kullanicinin yapabilecegi tek sey beklemek.
  BAD_JSON: "Sunucudan beklenmeyen bir yanıt geldi. Birazdan tekrar dene.",
  EMPTY_RESPONSE: "Sunucu boş yanıt döndü. Birazdan tekrar dene.",
  NETWORK: "Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.",
  STORE_DISABLED: "Mağaza şu an kapalı.",
  STORE_PROVIDER_NOT_IMPLEMENTED: "Bu ödeme yöntemi henüz aktif değil.",

  // ── Tahmin / maç ─────────────────────────────────────────────────
  MATCH_STARTED: "Maç başladı, tahmin kapandı.",
  MATCH_ALREADY_STARTED: "Maç başladı, tahmin kapandı.",

  // ── Maç havuzu ───────────────────────────────────────
  MATCH_LOCKED: "Maç başladı, bahis kapandı.",
  LOCKED_BEFORE_KICKOFF: "Maç başlamak üzere, bahis kapandı.",
  POOL_SETTLED: "Bu maçın havuzu dağıtıldı.",
  SIDE_LOCKED: "Taraf değiştiremezsin — aynı tarafa ekleyebilirsin.",
  OVER_CAP: "Bahis tavanını aştın. Havuz büyüdükçe tavan da yükselir.",
  MIN_BET: "Bahis en az bu tutardan başlar.",
  BOT_NOT_ALLOWED: "Bu hesap havuza katılamaz.",
  NOT_OPEN_YET: "Bu maç tahmine henüz açılmadı. Başlamasına 24 saat kala açılır.",
  FIXTURE_NOT_FOUND: "Maç bulunamadı. Listeye dönüp tekrar dene.",
  NO_FIXTURE: "Maç seçilmedi.",
  STATE_NOT_FOUND: "Maçın durumu henüz gelmedi. Birazdan tekrar dene.",
  SCHEDULE_FAILED: "Maç listesi alınamadı. Aşağı çekerek yenile.",
  LIVE2_SCHEDULE_FAILED: "Maç listesi alınamadı. Aşağı çekerek yenile.",
  OPEN_FAILED: "Açık maçlar alınamadı. Aşağı çekerek yenile.",
  LIVE2_OPEN_FAILED: "Açık maçlar alınamadı. Aşağı çekerek yenile.",

  // ── Turnuva / düello / grup ──────────────────────────────────────
  // Duello kilidi artik kapali basarisizlik: bilinmeyen/dogrulanamayan mac
  // icin bahis acilamaz (deploy sonrasi durum dosyalari silindigi icin
  // eskiden gecmis maclar "acik" gorunuyordu).
  FIXTURE_CHECK_FAILED: "Maç bilgisi doğrulanamadı. Birazdan tekrar dene.",
  NO_KICKOFF: "Bu maçın başlama saati belli değil, bahse açılamaz.",
  BAD_KICKOFF: "Bu maçın başlama saati okunamadı, bahse açılamaz.",
  DUEL_LOCKED_BEFORE_KICKOFF: "Maç başlamak üzere, düello kapandı.",
  MATCH_TOO_LOPSIDED:
    "Bu maç çok tek taraflı, düelloya kapalı. Sürpriz sonucu tek maç tahmininde oynayabilirsin.",
  TOURNAMENT_NOT_FOUND: "Turnuva bulunamadı. Kod doğru mu?",
  TOURNAMENT_FULL: "Turnuva dolu.",
  TOO_MANY_OPEN_DUELS: "Aynı anda bu kadar açık düellon olamaz. Birinin sonuçlanmasını bekle.",
  GROUP_NOT_FOUND: "Grup bulunamadı. Kod doğru mu?",
  SELF_NOT_ALLOWED: "Kendine bu işlemi yapamazsın.",
  NOT_FRIENDS: "Bunun için arkadaş olmanız gerekiyor.",
  NOT_A_MEMBER: "Bu turnuvanın üyesi değilsin.",
  // Turnuva giriş ücreti artık gerçekten tahsil ediliyor (önceden bedavaydı ve
  // havuz karşılıksız büyüyordu) — yani bu hata artık görülebilir.
  INSUFFICIENT_LC: "LigCoin'in yetmiyor. Bakiyeni artırıp tekrar dene.",
  ENTRY_CHARGE_FAILED: "Giriş ücreti alınamadı. Bakiyen değişmedi, tekrar dene.",
  WALLET_UNAVAILABLE: "Cüzdana şu an ulaşılamıyor. Birazdan tekrar dene.",
  ALREADY_JOINED: "Bu turnuvaya zaten katıldın.",
  TOO_MANY_OPEN_MINI:
    "Aynı anda bu kadar bitmemiş mini turnuvan olamaz. Birinin maçları oynanıp bitmesini bekle.",

  /* ⚠️ Aynı maçlarla ikinci turnuva ödülü ÇOĞALTIYORDU: tek tahmin seti iki
   * kez 20 LC alıyordu. Kullanıcıya ne yapacağını söylüyoruz — "bir şeyler
   * ters gitti" demek, engelin nedenini gizler. */
  AYNI_MAC_SETI_ACIK:
    "Bu maçlarla zaten açık bir turnuvan var. Bitmesini bekle ya da farklı maçlar seç.",

  // ── Kimlik / yetki ───────────────────────────────────────────────
  UNAUTHORIZED: "Bu işlem için giriş yapman gerekiyor.",
  AUTH_REQUIRED: "Bu işlem için giriş yapman gerekiyor.",
  USER_REQUIRED: "Bu işlem için giriş yapman gerekiyor.",
  USER_ID_REQUIRED: "Bu işlem için giriş yapman gerekiyor.",
  BAD_USERID: "Kullanıcı bilgisi okunamadı. Çıkıp tekrar giriş yapmayı dene.",
  WRONG_CODE: "Kod yanlış.",
  CODE_EXHAUSTED: "Bu kodun kullanım hakkı dolmuş.",
  INVALID_CODE: "Kod geçersiz.",
  // Sunucuda grup kodu tanımlı değil. Kullanıcının yapabileceği bir şey yok;
  // "kod yanlış" demek onu boşuna yeniden denemeye iter.
  GROUP_CODE_NOT_CONFIGURED:
    "1987GS kod doğrulaması şu an kapalı. Bu bizden kaynaklı, birazdan tekrar dene.",

  // ── Yönetim (kullanıcı normalde görmez) ──────────────────────────
  ADMIN_TOKEN_REQUIRED: "Bu alana erişim yetkin yok.",
  ADMIN_TOKEN_NOT_CONFIGURED: "Yönetim erişimi yapılandırılmamış.",
  // ── Düello ───────────────────────────────────────────────────────
  CANNOT_CHALLENGE_YOURSELF: "Kendine düello açamazsın.",
  INVALID_STAKE: "Bahis tutarı sınırların dışında.",
  NOT_OPEN: "Bu düello artık açık değil — başkası kabul etmiş olabilir.",
  CONCURRENT_WRITE: "Aynı anda başka bir işlem oldu. Tekrar dene.",

  // ── Mini turnuva ─────────────────────────────────────────────────
  CANNOT_INVITE_SELF: "Kendini davet edemezsin.",
  FIXTURE_COUNT_INVALID: "Seçilen maç sayısı uygun değil.",

  // ── Kupon ────────────────────────────────────────────────────────
  KUPON_KAPALI: "Kupon kapandı, artık tahmin girilemez.",
  GECERSIZ_TUR: "Geçersiz kupon türü.",

  // ── Arkadaş / davet ──────────────────────────────────────────────
  BLOCKED: "Bu kullanıcıyla iletişim engellenmiş.",
  CANNOT_USE_OWN_CODE: "Kendi davet kodunu kullanamazsın.",
  FROM_NOT_REGISTERED: "Gönderen hesap kayıtlı değil.",
  TO_NOT_REGISTERED: "Bu kullanıcı henüz kayıtlı değil.",

  // ── Takma ad ─────────────────────────────────────────────────────
  NICKNAME_TAKEN: "Bu takma ad alınmış, başka bir tane dene.",
  NICKNAME_INVALID: "Takma adda kullanılamayan karakter var.",
  NICKNAME_LENGTH: "Takma ad uzunluğu uygun değil.",
  NICKNAME_RESERVED: "Bu takma ad kullanılamaz.",

  // ── Cüzdan / günlük hak ──────────────────────────────────────────
  BALANCE_ABOVE_FLOOR: "Bakiyen yeterli olduğu için bugün günlük hak verilmiyor. Bakiyen düşünce tekrar alabilirsin.",
  LC_WALLET_DAILY_CONFLICT: "Günlük hak işlenirken çakışma oldu. Tekrar dene.",

  // ── Tahmin ───────────────────────────────────────────────────────
  MICRO_LOCKED_RED: "Kırmızı kart görüldüğü için bu tahmin kapandı.",
  MICRO_LOCKED_PENALTY: "Penaltı verildiği için bu tahmin kapandı.",
  SCORE_MUST_BE_NUMBERS: "Skor alanlarına sayı gir.",
  FORBIDDEN_OTHER_USER: "Yalnızca kendi kaydına erişebilirsin.",
  INVALID_INPUT: "Girilen bilgi geçersiz.",

  // ── Ülke / altyapı ───────────────────────────────────────────────
  COUNTRY_NOT_SUPPORTED: "Bu ülke henüz desteklenmiyor.",
  NO_DB: "Veritabanına şu an ulaşılamıyor. Birazdan tekrar dene.",
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
