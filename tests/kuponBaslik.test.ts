/**
 * KUPON BAŞLIĞI — üç tür de ADLANIYOR.
 *
 * ⚠️ ÖLÇÜLEN KUSUR (2026-09-10 TR40 denetimi, kupon.tsx:193 ve
 * KuponKarti.tsx:110): sunucu üç tür gönderiyor (`ulke`, `avrupa`, `ortak`),
 * istemci tipi `"ulke" | "avrupa"` diyordu ve başlık tek üçlü ifadeyle
 * kuruluyordu. TR40'ta açılan kupon `{tur:"ortak", ulke:null}` olduğu için
 * ülke dalına düşüyor, `ulkeAdi(null)` boş dize dönüyordu.
 *
 * ÖLÇÜLDÜ (düzeltmeden önce, gerçek i18n.ts + gerçek ulkeler.ts):
 *     tur=ortak   -> "⚽  Ligi"          / "⚽  League"      ← ADSIZ
 *     tur=ulke    -> "⚽ Türkiye Ligi"   / "⚽ Turkey League"
 *     tur=avrupa  -> "🏆 Avrupa Haftası" / "🏆 Europe Week"
 *
 * Yani TR40'taki TEK ve birincil haftalık oyun, ana ekran kartında ve kupon
 * ekranında adsız görünüyordu.
 *
 * ⚠️ `t` GERÇEK, `ulkeAdi` ENJEKTE. `lib/ulkeler.ts` uzantısız `from "./i18n"`
 * içe aktarımı yüzünden Node altında yüklenemiyor (depo kuralı uzantılı
 * biçimi yalnızca tests/ altına ayırıyor — bkz. tsconfig.json). Sözlük gerçek
 * olduğu için asıl risk — eksik anahtarın ekranda HAM ANAHTAR olarak
 * görünmesi — burada gerçekten ölçülüyor.
 *
 * Çalıştırma:  npm test   (kök: mobile/)
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { t, setLang } from "../lib/i18n.ts";
import { kuponBasligi, kuponAltMetni, birincilKupon } from "../lib/kuponBaslik.ts";

/** Gerçek `ulkeAdi` davranışı: tanınan ülke çevrilir, `null` boş dize döner. */
const ulkeAdi = (ham?: string | null) => (ham ? "Türkiye" : "");

const DILLER = ["tr", "en"] as const;
const TURLER = ["ortak", "ulke", "avrupa"] as const;

describe("kurulum sınandı", () => {
  test("sözlük GERÇEKTEN yüklü — anahtarlar ham dönmüyor", () => {
    /* ⚠️ Bu geçmezse aşağıdaki tüm başlık iddiaları anlamsız olur: `t()`
     * bilinmeyen anahtarda ANAHTARIN KENDİSİNİ basıyor, yani her şey
     * "dolu" görünür. */
    setLang("tr");
    assert.notEqual(t("kuponEurope"), "kuponEurope", "sozluk yuklenmemis");
    assert.notEqual(t("kuponOrtak"), "kuponOrtak", "kuponOrtak anahtari SOZLUKTE YOK — ekranda ham anahtar cikar");
    assert.notEqual(t("kuponOrtakSame"), "kuponOrtakSame", "kuponOrtakSame anahtari yok");
    assert.notEqual(t("goToProfile"), "goToProfile", "goToProfile anahtari yok");
  });

  test("ülke dalı GERÇEKTEN ülke adını kullanıyor", () => {
    setLang("tr");
    assert.match(kuponBasligi({ tur: "ulke", ulke: "Turkey" }, t, ulkeAdi), /Türkiye/,
      "ulke dali ulke adini basmiyor — asagidaki 'ortak farkli' iddiasi bir sey olcmez");
  });
});

describe("üç türün de adı var", () => {
  for (const dil of DILLER) {
    test(`${dil}: hiçbir tür ADSIZ değil`, () => {
      setLang(dil);
      for (const tur of TURLER) {
        const b = kuponBasligi({ tur, ulke: tur === "ulke" ? "Turkey" : null }, t, ulkeAdi);
        assert.ok(b.trim().length > 3, `${tur} basligi bos: ${JSON.stringify(b)}`);
        assert.ok(!/ {2}/.test(b),
          `${tur} basliginda CIFT BOSLUK var: ${JSON.stringify(b)} — bos ulke adi yerlestirilmis`);
      }
    });

    test(`${dil}: ORTAK kuponun kendi başlığı var, ülke başlığından farklı`, () => {
      setLang(dil);
      const ortak = kuponBasligi({ tur: "ortak", ulke: null }, t, ulkeAdi);
      const ulke = kuponBasligi({ tur: "ulke", ulke: "Turkey" }, t, ulkeAdi);
      const avrupa = kuponBasligi({ tur: "avrupa", ulke: null }, t, ulkeAdi);
      assert.notEqual(ortak, ulke);
      assert.notEqual(ortak, avrupa);
    });
  }
});

