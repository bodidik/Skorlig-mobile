/**
 * ONBOARDING'DE TAKMA AD — ölçülen kusurun nöbetçisi.
 *
 * ⚠️ ÖLÇÜM (2026-09-20, canlı `/api/leaderboard?limit=5000`): 1766 satırın
 * 1760'ı bot, 6'sı insan. İnsanların **5'i** ekranda ham Firebase kimliği
 * olarak görünüyordu (sıra 825 · 998 · 999 · 1318 · 1466'da "ApdTA2V9…"
 * gibi); botlar ise okunabilir ("InterMilano11"). Tek gerçek adı olan hesap
 * depo sahibininki ("Dz87") — yani ad ancak Profil sekmesini bulup elle
 * yazınca oluşuyordu.
 *
 * Kök neden `api/lib/ad-cozucu.cjs adiSec` zincirinin ORTASININ hiç dolmaması:
 * `nickname → displayName → kısaltılmış kimlik` sırasında `displayName` alanı
 * `api/lib/users-store.cjs` içinde **0 kez** geçiyor, hiçbir kod yolu yazmıyor.
 * Onboarding de adı sormuyordu. İkisi birleşince ad = kimlik.
 *
 * Bu dosya üç şeyi nöbetliyor:
 *   1. öneri üretimi (saf fonksiyon, gerçek çağrılarla),
 *   2. onboarding'in adı ZORUNLU tutması ve reddi YUTMAMASI,
 *   3. bekleyen adın gönderim halkasına gerçekten bağlı olması.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { adOner, adTemizle, gonderilebilirMi, AD_MIN, AD_MAX } from "../lib/takmaAd.ts";

const KOK = path.join(import.meta.dirname, "..");
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), "utf8").replace(/\r\n?/g, "\n");
/* ⚠️ YORUMLARI ELE: bu depoda yorumlar kusuru BİREBİR alıntılıyor. Elemeyen
 * bir kaynak ölçütü kendi belgesini kod sanar (api tarafında kayıtlı tuzak). */
const kod = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const ONBOARD = kod(oku("app/index.tsx"));
const LAYOUT  = kod(oku("app/_layout.tsx"));
const BEKLEYEN = kod(oku("lib/pendingNickname.ts"));

describe("adOner — Google adından öneri", () => {
  test("YALNIZCA İLK AD alınır — soyadı yayımlanmaz", () => {
    assert.equal(adOner("Ahmet Yılmaz"), "Ahmet");
    assert.equal(adOner("Mehmet Ali Kaya"), "Mehmet");
  });

  test("tek sözcüklü ad olduğu gibi geçer", () => {
    assert.equal(adOner("Zeynep"), "Zeynep");
  });

  test("Türkçe harfler korunur (sunucunun kümesinde \\p{L} var)", () => {
    assert.equal(adOner("Şükrü Ağaoğlu"), "Şükrü");
    assert.equal(adOner("İlayda"), "İlayda");
  });

  test("Latin dışı alfabe korunur — kural harf, ASCII değil", () => {
    assert.equal(adOner("Дмитрий Иванов"), "Дмитрий");
  });

  test("sunucunun reddedeceği karakterler atılır", () => {
    assert.equal(adOner("Ahmet🎉"), "Ahmet");
    assert.equal(adOner("<script>"), "script");
  });

  test("ad yoksa / anonim girişte öneri ÜRETİLMEZ", () => {
    assert.equal(adOner(null), null);
    assert.equal(adOner(undefined), null);
    assert.equal(adOner(""), null);
    assert.equal(adOner("   "), null);
  });

  test("ilk ad kullanılamazsa TAM ADA DÜŞÜLMEZ — gizlilik gerekçesi arka kapıdan delinmesin", () => {
    // "J Smith": ilk sözcük tek harf, eşiğin altında. Tam ada düşülseydi
    // soyadı yayımlanırdı — dosya başlığındaki kararın tam tersi.
    assert.equal(adOner("J Smith"), null);
    assert.equal(adOner("🎉 Yılmaz"), null);
  });

  test("uzun ad sunucunun sınırına kırpılır", () => {
    const oneri = adOner("Abdurrahmanoglulariningillerden");
    assert.equal(oneri?.length, AD_MAX);
  });
});

