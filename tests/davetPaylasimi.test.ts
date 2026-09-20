/**
 * DAVET PAYLAŞIMI — iniş sayfası bağlantısı.
 *
 * ⚠️ ÖLÇÜLEN KUSUR: 129 davet kodu, **0 kullanım** (13 Eylül 2026).
 * Paylaşılan mesaj düz metin olarak `skorlig://` taşıyordu ve uygulaması
 * olmayan kişide o bağlantı hiçbir şey yapmıyordu; kişi kodu mesajın içinden
 * bulup elle yazmak zorundaydı. `lib/share.ts` eksiği kendi başlığında
 * yazmıştı: "EKSİK HALKA: … bir https iniş sayfası eklenmeli."
 *
 * Kural gövdesi `lib/davetLinkKurallari.ts`te ve burada GERÇEK ÇAĞRIYLA
 * sınanıyor; `share.ts` react-native içe aktardığı için Node altında
 * yüklenemiyor, o yüzden yalnız kaynaktan okunuyor.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { davetLinkiKur } from "../lib/davetLinkKurallari.ts";

const KOK = path.join(import.meta.dirname, "..");
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), "utf8").replace(/\r\n?/g, "\n");
const kod = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const SHARE = kod(oku("lib/share.ts"));
const TABAN = "https://api.example.test";

describe("davetLinkiKur", () => {
  test("hedefsiz bağlantı", () => {
    assert.equal(davetLinkiKur(TABAN, "ABC234"), `${TABAN}/d/ABC234`);
  });

  test("hedefli bağlantılar — ANAHTAR gider, yol DEĞİL", () => {
    assert.equal(davetLinkiKur(TABAN, "ABC234", { y: "predict", m: "MK-1" }), `${TABAN}/d/ABC234?y=predict&m=MK-1`);
    assert.equal(davetLinkiKur(TABAN, "ABC234", { y: "race", m: "FDO-9" }), `${TABAN}/d/ABC234?y=race&m=FDO-9`);
    assert.equal(davetLinkiKur(TABAN, "ABC234", { y: "duel", d: "d_7" }), `${TABAN}/d/ABC234?y=duel&d=d_7`);
  });

  test("küçük harf BÜYÜĞE — sunucu da büyütüyor, iki taraf aynı adresi görsün", () => {
    assert.equal(davetLinkiKur(TABAN, "abc234"), `${TABAN}/d/ABC234`);
  });

  test("sondaki eğik çizgi çiftlenmiyor", () => {
    assert.equal(davetLinkiKur(TABAN + "/", "ABC234"), `${TABAN}/d/ABC234`);
    assert.equal(davetLinkiKur(TABAN + "///", "ABC234"), `${TABAN}/d/ABC234`);
  });

  test("parametre URL için kaçırılıyor", () => {
    const b = davetLinkiKur(TABAN, "ABC234", { y: "predict", m: "a b&c=d" });
    assert.ok(b && !b.includes("a b&c=d"), "ham deger adrese sizdi");
    assert.match(String(b), /m=a\+b%26c%3Dd/);
  });

  describe("null dönen durumlar — çağıran derin bağlantıya düşsün", () => {
    test("kod yok", () => {
      assert.equal(davetLinkiKur(TABAN, null), null);
      assert.equal(davetLinkiKur(TABAN, ""), null);
    });

    test("kod BİÇİMSİZ — bozuk kodla kurulan /d/ alıcıda 404 gösterirdi", () => {
      for (const k of ["ABC23", "ABC2345", "ABC23I", "ABC230", "ABC-34"]) {
        assert.equal(davetLinkiKur(TABAN, k), null, `${k} kabul edildi`);
      }
    });

    test("taban yok ya da http(s) değil", () => {
      assert.equal(davetLinkiKur(null, "ABC234"), null);
      assert.equal(davetLinkiKur("", "ABC234"), null);
      /* ⚠️ `getApiBase()` ASENKRON: bir tur `String(getApiBase())` yazıldı ve
       * "[object Promise]" üretiyordu. Taban denetimi o çöpü de eliyor. */
      assert.equal(davetLinkiKur("[object Promise]", "ABC234"), null);
      assert.equal(davetLinkiKur("skorlig://x", "ABC234"), null);
    });
  });

  test("NÖBETÇİ: ölçüt kör değil — geçerli girdi GERÇEKTEN bağlantı veriyor", () => {
    /* Yukarıdaki dizinin hepsi null bekliyor; fonksiyon her zaman null
     * dönse de geçerdi. Bu iddia farkı ölçtüğünü gösteriyor. */
    assert.ok(davetLinkiKur(TABAN, "ABC234"), "gecerli girdi de null dondu — olcut kor");
  });
});

