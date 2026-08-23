/**
 * YANIT GÖVDESİ ÇÖZÜMÜ — GERÇEK ARIZA GÖVDELERİYLE.
 *
 * ⚠️ TOHUMLAR UYDURMA DEĞİL: aşağıdaki HTML, 2026-08-23'te canlı API'den
 * (https://skorlig87.onrender.com) BİREBİR ölçüldü. O gün servis Render'da
 * askıya alınmıştı ve `/health` dahil BEŞ ucun beşi de 503 ile bu gövdeyi
 * döndürüyordu. Uygulamadaki 170 doğrudan `.json()` çağrısının hepsi tam
 * bu gövdede fırlıyordu.
 *
 * Ölçüt: hiçbir girdide FIRLATMA, her girdide `ok` alanı okunabilir bir nesne.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
/* ⚠️ `__DEV__` REACT NATIVE GLOBALİ — Node'da tanımlı DEĞİL. `hataMesaji.ts`
 * onu okuyor; kurulmazsa aşağıdaki uçtan uca ölçüm "__DEV__ is not defined"
 * ile düşer ve sebep modülde sanılır. Kardeş test dosyası da aynısını yapıyor. */
(globalThis as any).__DEV__ = false;

import { govdeCoz } from "../lib/govdeCoz.ts";

/** Render'ın askıya alınmış servis sayfası — canlıdan alındı. */
const ASKIYA_ALINDI = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Service Suspended</title>
</head>
<body>
This service has been suspended by its owner.
</body>
</html>`;

describe("gerçek arıza gövdeleri", () => {
  test("askıya alınmış servisin HTML'i FIRLATMAZ, BAD_JSON döner", () => {
    const j = govdeCoz(ASKIYA_ALINDI);
    assert.equal(j.ok, false);
    assert.equal(j.error, "BAD_JSON");
    assert.match(j.detail, /Service Suspended/, "teşhis için gövdenin başı taşınmalı");
  });

  test("Render 502 HTML sayfası da BAD_JSON", () => {
    const j = govdeCoz("<html><body><h1>502 Bad Gateway</h1></body></html>");
    assert.equal(j.error, "BAD_JSON");
  });

  test("BOŞ gövde EMPTY_RESPONSE — BAD_JSON değil", () => {
    /* ⚠️ İkisi AYRI cümle gösteriyor (hataMesaji.ts). Soğuk kaptan gelen boş
     * gövdeye "beklenmeyen yanıt" demek, kullanıcıyı yanlış yöne gönderir. */
    for (const girdi of ["", "   ", "\n", "\r\n\t "]) {
      const j = govdeCoz(girdi);
      assert.equal(j.error, "EMPTY_RESPONSE", JSON.stringify(girdi));
    }
  });

  test("metin OLMAYAN girdi de çökertmez", () => {
    for (const girdi of [null, undefined, 42, {}, []]) {
      const j = govdeCoz(girdi);
      assert.equal(j.ok, false, JSON.stringify(girdi));
      assert.equal(j.error, "EMPTY_RESPONSE");
    }
  });
});

describe("geçerli JSON", () => {
  test("sunucu yanıtı OLDUĞU GİBİ geçer — sarmalanmaz", () => {
    /* Negatif kontrol: düzeltme başarılı yolu bozmamalı. */
    const j = govdeCoz('{"ok":true,"items":[1,2,3],"total":3}');
    assert.equal(j.ok, true);
    assert.deepEqual(j.items, [1, 2, 3]);
    assert.equal(j.total, 3);
  });

  test("sunucunun KENDİ hata nesnesi korunur", () => {
    /* `ok:false` sunucudan geliyorsa hata kodu DEĞİŞTİRİLMEMELİ — ekran
     * "LC bakiyen yetersiz" yerine "beklenmeyen yanıt" gösterirse kullanıcı
     * yapabileceği şeyi öğrenemez. */
    const j = govdeCoz('{"ok":false,"error":"LC_NOT_ENOUGH","lc":3,"needed":10}');
    assert.equal(j.error, "LC_NOT_ENOUGH");
    assert.equal(j.needed, 10);
  });
});

describe("skaler JSON", () => {
  test("SKALER gövde BAD_JSON sayılır", () => {
    /* ⚠️ `JSON.parse` bunları KABUL EDER. Çağıranlar `j?.ok` okuyor; skaler
     * dönersek `undefined` çıkıyor ve ekran "başarısız ama sebepsiz" duruma
     * düşüyor — hataMesaji yedek cümleye ("Bir şeyler ters gitti") iniyor. */
    for (const girdi of ["null", "3", '"metin"', "true"]) {
      const j = govdeCoz(girdi);
      assert.equal(j.ok, false, girdi);
      assert.equal(j.error, "BAD_JSON", girdi);
    }
  });

  test("DİZİ geçer — yük şekli denetlenmez", () => {
    /* ⚠️ İLK ÖLÇÜTÜM DİZİLERİ DE REDDEDİYORDU ve bu fazla genişti. Dizi
     * geçerli bir JSON yükü; bu fonksiyonun işi JSON OLMAYAN gövdeyi
     * yakalamak. Ölçüldü: bugün hiçbir uç çıplak dizi döndürmüyor, yani iki
     * seçim de kullanıcıyı etkilemiyor — o yüzden ileride dizi dönen bir uç
     * eklenirse sessizce kırılmayacak olan seçildi. */
    assert.deepEqual(govdeCoz("[1,2]"), [1, 2]);
  });
});

describe("hataMesaji ile uçtan uca", () => {
  test("dönen kodların HEPSİ sözlükte karşılığı olan cümlelere çevriliyor", async () => {
    /* ⚠️ Kod üretmek yetmez: sözlükte karşılığı yoksa kullanıcı yine
     * "Bir şeyler ters gitti" görür ve düzeltme hiçbir şey kazandırmaz. */
    const { hataMesaji } = await import("../lib/hataMesaji.ts");
    const yedek = "YEDEK-CUMLE";
    for (const gövde of [ASKIYA_ALINDI, "", "null"]) {
      const j = govdeCoz(gövde);
      const cumle = hataMesaji(j.error, yedek);
      assert.notEqual(cumle, yedek, `${j.error} için sözlükte cümle YOK`);
      assert.match(cumle, /tekrar dene/i, "kullanıcıya ne yapacağı söylenmeli");
    }
  });
});
