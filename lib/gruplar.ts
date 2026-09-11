/**
 * GRUPLAR — istemci tarafı, SAF ve SINANABİLİR.
 *
 * ⚠️ ÖLÇÜLEN KUSUR (2026-09-10 TR40 denetimi, me.tsx:840 ve me.tsx:843 —
 * ikisi de "kritik", 3/3 oy): sunucuda tam çalışan bir grup özelliği var ve
 * istemci onun YALNIZCA İKİ ucunu çağırıyordu.
 *
 * ÖLÇÜLDÜ (`grep -rn "groups/" mobile/app mobile/components mobile/lib`):
 *     me.tsx:505  GET  /api/users/groups/list
 *     me.tsx:847  POST /api/users/groups/create
 *     — başka HİÇBİR çağrı yok.
 *
 * Sunucuda duran ve hiç çağrılmayan uçlar (api/routes/groups.cjs:160-173):
 *     POST /api/groups/join          katılma
 *     GET  /api/groups/:code/board   puan sıralamalı grup panosu
 *     POST /api/groups/:code/opt     "beni toplamda sayma" seçeneği
 *
 * Sonuç zinciri:
 *   1. Grup adı kullanıcıya SORULMUYOR — `"Grubum " + Math.random()...`.
 *   2. Kurulunca sunucunun döndürdüğü `code` OKUNMUYOR (me.tsx:849 yalnız
 *      `if (r?.ok)` bakıyor) ve grup kartı yalnız adı basıyor.
 *   3. Kod hiçbir yerde görünmediği için arkadaşa verilemiyor.
 *   4. Eline kod geçse bile girecek alan yok.
 *   5. Pano ekranı yok, yani grup tablosu hiç görüntülenmiyor.
 *
 * Yani "arkadaşımla yarışabiliyor muyum?" sorusunun cevabı HAYIR'dı ve
 * bunun sebebi eksik sunucu değil, eksik kabloydu. Bot gruplarının
 * "keşfedilebilir sabit kod" tasarımı (GSGRUP gibi) da karşılıksız kalıyordu.
 *
 * ⚠️ NEDEN AYRI MODÜL: `lib/friendSearch.ts` ve `lib/fetchPolicy.ts` ile aynı
 * gerekçe — React Native bağımlılığı taşımadığı için Node altında
 * `--experimental-strip-types` ile yüklenip GERÇEK sunucuya karşı
 * sınanabiliyor. İstek yolu (`getir`/`gonder`) dışarıdan veriliyor çünkü
 * `apiFetch` AsyncStorage ve Constants çekiyor.
 */

export type GrupOzet = {
  code: string;
  name: string;
  ownerId: string | null;
  size: number;
  sahibiMiyim: boolean;
};

export type PanoSatir = {
  userId: string;
  name: string;
  flag: string | null;
  includeInTotal: boolean;
  points: number;
  /** Sezon sonunda gruptan çıkarılacak — panoda HERKESE görünür. */
  ayrilacak: boolean;
  /** Bot mu? Kural buna bağlı: bot anında çıkar, insan sezon sonunda. */
  bot: boolean;
};

export type Pano = {
  code: string;
  name: string;
  size: number;
  ownerId: string | null;
  items: PanoSatir[];
};

export type Sonuc<T> =
  | ({ durum: "ok" } & T)
  | { durum: "hata"; hata: string };

/**
 * Kod alfabesi — `api/lib/social-store.cjs` code6 ile AYNI.
 *
 * ⚠️ I, O, 0, 1 BİLEREK YOK: kod elden ele okunuyor ve bu dördü karışıyor.
 * İstemci tarafında da aynı kümeyi kullanmak, kullanıcının "0" yazdığı yerde
 * sessiz bir "grup bulunamadı" yerine anlaşılır bir uyarı vermeyi sağlıyor.
 */
export const KOD_ALFABE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const KOD_UZUNLUK = 6;

/**
 * Yazılan kodu normalleştirir: boşluk/tire atılır, büyütülür.
 *
 * ⚠️ HARF EKSENİ. `toLocaleUpperCase()` KULLANILMIYOR: Türkçe yerelde "i"
 * harfi "İ"ye dönüşür ve alfabede olmayan bir harf üretir. `toUpperCase()`
 * yerelden bağımsızdır. Bu depoda kimlik harf düzeni tekrar eden sessiz
 * hata sınıfı (bkz. kimlik-harf-sozlesmesi nöbetçisi).
 */