describe("iki gerçeklik yok — alfabe ve hedefler sunucuyla aynı", () => {
  /* Sunucu deposu yan klasörde; yoksa bu iddialar ATLANIR ve atlama
   * görünür olsun diye sebebi yazılıyor (api tarafı bu atlamayı tavanla
   * sayıyor). */
  const API = path.join(KOK, "..", "api");
  const apiVar = fs.existsSync(API);

  test("davet kodu alfabesi mobil ve sunucuda AYNI", (t) => {
    if (!apiVar) return t.skip("api deposu bulunamadi");
    const sunucu = fs.readFileSync(path.join(API, "routes", "davet.cjs"), "utf8");
    const alfabe = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    assert.ok(sunucu.includes(alfabe), "sunucudaki alfabe degismis");
    assert.ok(oku("lib/davetLinkKurallari.ts").includes(alfabe), "mobildeki alfabe degismis");
  });

  test("hedef anahtarları sunucunun KAPALI LİSTESİNDE var", (t) => {
    if (!apiVar) return t.skip("api deposu bulunamadi");
    const sunucu = fs.readFileSync(path.join(API, "routes", "davet.cjs"), "utf8");
    for (const anahtar of ["predict", "race", "duel"]) {
      assert.match(sunucu, new RegExp(`\\n\\s*${anahtar}:\\s*\\(p\\)`),
        `mobil "${anahtar}" gonderiyor ama sunucunun HEDEFLER listesinde yok — baglanti koke duserdi`);
    }
  });
});

describe("share.ts iniş sayfasını kullanıyor", () => {
  test("dört paylaşımın dördü de davetLinki çağırıyor", () => {
    const sayi = (SHARE.match(/await davetLinki\(/g) || []).length;
    assert.equal(sayi, 4, `davetLinki ${sayi} yerde cagriliyor, 4 olmali`);
  });

  test("derin bağlantı YEDEK olarak duruyor", () => {
    /* Kod alinamazsa /d/ kurulamaz; o zaman eski davranis surmeli.
     * ⚠️ 4, 3 DEGIL: ilk yazimda "uc cok satirli + bir tek satirli" diye
     * ayirip 3 beklemistim, oysa desen dordunu de tutuyor. Olcutun kendi
     * hatasiydi, kodun degil. */
    assert.equal((SHARE.match(/\?\?\s*\n?\s*deepLink\(/g) || []).length, 4,
      "dort paylasimin dordunde de derin baglanti yedegi olmali");
    assert.match(SHARE, /\(await davetLinki\(code\)\) \?\? deepLink\(""/);
  });

  test("await UNUTULMAMIŞ — Promise adrese basılmasın", () => {
    /* `String(Promise)` "[object Promise]" verir ve tsc bunu yakalamaz;
     * bir tur tam bu hata yazildi. */
    assert.doesNotMatch(SHARE, /[^t]\sdavetLinki\(/, "await'siz davetLinki cagrisi var");
  });

  test('"kodu elle yaz" cümlesi KALDIRILDI', () => {
    /* Alıcıya ödev veren cümle ölçülen 0 dönüşümün parçasıydı; aynı
     * yönlendirme artık iniş sayfasında, kopyalanabilir kodun yanında. */
    assert.doesNotMatch(SHARE, /Davet Kodu Gir/, "eski elle-yaz cumlesi geri gelmis");
    assert.doesNotMatch(SHARE, /withInvite\([^)]*,\s*code\)/, "withInvite hala kod aliyor");
  });
});
