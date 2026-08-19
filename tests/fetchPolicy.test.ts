/**
 * İSTEK POLİTİKASI — timeout / retry / önbellek.
 *
 * ⚠️ BU DEPODAKİ İLK MOBİL TEST. API tarafında 345 dosya ve 2840 test vardı;
 * mobil tarafta `package.json` içinde `test` betiği bile yoktu — yani
 * kullanıcının telefonunda çalışan kodun davranışı hiç ölçülmüyordu.
 *
 * NEDEN ÖNCE BU MODÜL: `fetchPolicy` zaten test edilebilir olsun diye
 * `apiFetch`ten ayrılmış (apiFetch firebase ve expo-constants'a bağlı, Node
 * altında yüklenemiyor) ve taşıdığı kurallardan biri doğrudan PARAYA dokunuyor:
 * POST'lar tekrarlanmaz. Tekrarlanırsa istek sunucuya ulaşıp yanıtı kaybolan
 * bir tahmin/satın alma İKİ KEZ işlenebilir.
 *
 * ⚠️ ÇALIŞTIRMA — `npm test` (kök: mobile/). Node'un `--experimental-strip-types`
 * bayrağıyla TS doğrudan koşuyor; ek bağımlılık YOK. React Native ya da expo
 * içe aktaran modüller bu yolla YÜKLENEMEZ, o yüzden kapsam saf mantık
 * modülleriyle sınırlı ve bu bilinçli.
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { fetchWithPolicy, _clearFetchCache } from "../lib/fetchPolicy.ts";

/**
 * Sayan sahte fetch: her çağrıda sıradaki yanıtı verir.
 *
 * ⚠️ SİNYALE UYMAK ZORUNDA — ilk sürümü uymuyordu ve ölçümü BOZDU. Zaman
 * aşımı testindeki "hiç çözülmeyen" yanıt, AbortController iptal ettiği hâlde
 * askıda kaldı; `fetchWithPolicy` hiç sonuçlanmadı, olay döngüsü boşaldı ve
 * node:test kalan 6 testi "cancelledByParent" diye iptal etti. Kusur kaynakta
 * değil taklidin kendisindeydi: gerçek `fetch` iptalde REDDEDER.
 */
function sahteFetch(yanitlar: Array<Response | Error | (() => Promise<Response>)>) {
  const durum = { cagri: 0, urller: [] as string[] };
  const fn = (async (url: any, opts: any) => {
    durum.urller.push(String(url));
    const y = yanitlar[Math.min(durum.cagri, yanitlar.length - 1)];
    durum.cagri++;
    if (y instanceof Error) throw y;
    if (typeof y === "function") {
      const sig: AbortSignal | undefined = opts?.signal;
      const iptal = new Promise<never>((_, red) => {
        if (!sig) return;
        const at = () => red(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }));
        if (sig.aborted) at(); else sig.addEventListener("abort", at, { once: true });
      });
      return Promise.race([y(), iptal]);
    }
    return y.clone();
  }) as unknown as typeof fetch;
  return { fn, durum };
}

const yanit = (status: number, govde = "{}") =>
  new Response(govde, { status, headers: { "content-type": "application/json" } });

beforeEach(() => { _clearFetchCache(); });

describe("kurulum", () => {
  test("enjekte edilen fetch GERÇEKTEN kullanılıyor", async () => {
    /**
     * ⚠️ BU SONDAJ OLMADAN AŞAĞIDAKİ HER "kaç kez çağrıldı" İDDİASI ANLAMSIZ.
     * Politika global fetch'e düşseydi sayaç hep 0 kalır ve "tekrar yok"
     * iddiaları kendiliğinden geçerdi.
     */
    const { fn, durum } = sahteFetch([yanit(200)]);
    const r = await fetchWithPolicy(fn, "https://ornek/test");
    assert.equal(durum.cagri, 1, "enjekte edilen fetch hic cagrilmadi");
    assert.equal(r.status, 200);
    assert.equal(durum.urller[0], "https://ornek/test");
  });
});