export function kodNormalle(ham?: string | null): string {
  return String(ham || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Kod sunucuya gönderilebilir mi? */
export function kodGecerliMi(ham?: string | null): boolean {
  const k = kodNormalle(ham);
  if (k.length !== KOD_UZUNLUK) return false;
  for (const h of k) if (!KOD_ALFABE.includes(h)) return false;
  return true;
}

/** Sunucudan gelen grup özetini savunmacı biçimde normalleştirir. */
function ozet(x: any, userId: string): GrupOzet | null {
  const code = kodNormalle(x?.code);
  if (!code) return null;
  const ownerId = x?.ownerId ? String(x.ownerId) : null;
  const uyeler = Array.isArray(x?.members) ? x.members : [];
  return {
    code,
    name: String(x?.name ?? "").trim() || code,
    ownerId,
    size: Number(x?.size ?? uyeler.length ?? 0) || 0,
    sahibiMiyim: !!ownerId && !!userId && String(ownerId) === String(userId),
  };
}

/**
 * Grupları sırala: önce KENDİ kurdukların, sonra kalabalık olanlar.
 *
 * Kullanıcının kendi kurduğu grubun kodunu vermesi gerekiyor — o yüzden
 * listenin başında durmalı.
 */
export function grupSirala(liste: readonly GrupOzet[]): GrupOzet[] {
  return [...(liste || [])].sort((a, b) => {
    if (a.sahibiMiyim !== b.sahibiMiyim) return a.sahibiMiyim ? -1 : 1;
    if (b.size !== a.size) return b.size - a.size;
    return a.name.localeCompare(b.name, "tr");
  });
}

type Getir = (yol: string) => Promise<{ json: () => Promise<any> }>;
type Gonder = (yol: string, ayar: any) => Promise<{ json: () => Promise<any> }>;

/** `apiFetch` fırlatmaz, `{ ok:false, error }` döner — `ok` alanına bakılıyor. */
async function coz(p: Promise<{ json: () => Promise<any> }>): Promise<any> {
  const j = await (await p).json();
  if (!j || j.ok !== true) throw new Error(String(j?.error || "BAD_JSON"));
  return j;
}

/** Kullanıcının grupları. */
export async function gruplarim(
  userId: string,
  getir: Getir
): Promise<Sonuc<{ items: GrupOzet[] }>> {
  try {
    const yol = `/api/users/groups/list?userId=${encodeURIComponent(String(userId || ""))}`;
    const j = await coz(getir(yol));
    const items: GrupOzet[] = [];
    for (const ham of Array.isArray(j.items) ? j.items : []) {
      const o = ozet(ham, userId);
      if (o) items.push(o);
    }
    return { durum: "ok", items: grupSirala(items) };
  } catch (e: any) {
    return { durum: "hata", hata: String(e?.message || e || "NETWORK") };
  }
}

/**
 * Grup kurar ve KODU döndürür.
 *
 * ⚠️ `code` DÖNDÜRÜLMESİ BU DÜZELTMENİN ÇEKİRDEĞİ: sunucu onu baştan beri
 * veriyordu (`res.json({ ok:true, code, group })`), istemci okumuyordu.
 */
export async function grupKur(
  ad: string,
  gonder: Gonder
): Promise<Sonuc<{ code: string; name: string }>> {
  const name = String(ad || "").trim();
  if (!name) return { durum: "hata", hata: "NAME_REQUIRED" };
  try {
    const j = await coz(
      gonder("/api/groups/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
    );
    const code = kodNormalle(j.code);
    if (!code) return { durum: "hata", hata: "NO_CODE" };
    return { durum: "ok", code, name: String(j?.group?.name || name) };
  } catch (e: any) {
    return { durum: "hata", hata: String(e?.message || e || "NETWORK") };
  }
}

/** Koda göre gruba katılır. */
export async function grubaKatil(
  ham: string,
  gonder: Gonder
): Promise<Sonuc<{ code: string; name: string; size: number }>> {
  const code = kodNormalle(ham);
  if (!kodGecerliMi(code)) return { durum: "hata", hata: "BAD_CODE" };
  try {
    const j = await coz(
      gonder("/api/groups/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      })
    );
    return {
      durum: "ok",
      code,
      name: String(j?.group?.name || code),
      size: Number(j?.group?.size || 0) || 0,
    };
  } catch (e: any) {
    return { durum: "hata", hata: String(e?.message || e || "NETWORK") };
  }
}

/** Grup panosu: puan sıralamalı üye listesi. */
export async function grupPanosu(
  ham: string,
  getir: Getir
): Promise<Sonuc<{ pano: Pano }>> {
  const code = kodNormalle(ham);
  if (!code) return { durum: "hata", hata: "BAD_CODE" };
  try {
    const j = await coz(getir(`/api/groups/${encodeURIComponent(code)}/board`));
    const items: PanoSatir[] = [];
    for (const x of Array.isArray(j.items) ? j.items : []) {
      const userId = String(x?.userId ?? "").trim();
      if (!userId) continue;
      items.push({
        userId,
        name: String(x?.name ?? userId).trim() || userId,
        flag: x?.flag ?? null,
        includeInTotal: x?.includeInTotal !== false,
        points: Number(x?.points ?? 0) || 0,
        ayrilacak: x?.ayrilacak === true,
        bot: x?.bot === true,
      });
    }
    return {
      durum: "ok",
      pano: {
        code: kodNormalle(j.code) || code,
        name: String(j?.name ?? "").trim() || code,
        size: Number(j?.size ?? items.length) || items.length,
        ownerId: j?.ownerId ? String(j.ownerId) : null,
        items,
      },
    };
  } catch (e: any) {
    return { durum: "hata", hata: String(e?.message || e || "NETWORK") };
  }
}

/**
 * Üyeyi gruptan çıkarır — KURUCU.
 *
 * ⚠️ SONUÇ İKİ TÜRLÜ ve ekran bunu kullanıcıya söylemek zorunda:
 *   "immediate"  — bot, anında çıktı
 *   "season_end" — insan, SEZON SONUNDA çıkacak
 *
 * Erteleme kozmetik değil: grup panosu sezon toplamı okuduğu için, yürüyen
 * sezonda birini çıkarmak sıralamayı değiştirirdi ve "geçemediğim kişiyi
 * çıkarayım" hamlesi işe yarardı. Gerekçe ve ölçüm sunucu tarafında
 * (api/lib/social-store.cjs setGroupRemoval).
 */
export async function uyeCikar(
  ham: string,
  userId: string,
  gonder: Gonder,
  iptal = false
): Promise<Sonuc<{ mode: "immediate" | "season_end" | "cancelled" }>> {
  const code = kodNormalle(ham);
  const kisi = String(userId || "").trim();
  if (!code || !kisi) return { durum: "hata", hata: "REQ" };
  try {
    const j = await coz(
      gonder(`/api/groups/${encodeURIComponent(code)}/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: kisi, ...(iptal ? { cancel: true } : {}) }),
      })
    );
    return { durum: "ok", mode: j?.mode || "season_end" };
  } catch (e: any) {
    return { durum: "hata", hata: String(e?.message || e || "NETWORK") };
  }
}

/** Gruptan kendi isteğiyle ayrılır — anında. */
export async function gruptanAyril(ham: string, gonder: Gonder): Promise<Sonuc<{}>> {
  const code = kodNormalle(ham);
  if (!code) return { durum: "hata", hata: "BAD_CODE" };
  try {
    await coz(
      gonder(`/api/groups/${encodeURIComponent(code)}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    return { durum: "ok" };
  } catch (e: any) {
    return { durum: "hata", hata: String(e?.message || e || "NETWORK") };
  }
}

/** "Beni grup toplamında say / sayma". */
export async function toplamaKatilim(
  ham: string,
  includeInTotal: boolean,
  gonder: Gonder
): Promise<Sonuc<{}>> {
  const code = kodNormalle(ham);
  if (!code) return { durum: "hata", hata: "BAD_CODE" };
  try {
    await coz(
      gonder(`/api/groups/${encodeURIComponent(code)}/opt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeInTotal: !!includeInTotal }),
      })
    );
    return { durum: "ok" };
  } catch (e: any) {
    return { durum: "hata", hata: String(e?.message || e || "NETWORK") };
  }
}