describe("adTemizle", () => {
  test("iç boşluklar teke iner, kenarlar kırpılır", () => {
    assert.equal(adTemizle("  Kartal   Gözü  "), "Kartal Gözü");
  });

  test("20. karakter boşluğa denk gelirse kırpma sonrası boşluk KALMAZ", () => {
    // Sunucu `trim()` sonrası uzunluğa bakıyor; burada boşluk bıraksaydık
    // istemci 20 sanar, sunucu 19 görürdü.
    const cikti = adTemizle("aaaaaaaaaaaaaaaaaaa b");
    assert.equal(cikti, cikti.trim());
    assert.ok(cikti.length <= AD_MAX);
  });

  test("nokta, alt çizgi, tire korunur (sunucu kümesinde var)", () => {
    assert.equal(adTemizle("kral_07.x-y"), "kral_07.x-y");
  });
});

describe("gonderilebilirMi — yerel ÖN kontrol", () => {
  test("sunucunun uzunluk sınırıyla aynı eşikler", () => {
    assert.equal(gonderilebilirMi("a".repeat(AD_MIN - 1)), false);
    assert.equal(gonderilebilirMi("a".repeat(AD_MIN)), true);
    assert.equal(gonderilebilirMi("a".repeat(AD_MAX)), true);
    assert.equal(gonderilebilirMi("a".repeat(AD_MAX + 1)), false);
  });

  test("yalnızca boşluk gönderilemez", () => {
    assert.equal(gonderilebilirMi("   "), false);
    assert.equal(gonderilebilirMi(null), false);
  });
});

