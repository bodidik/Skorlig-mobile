/**
 * ÜLKE LİSTESİ SIRALAMA VE ARAMA.
 *
 * Onboarding'de ülke seçimi ZORUNLU — kullanıcı bunu geçemeden uygulamayı
 * kullanamıyor. Yani buradaki her kusur ilk ekranda, en kritik anda görünür.
 *
 * Modülün kendi başlığı iki kuralın da GERÇEK VERİYLE yakalandığını yazıyor:
 * Türk kullanıcı "tur" yazınca kendi ülkesini bulamıyordu (ü ≠ u), ve
 * `includes` tek başına "eng" aramasında England'ı üste itmiyordu.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { sortCountries, filterAndRankCountries } from "../lib/countrySort.ts";

type U = { country: string };
const u = (country: string): U => ({ country });

const LISTE: U[] = [
  u("Argentina"), u("England"), u("Spain"), u("Türkiye"),
  u("Germany"), u("Ukraine"), u("Italy"), u("Estonia"),
];

const adlar = (l: U[]) => l.map((x) => x.country);
const ad = (x: U) => x.country;

describe("kurulum", () => {
  test("sıralama GERÇEKTEN bir şey döndürüyor ve girdiyi bozmuyor", () => {
    /* Sondaj: boş liste dönseydi "Türkiye ilk sırada değil" dışındaki
     * iddialar sessizce geçebilirdi. Ayrıca fonksiyonun girdiyi yerinde
     * sıralamaması bir sözleşme — çağıran taraf aynı diziyi başka yerde
     * kullanıyor. */
    const girdiKopya = adlar(LISTE);
    const s = sortCountries(LISTE, ad);
    assert.equal(s.length, LISTE.length, "eleman kayboldu");
    assert.deepEqual(adlar(LISTE), girdiKopya, "girdi dizisi YERINDE degistirildi");
  });
});

describe("Türkiye her zaman en üstte", () => {
  test("aramasız listede ilk sırada", () => {
    assert.equal(sortCountries(LISTE, ad)[0].country, "Türkiye",
      "Turk kullaniciya donuk uygulamada Turkiye ust sirada degil");
  });

  test("alfabetik olarak sonda olmasına RAĞMEN ilk", () => {
    /* Negatif kontrol: sıralama yalnızca alfabetik olsaydı Türkiye
     * "Ukraine"den sonra gelirdi. */
    const s = adlar(sortCountries(LISTE, ad));
    assert.ok(s.indexOf("Türkiye") < s.indexOf("Argentina"),
      `alfabetik siralamaya dusulmus: ${JSON.stringify(s)}`);
  });

  test("arama içinde de öncelikli", () => {
    const s = filterAndRankCountries(LISTE, "tur", ad);
    assert.equal(s[0]?.country, "Türkiye", "arama sonucunda Turkiye ilk degil");
  });
});

describe("Türkçe harf katlama", () => {
  test("'tur' → Türkiye bulunuyor (ü ≠ u tuzağı)", () => {
    /* Modülün başlığındaki ölçülmüş kusur: Türk kullanıcı KENDİ ülkesini
     * arayınca "sonuç yok" görüyordu. */
    const s = filterAndRankCountries(LISTE, "tur", ad);
    assert.ok(adlar(s).includes("Türkiye"),
      `"tur" aramasi Turkiye'yi bulamadi: ${JSON.stringify(adlar(s))}`);
  });

  test("büyük/küçük harf ve boşluk göz ardı ediliyor", () => {
    for (const q of ["TÜRK", "  türk  ", "TuRk"]) {
      assert.ok(adlar(filterAndRankCountries(LISTE, q, ad)).includes("Türkiye"),
        `"${q}" aramasi basarisiz`);
    }
  });
});

describe("baştan eşleşen, ortada geçenden önce", () => {
  test("'en' → England, Argentina'dan önce", () => {
    /* `Array.includes` tek başına bunu üste itmez: "Argentina" da eşleşir
     * ve alfabetik olarak önde çıkar. Ölçülmüş kusur bu. */
    const s = adlar(filterAndRankCountries(LISTE, "en", ad));
    assert.ok(s.includes("England") && s.includes("Argentina"),
      `iki ulke de eslesmeliydi: ${JSON.stringify(s)}`);
    assert.ok(s.indexOf("England") < s.indexOf("Argentina"),
      `bastan eslesme once gelmedi: ${JSON.stringify(s)}`);
  });

  test("eşleşmeyen ülkeler listeden DÜŞÜYOR", () => {
    const s = adlar(filterAndRankCountries(LISTE, "eng", ad));
    assert.deepEqual(s, ["England"], `beklenmeyen sonuc: ${JSON.stringify(s)}`);
  });

  test("hiç eşleşme yoksa boş liste", () => {
    assert.deepEqual(filterAndRankCountries(LISTE, "zzzz", ad), []);
  });
});

describe("boş arama", () => {
  test("boş sorgu TÜM listeyi döndürüyor (liste boşalmamalı)", () => {
    /**
     * ⚠️ BU SINIF BU DEPODA BİR KEZ PAHALIYA MAL OLDU (MediSea tarafında):
     * arama yardımcısı boş sorguda `false` dönüyordu ve süzgeç, kutu boşken
     * bütün listeyi eliyordu — sayfa tamamen boş kalmıştı. Onboarding'de
     * aynısı olsa kullanıcı hiçbir ülke göremez ve uygulamaya giremez.
     */
    for (const q of ["", "   "]) {
      const s = filterAndRankCountries(LISTE, q, ad);
      assert.equal(s.length, LISTE.length,
        `bos sorguda liste ${s.length} elemana dustu — kullanici ulke secemez`);
      assert.equal(s[0].country, "Türkiye");
    }
  });
});

describe("alan adı esnek (iki ekran farklı alan kullanıyor)", () => {
  test("varsayılan getter `country` alanını okuyor", () => {
    const s = filterAndRankCountries([u("Spain"), u("Türkiye")], "");
    assert.equal(s[0].country, "Türkiye");
  });

  test("özel getter ile başka alan da sıralanıyor", () => {
    /* Profil ekranı `localName` kullanıyor; kural iki yerde ayrı yazılırsa
     * sessizce farklı sıralar üretir — modülün var olma sebebi bu. */
    type P = { localName: string };
    const liste: P[] = [{ localName: "Spain" }, { localName: "Türkiye" }];
    const s = sortCountries(liste, (x) => x.localName);
    assert.equal(s[0].localName, "Türkiye");
  });
});