describe("POST tekrarlanmaz (çift işlem riski)", () => {
  test("ağ hatasında POST bir kez denenir", async () => {
    /* Asıl kural. İstek sunucuya ulaşıp yanıtı kaybolduysa tekrar, tahmini
     * ya da satın almayı İKİ KEZ işletir. */
    const { fn, durum } = sahteFetch([new Error("network down")]);
    await assert.rejects(
      () => fetchWithPolicy(fn, "https://ornek/pred/submit", { method: "POST" }),
      /network down/
    );
    assert.equal(durum.cagri, 1,
      `POST ${durum.cagri} kez denendi — tekrar cift islem uretebilir`);
  });

  test("503 dönen POST da tekrarlanmaz", async () => {
    const { fn, durum } = sahteFetch([yanit(503)]);
    const r = await fetchWithPolicy(fn, "https://ornek/pred/submit", { method: "POST" });
    assert.equal(r.status, 503, "503 cagirana dondurulmedi");
    assert.equal(durum.cagri, 1, "POST 503'te tekrarlandi");
  });

  test("çağıran AÇIKÇA isterse POST tekrarlanabilir", async () => {
    /* Negatif kontrol: kural "POST asla tekrarlanmaz" değil, "varsayılan
     * olarak tekrarlanmaz". Aksi halde düzeltme, seçeneği tümden yok
     * ettiği hâlde de yeşil görünürdü. */
    const { fn, durum } = sahteFetch([yanit(503), yanit(200)]);
    const r = await fetchWithPolicy(fn, "https://ornek/x", { method: "POST", retries: 1 });
    assert.equal(r.status, 200);
    assert.equal(durum.cagri, 2, "acik retries istegi yok sayildi");
  });
});

describe("GET geçici hatada tekrarlanır", () => {
  test("503 sonra 200 → çağırana 200 döner", async () => {
    const { fn, durum } = sahteFetch([yanit(503), yanit(200, '{"ok":true}')]);
    const r = await fetchWithPolicy(fn, "https://ornek/g", { retries: 1 });
    assert.equal(r.status, 200, "gecici hata sonrasi tekrar edilmedi");
    assert.equal(durum.cagri, 2);
  });

  test("ağ hatası sonrası tekrar edilir", async () => {
    const { fn, durum } = sahteFetch([new Error("ECONNRESET"), yanit(200)]);
    const r = await fetchWithPolicy(fn, "https://ornek/g", { retries: 1 });
    assert.equal(r.status, 200);
    assert.equal(durum.cagri, 2);
  });

  test("429 TEKRARLANMAZ — sunucunun hız sınırına saygı", async () => {
    /* Hız sınırına takılmış istemcinin tekrar denemesi sınırı derinleştirir.
     * API tarafındaki iki katmanlı limitle birebir eşleşen karar. */
    const { fn, durum } = sahteFetch([yanit(429)]);
    const r = await fetchWithPolicy(fn, "https://ornek/g", { retries: 2 });
    assert.equal(r.status, 429);
    assert.equal(durum.cagri, 1,
      `429 sonrasi ${durum.cagri} istek gitti — hiz siniri derinlesir`);
  });

  test("4xx tekrarlanmaz (kalıcı hata)", async () => {
    const { fn, durum } = sahteFetch([yanit(404)]);
    const r = await fetchWithPolicy(fn, "https://ornek/g", { retries: 2 });
    assert.equal(r.status, 404);
    assert.equal(durum.cagri, 1, "kalici hata tekrarlandi");
  });

  test("tekrarlar tükenince SON yanıt döner, hata fırlatılmaz", async () => {
    /* Sürekli 503 veren sunucuda çağıran, durum kodunu görebilmeli. */
    const { fn, durum } = sahteFetch([yanit(503)]);
    const r = await fetchWithPolicy(fn, "https://ornek/g", { retries: 1 });
    assert.equal(r.status, 503);
    assert.equal(durum.cagri, 2, "tekrar hic yapilmadi");
  });
});