describe("onboarding adı ZORUNLU tutuyor", () => {
  test("handleStart ad geçersizse ERKEN döner", () => {
    assert.match(
      ONBOARD,
      /const ad = nick\.trim\(\);\s*if \(!gonderilebilirMi\(ad\)\)/,
      "ad kontrolü handleStart'ın başında olmalı"
    );
  });

  test("ad kontrolü ÜLKE kontrolünden ÖNCE", () => {
    const adIdx   = ONBOARD.indexOf("gonderilebilirMi(ad)");
    const ulkeIdx = ONBOARD.indexOf("setPickerOpen(true)");
    assert.ok(adIdx > 0 && ulkeIdx > 0, "iki kontrol de bulunmalı");
    assert.ok(adIdx < ulkeIdx, "ad önce sorulmalı — ekranda da üstte");
  });

  test("ad eksikken son slayta GÖTÜRÜLÜR (alan orada çiziliyor)", () => {
    // "Atla" düğmesi son slayttan önce de handleStart'a giriyor; alanı
    // görünür yapmazsak düğme hiçbir şey yapmamış gibi görünür.
    const parca = ONBOARD.slice(
      ONBOARD.indexOf("gonderilebilirMi(ad)"),
      ONBOARD.indexOf("setNickHata(t(\"nickLength\"))")
    );
    assert.match(parca, /scrollToIndex/, "hata yazılmadan önce son slayta gidilmeli");
  });

  test("RET dalı markFirstRunDone'a ULAŞMADAN dönüyor", () => {
    /* ⚠️ BU TESTİN SEBEBİ GERÇEK BİR HATA: ilk yazımda ret kontrolü
     * try/finally'nin İÇİNDEYDİ ve `return` `finally`yi de çalıştırdığı için
     * reddedilen ad ekranda görünmeden onboarding bitiyordu. */
    const retIdx     = ONBOARD.indexOf('cevap === "RET"');
    const tryIdx     = ONBOARD.indexOf("await savePendingCountry(country)");
    assert.ok(retIdx > 0, "RET dalı bulunmalı");
    assert.ok(retIdx < tryIdx, "RET kontrolü try/finally bloğunun DIŞINDA ve ÖNCESİNDE olmalı");
  });

  test("dört ret kodunun DÖRDÜ de ekranda karşılığı olan bir mesaja bağlı", () => {
    for (const kodAdi of ["NICKNAME_TAKEN", "NICKNAME_RESERVED", "NICKNAME_LENGTH", "NICKNAME_INVALID"]) {
      assert.match(ONBOARD, new RegExp(kodAdi), `${kodAdi} onboarding'de ele alınmalı`);
    }
  });

  test("AĞ HATASI ret SAYILMAZ — ertelenir", () => {
    assert.match(ONBOARD, /"ERTELENDI"/, "ağ hatası ayrı bir sonuç olmalı");
    assert.match(ONBOARD, /catch \{\s*await savePendingNickname\(ad\);\s*return "ERTELENDI";/);
  });

  test("oturum yokken de ad YERELE yazılıyor", () => {
    const parca = ONBOARD.slice(ONBOARD.indexOf("if (user) {"), ONBOARD.indexOf("await savePendingCountry"));
    assert.match(parca, /else \{[\s\S]*savePendingNickname\(ad\)/);
  });
});

describe("gönderim halkası bağlı", () => {
  test("_layout bekleyen adı da flush ediyor", () => {
    assert.match(LAYOUT, /flushPendingNickname\(\)/);
    /* Ülke/takım ile AYNI etki içinde olmalı; ayrı bir etkiye koymak
     * `countryDone` bayrağının dışında kalmak demekti.
     * ⚠️ KAPANIŞ, BAŞLANGIÇTAN SONRA ARANIR: dosyada birden fazla
     * `}, [user]);` var (push etkisi de öyle bitiyor) ve düz `indexOf`
     * İLKİNİ bulup dilimi TERS çeviriyordu — ölçüt boş dizeyi sınıyordu. */
    const bas = LAYOUT.indexOf("countryDone.current = true");
    const son = LAYOUT.indexOf("}, [user]);", bas);
    assert.ok(bas > 0 && son > bas, "etki gövdesi bulunmalı");
    assert.match(LAYOUT.slice(bas, son), /flushPendingNickname/);
  });

  test("geri doldurma yüzeyi monte edilmiş", () => {
    assert.match(LAYOUT, /<NicknameBackfillPrompt \/>/);
  });

  test("reddedilen ad kuyrukta SONSUZA KADAR denenmiyor", () => {
    for (const kodAdi of ["NICKNAME_TAKEN", "NICKNAME_RESERVED", "NICKNAME_INVALID", "NICKNAME_LENGTH"]) {
      assert.match(BEKLEYEN, new RegExp(`"${kodAdi}"`), `${kodAdi} dropOnError listesinde olmalı`);
    }
  });
});

describe("NÖBETÇİ: Google adı sessizce KAYDEDİLMİYOR", () => {
  test("onboarding adı yalnızca ÖNERİ olarak kullanıyor, doğrudan göndermiyor", () => {
    /* Sunucu jetonda adı zaten görüyor (`req.firebaseUser.name`) ve onu
     * kaydetmek tek satırdı — bilerek yapılmadı. Bu test o kararın sessizce
     * geri alınmasını nöbetliyor: ad ancak `nick` durumundan, yani
     * kullanıcının GÖRDÜĞÜ alandan gönderilebilir. */
    assert.match(ONBOARD, /adOner\(user\?\.displayName\)/, "Google adı öneri olarak okunmalı");
    const gonderim = ONBOARD.slice(ONBOARD.indexOf("async function gonderAd"));
    assert.doesNotMatch(
      gonderim.slice(0, gonderim.indexOf("}")),
      /displayName/,
      "gönderim gövdesi displayName'e DOKUNMAMALI — yalnızca ekrandaki ad gider"
    );
  });

  test("kullanıcı yazmaya başladıysa öneri ÜSTÜNE YAZMIYOR", () => {
    const parca = ONBOARD.slice(ONBOARD.indexOf("adOner(user?.displayName)") - 200, ONBOARD.indexOf("adOner(user?.displayName)"));
    assert.match(parca, /if \(nick\) return;/, "dolu alan korunmalı");
  });
});