describe("BİLİNMEYEN tür", () => {
  test("dördüncü bir tür gelirse de adsız kalmıyor", () => {
    /* ⚠️ KUSURUN SINIFI BURADA KAPANIYOR. Eski kod "avrupa değilse ülke"
     * diye varsayıyordu; sunucu yarın yeni bir tür eklerse aynı kusur aynen
     * geri gelirdi. */
    setLang("tr");
    const b = kuponBasligi({ tur: "YENI_TUR", ulke: null }, t, ulkeAdi);
    assert.ok(!/ {2}/.test(b), `bilinmeyen turde cift bosluk: ${JSON.stringify(b)}`);
    assert.ok(b.trim().length > 3, `bilinmeyen tur adsiz: ${JSON.stringify(b)}`);
    /* ⚠️ ORTAK'IN ADINI DA ÇALMAMALI: yanlış ad, adsızlıktan daha kötü. */
    assert.notEqual(b, kuponBasligi({ tur: "ortak", ulke: null }, t, ulkeAdi),
      "bilinmeyen tur ORTAK kuponun adiyla cizilmis");
  });

  test("ülke türü ama ülke adı BOŞ ise ülke başlığı kurulmuyor", () => {
    /* Kusurun tam biçimi buydu: "⚽  Ligi". */
    setLang("tr");
    const b = kuponBasligi({ tur: "ulke", ulke: null }, t, ulkeAdi);
    assert.ok(!/ {2}/.test(b), `bos ulke adiyla baslik kurulmus: ${JSON.stringify(b)}`);
  });

  test("tur hiç yoksa / kupon null ise patlamıyor", () => {
    setLang("tr");
    assert.ok(kuponBasligi(null, t, ulkeAdi).length > 0);
    assert.ok(kuponBasligi({}, t, ulkeAdi).length > 0);
  });
});

describe("alt metin", () => {
  test("ORTAK kuponun ne olduğu YAZIYOR", () => {
    /* Eski kod `tur === "avrupa"` koşuluna bağlıydı; ORTAK kuponun tanımı
     * ("ülkeye bakılmaz, herkes aynı kuponu oynar") hiç görünmüyordu. */
    setLang("tr");
    const ek = kuponAltMetni({ tur: "ortak", ulke: null }, t);
    assert.ok(ek.trim().length > 0, "ORTAK kuponun aciklamasi bos");
    assert.notEqual(ek, kuponAltMetni({ tur: "avrupa", ulke: null }, t));
  });

  test("ülke kuponunda ek metin yok", () => {
    setLang("tr");
    assert.equal(kuponAltMetni({ tur: "ulke", ulke: "Turkey" }, t), "");
  });
});

describe("ana ekran kartı hangi kuponu gösteriyor", () => {
  const K = (tur: string, durum = "open") => ({ tur, ulke: null, durum });

  test("ORTAK öncelikli — ülke kuponu onu GİZLEMİYOR", () => {
    /* Eski kural `find(k => k.tur === "ulke") || acik[0]` idi: iki tür
     * birlikte dönseydi ORTAK gizlenirdi. TR40'ta liste tek elemanlı olduğu
     * için sonuç tesadüfen doğruydu — kural yanlıştı. */
    assert.equal(birincilKupon([K("ulke"), K("ortak")])?.tur, "ortak");
    assert.equal(birincilKupon([K("ortak"), K("ulke")])?.tur, "ortak");
  });

  test("ORTAK yoksa ülke, o da yoksa ilk açık kupon", () => {
    assert.equal(birincilKupon([K("avrupa"), K("ulke")])?.tur, "ulke");
    assert.equal(birincilKupon([K("avrupa")])?.tur, "avrupa");
  });

  test("KAPALI kupon seçilmiyor, boş liste null", () => {
    assert.equal(birincilKupon([K("ortak", "locked")]), null);
    assert.equal(birincilKupon([]), null);
    assert.equal(birincilKupon(null), null);
  });
});
