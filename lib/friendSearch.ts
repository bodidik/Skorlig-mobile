/**
 * ARKADAŞ ARAMA — istemci tarafı, SAF ve SINANABİLİR.
 *
 * ⚠️ NEDEN VAR (ölçülen kusur, 2026-09-10 TR40 denetimi, friends.cjs:497):
 * sunucuda `GET /api/friends/search` HAZIR duruyordu — kimlik jetondan,
 * Türkçe-duyarsız desen, engel süzgeci, nickname desteği — ve İSTEMCİDE HİÇ
 * ÇAĞRILMIYORDU. Uygulamanın arkadaş ekleme akışı `POST /api/friends/request`
 * gövdesine girdi alanına yazılan metni doğrudan koyuyordu.
 *
 * ÖLÇÜLDÜ (gerçek routes/friends.cjs sürülerek, bellek-içi Mongo):
 *     girdi alanina yazilan            /request
 *     "Dz87"      (kullanici adi)      400 TO_NOT_REGISTERED
 *     "dz87"                           400 TO_NOT_REGISTERED
 *     "userA"     (ipucunun ORNEGI)    400 TO_NOT_REGISTERED
 *     "xXhSFvM1SFYN3kUYAdMGRaUkPp53"   200 istek gitti
 * Aynı metinler `/search`e verildiğinde "Dz87", "dz87" ve "dz" (ön ek) hepsi
 * kullanıcıyı BULUYORDU.
 *
 * Yani uygulama kullanıcıdan 28 karakterlik Firebase UID'si yazmasını
 * bekliyordu; o kimlik hiçbir ekranda gösterilmiyor ve ipucundaki örnek bile
 * reddediliyordu. Uygulamayı zaten kullanan birini bulmanın yolu yoktu —
 * geriye yalnız dışarıdan davet kodu kalıyordu.
 *
 * ⚠️ NEDEN AYRI MODÜL: `mobile/lib/fetchPolicy.ts` ile aynı gerekçe — React
 * Native bağımlılığı taşımadığı için Node altında `--experimental-strip-types`
 * ile doğrudan yüklenip GERÇEK sunucuya karşı sınanabiliyor. Ekranın içine
 * yazılsaydı yalnızca kaynak tarayan bir nöbetçiyle korunabilirdi.
 *
 * ⚠️ İSTEK YOLU DIŞARIDAN VERİLİYOR (`getir`): `apiFetch` AsyncStorage ve
 * Constants çekiyor, yani Node'da yüklenemez. Bağımlılığı çağırana bırakmak
 * modülü sınanabilir tutuyor.
 */

export type AramaKisi = {
  userId: string;
  name: string;
  flag: string | null;
  totalPoints: number;
  isFriend: boolean;
  pendingIn: boolean;
  pendingOut: boolean;
};

export type AramaSonuc =
  | { durum: "kisa"; items: AramaKisi[] }
  | { durum: "ok"; items: AramaKisi[] }
  | { durum: "hata"; hata: string; items: AramaKisi[] };

/** Sunucuya gitmeden önce istenen en az harf sayısı. */
export const EN_AZ_HARF = 2;

/**
 * Yazılan metin bir Firebase UID'si gibi mi görünüyor?
 *
 * ⚠️ ESKİ AKIŞ KORUNUYOR. Kimliği bir yerden kopyalayıp yapıştıran kullanıcı
 * (destek kaydı, eski ekran görüntüsü) hâlâ doğrudan istek gönderebilmeli.
 * Arama bu yolu KAPATMIYOR, üstüne ekliyor.
 */
export function kimlikGibiMi(s: string): boolean {
  return /^[A-Za-z0-9_-]{20,}$/.test(String(s || "").trim());
}

/** Sunucudan gelen bir satırı savunmacı biçimde normalleştirir. */
function satir(x: any): AramaKisi | null {
  const userId = String(x?.userId ?? "").trim();
  if (!userId) return null;
  return {
    userId,
    name: String(x?.name ?? userId).trim() || userId,
    flag: x?.flag ?? null,
    totalPoints: Number(x?.totalPoints ?? 0) || 0,
    isFriend: !!x?.isFriend,
    pendingIn: !!x?.pendingIn,
    pendingOut: !!x?.pendingOut,
  };
}

/**
 * Kullanıcı arar.
 *
 * @param q      Girdi alanına yazılan metin.
 * @param getir  `apiFetch` benzeri: yol alır, `.json()` taşıyan yanıt döner.
 * @param limit  En fazla sonuç (sunucu 50 ile sınırlıyor).
 *
 * ⚠️ KISA SORGU SUNUCUYA GİTMEZ. Her tuş vuruşunda tek harflik sorgu atmak
 * hem hız sınırını yer hem de neredeyse tüm kullanıcı listesini döndürür.
 * Bu durum `hata` DEĞİL, ayrı bir durum: ekran "en az 2 harf" diyebilsin.
 */
export async function kisiAra(
  q: string,
  getir: (yol: string) => Promise<{ json: () => Promise<any> }>,
  limit = 20
): Promise<AramaSonuc> {
  const terim = String(q || "").trim();
  if (terim.length < EN_AZ_HARF) return { durum: "kisa", items: [] };

  try {
    const yol = `/api/friends/search?q=${encodeURIComponent(terim)}&limit=${encodeURIComponent(String(limit))}`;
    const j = await (await getir(yol)).json();

    /* apiFetch fırlatmaz, `{ ok:false, error:… }` döner (bkz. lib/apiFetch
     * govdeyiGuvenliYap notu) — o yüzden burada `ok` alanına bakılıyor. */
    if (!j || j.ok !== true) {
      return { durum: "hata", hata: String(j?.error || "BAD_JSON"), items: [] };
    }

    const items: AramaKisi[] = [];
    for (const ham of Array.isArray(j.items) ? j.items : []) {
      const s = satir(ham);
      /* Engellenmiş taraf sunucuda zaten eleniyor; burada da elemek iki
       * katman değil, sunucu bir gün gevşerse ekranın sessizce açılmaması. */
      if (s && !ham?.blockedByMe && !ham?.blockedMe) items.push(s);
    }
    return { durum: "ok", items };
  } catch (e: any) {
    return { durum: "hata", hata: String(e?.message || e || "NETWORK"), items: [] };
  }
}