describe("zaman aşımı", () => {
  test("asılı kalan istek timeoutMs sonunda düşer", async () => {
    /* RN'de fetch'in fiilî zaman aşımı yok; koruma kalkarsa ekran
     * "yükleniyor"da dakikalarca donar. */
    const asili = () => new Promise<Response>(() => { /* hiç çözülmez */ });
    const { fn, durum } = sahteFetch([asili as any]);
    await assert.rejects(
      () => fetchWithPolicy(fn, "https://ornek/yavas", { timeoutMs: 60, retries: 0 }),
      (e: any) => e?.name === "AbortError" || /abort/i.test(String(e?.message))
    );
    assert.equal(durum.cagri, 1);
  });

  test("çağıranın KENDİ iptali tekrarlanmaz", async () => {
    /* Kullanıcı ekrandan çıktığında istek iptal ediliyor; onu yeniden
     * denemek hem boşuna hem de iptalin anlamını bozar. */
    const ctl = new AbortController();
    ctl.abort();
    const { fn, durum } = sahteFetch([yanit(200)]);
    await assert.rejects(
      () => fetchWithPolicy(fn, "https://ornek/g", { signal: ctl.signal, retries: 2 })
    );
    assert.equal(durum.cagri, 0, "iptal edilmis istek yine de gonderildi");
  });
});

describe("GET önbelleği", () => {
  test("pencere içinde ikinci istek ağa ÇIKMIYOR", async () => {
    const { fn, durum } = sahteFetch([yanit(200, '{"n":1}')]);
    const a = await fetchWithPolicy(fn, "https://ornek/c", { cacheMs: 5000 });
    const b = await fetchWithPolicy(fn, "https://ornek/c", { cacheMs: 5000 });
    assert.equal(durum.cagri, 1, `onbellek isabet etmedi (${durum.cagri} istek)`);
    assert.equal(await a.text(), '{"n":1}');
    assert.equal(await b.text(), '{"n":1}',
      "onbellekten donen yanitin govdesi okunamadi — govde tek kullanimlik, " +
      "her isabette taze Response kurulmali");
  });

  test("POST önbelleğe ALINMAZ", async () => {
    const { fn, durum } = sahteFetch([yanit(200), yanit(200)]);
    await fetchWithPolicy(fn, "https://ornek/p", { method: "POST", cacheMs: 5000 });
    await fetchWithPolicy(fn, "https://ornek/p", { method: "POST", cacheMs: 5000 });
    assert.equal(durum.cagri, 2,
      "POST onbellege alindi — ayni gonderim ikinci kez sunucuya hic gitmez");
  });

  test("başarısız yanıt önbelleğe alınmaz", async () => {
    /* 500'ü saklamak, sunucu düzelse bile kullanıcıyı pencere boyunca
     * hatada bırakırdı. */
    const { fn, durum } = sahteFetch([yanit(500), yanit(200)]);
    const a = await fetchWithPolicy(fn, "https://ornek/e", { cacheMs: 5000, retries: 0 });
    assert.equal(a.status, 500);
    const b = await fetchWithPolicy(fn, "https://ornek/e", { cacheMs: 5000, retries: 0 });
    assert.equal(b.status, 200, "hatali yanit onbellege alinmis");
    assert.equal(durum.cagri, 2);
  });

  test("cacheMs verilmezse önbellek KAPALI", async () => {
    const { fn, durum } = sahteFetch([yanit(200)]);
    await fetchWithPolicy(fn, "https://ornek/n");
    await fetchWithPolicy(fn, "https://ornek/n");
    assert.equal(durum.cagri, 2, "istenmedigi halde onbellege alindi");
  });
});
