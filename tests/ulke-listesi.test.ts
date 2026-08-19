/**
 * YEREL ÜLKE LİSTESİ VE CİHAZ BÖLGESİ EŞLEMESİ.
 *
 * `countriesFallback` onboarding'in ağa BAĞLI OLMAMASINI sağlıyor: liste
 * sunucudan çekiliyordu ve Render ücretsiz katmanı uyandığında (30-60 sn)
 * üç deneme de düşüp yeni kullanıcı ilk ekranda sonsuza kadar takılı
 * kalıyordu. Yani bu liste bozulursa en kötü ilk izlenim geri gelir.
 *
 * `locale` ise cihaz bölgesini API'nin KANONİK ülke adına çeviriyor. Yanlış
 * bir ad göndermek sunucuda COUNTRY_NOT_SUPPORTED ile reddediliyor — eski
 * sürümdeki sessiz hata tam olarak buydu.
 *
 * ⚠️ BAYATLAMA SINANIYOR AMA KAPI DEĞİL. Yerel liste, sunucudaki tek ülke
 * kaynağından (api/lib/countries.cjs) türetilmişti ve dosyanın kendi notu
 * bayatlama riskini kabul ediyor. Aşağıdaki karşılaştırma o riski ÖLÇÜYOR;
 * API deposu yanında değilse (CI, temiz makine) sessizce atlanıyor — bir
 * testin, kendi deposunun dışındaki bir dosyaya zorunlu bağlanması kırılgan
 * olurdu.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FALLBACK_COUNTRIES } from "../lib/countriesFallback.ts";
import { getDeviceCountry, getDeviceRegionCode } from "../lib/locale.ts";

const KOK = path.dirname(fileURLToPath(import.meta.url));

describe("yerel ülke listesi", () => {
  test("kurulum: liste GERÇEKTEN dolu", () => {
    /* Sondaj: boş bir liste, aşağıdaki "tekrar yok" ve "hepsinde bayrak var"
     * iddialarını kendiliğinden geçirirdi. */
    assert.ok(FALLBACK_COUNTRIES.length >= 20,
      `yerel listede yalnizca ${FALLBACK_COUNTRIES.length} ulke var`);
  });

  test("Türkiye ilk sırada", () => {
    assert.equal(FALLBACK_COUNTRIES[0].country, "Türkiye",
      "Turk kullaniciya donuk uygulamada ilk secenek Turkiye degil");
  });

  test("aynı ülke iki kez yok", () => {
    /* Çift kayıt seçicide iki özdeş satır gösterir; hangisini seçtiği
     * kullanıcı için ayırt edilemez. */
    const adlar = FALLBACK_COUNTRIES.map((c) => c.country);
    assert.equal(new Set(adlar).size, adlar.length,
      "yerel listede tekrar eden ulke var");
  });

  test("her ülkenin adı ve bayrağı dolu", () => {
    for (const c of FALLBACK_COUNTRIES) {
      assert.ok(c.country && c.country.trim(), "adsiz ulke kaydi");
      assert.ok(c.flag && c.flag.trim(),
        `${c.country}: bayrak bos — secicide bosluk gorunur`);
    }
  });
});

describe("cihaz bölgesi eşlemesi", () => {
  test("çağrılar patlamıyor ve sözleşmeye uyuyor", () => {
    /**
     * ⚠️ ORTAMA BAĞLI DEĞER SINANMIYOR. Test makinesinin yereli ne olursa
     * olsun geçmeli; "tr-TR bekliyorum" demek testi çalıştığı makineye
     * bağlar. Ölçülen şey SÖZLEŞME: ya kanonik bir ad ya null, asla boş
     * dize ya da tanımsız.
     */
    const u = getDeviceCountry();
    assert.ok(u === null || (typeof u === "string" && u.length > 0),
      `getDeviceCountry sozlesmeyi bozdu: ${JSON.stringify(u)}`);

    const k = getDeviceRegionCode();
    assert.ok(k === null || /^[A-Z]{2,3}$/.test(k),
      `bolge kodu bicimsiz: ${JSON.stringify(k)}`);
  });

  test("dönen ülke adı KANONİK olmalı (yerel listede bulunmalı)", () => {
    /* Sunucu Türkçe ad kabul etmiyor; eşleme tablosuna yanlış bir yazım
     * girerse kullanıcı sessizce COUNTRY_NOT_SUPPORTED alır. Yerel liste
     * kanonik adlardan oluştuğu için iyi bir çapa. */
    const u = getDeviceCountry();
    if (u === null) return; // bu makinenin bölgesi tabloda yok — geçerli durum
    const kanonik = new Set(FALLBACK_COUNTRIES.map((c) => c.country));
    assert.ok(kanonik.has(u),
      `"${u}" yerel kanonik listede yok — sunucu bu adi reddedebilir`);
  });
});

describe("bayatlama ölçümü (API deposu varsa)", () => {
  test("yerel listedeki her ülke sunucuda da TANINIYOR", () => {
    /**
     * Yön bilerek TEK: yerelde olup sunucuda olmayan bir ülke gerçek kusur
     * (kullanıcı seçer, sunucu reddeder). Tersi — sunucuda olup yerelde
     * olmayan — dosyanın kendi notunda kabul edilmiş bir bayatlama ve
     * zararsız: sunucu yanıtı geldiğinde liste tazeleniyor.
     */
    const apiYol = path.resolve(KOK, "..", "..", "api", "lib", "countries.cjs");
    if (!fs.existsSync(apiYol)) {
      /* API deposu yanında değil — ölçüm yapılamaz. Sessiz geçmek yerine
       * bunu SÖYLÜYORUZ, yoksa "0 kusur" ile "0 ölçüm" ayırt edilemez. */
      console.log("      (atlandi: api/lib/countries.cjs bulunamadi)");
      return;
    }

    const src = fs.readFileSync(apiYol, "utf8");
    const eksik = FALLBACK_COUNTRIES
      .map((c) => c.country)
      .filter((ad) => !src.includes(`"${ad}"`));

    assert.deepEqual(eksik, [],
      `yerel listede olup sunucuda taninmayan ulke(ler): ${JSON.stringify(eksik)} — ` +
      "kullanici secer, sunucu COUNTRY_NOT_SUPPORTED ile reddeder");
  });
});
