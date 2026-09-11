/**
 * GRUP KODU — normalleştirme, biçim kapısı ve sıralama.
 *
 * Ağ yolları GERÇEK sunucuya karşı ayrıca sınanıyor:
 * api/tests/grup-kablosu.mongo.test.cjs. Burada saf mantık ölçülüyor.
 *
 * ⚠️ HARF EKSENİ BU DEPODA TEKRAR EDEN SESSİZ HATA. `toLocaleUpperCase()`
 * Türkçe yerelde "i" harfini "İ"ye çeviriyor; kod alfabesinde öyle bir harf
 * yok, yani kullanıcının yazdığı kod sessizce geçersizleşirdi. `kodNormalle`
 * bilerek yerelden bağımsız `toUpperCase()` kullanıyor.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  kodNormalle,
  kodGecerliMi,
  grupSirala,
  KOD_ALFABE,
  KOD_UZUNLUK,
  type GrupOzet,
} from "../lib/gruplar.ts";

describe("kod normalleştirme", () => {
  test("küçük harf, boşluk ve tire temizleniyor", () => {
    assert.equal(kodNormalle(" gs-grup "), "GSGRUP");
    assert.equal(kodNormalle("ab cd ef"), "ABCDEF");
    assert.equal(kodNormalle(null), "");
    assert.equal(kodNormalle(undefined), "");
  });

  test("HARF EKSENİ: 'i' Türkçe 'İ'ye çevrilmiyor", () => {
    /* `toLocaleUpperCase("tr")` burada "İ" üretir ve alfabede o harf yok.
     * Beklenen: "i" -> "I" (alfabede olmadığı için sonra reddedilir), yani
     * sonuç her yerelde AYNI. */
    const n = kodNormalle("abcdei");
    assert.equal(n, "ABCDEI");
    assert.ok(!n.includes("İ"), `Turkce buyutme sizmis: ${JSON.stringify(n)}`);
  });
});

describe("biçim kapısı", () => {
  test("gerçek kod kabul ediliyor — bot gruplarının sabit kodu dahil", () => {
    /* Bot grupları "keşfedilebilir sabit kod" ile kuruluyor (GSGRUP gibi);
     * istemci doğrulaması onları REDDETMEMELİ. */
    for (const k of ["GSGRUP", "ABCDEF", "23456789".slice(0, 6)]) {
      assert.equal(kodGecerliMi(k), true, `${k} reddedildi`);
    }
    assert.equal(kodGecerliMi("gsgrup"), true, "kucuk harf reddedildi");
  });

  test("alfabe dışı ve yanlış uzunluk reddediliyor", () => {
    for (const k of ["ABC", "ABCDEFG", "", null, undefined]) {
      assert.equal(kodGecerliMi(k as any), false, `${JSON.stringify(k)} kabul edildi`);
    }
    /* I, O, 0, 1 bilerek alfabede yok — kod elden ele okunuyor. */
    for (const h of ["I", "O", "0", "1"]) {
      assert.ok(!KOD_ALFABE.includes(h), `${h} alfabede — karisma riski geri gelmis`);
      assert.equal(kodGecerliMi("ABCDE" + h), false, `${h} iceren kod kabul edildi`);
    }
  });

  test("alfabe ve uzunluk sunucuyla aynı", () => {
    /* api/lib/social-store.cjs code6 ile aynı olmalı; ayrışırsa istemci
     * geçerli bir kodu reddeder ve kullanıcı sebebini anlayamaz. */
    assert.equal(KOD_UZUNLUK, 6);
    assert.equal(KOD_ALFABE, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
  });
});

describe("sıralama", () => {
  const g = (code: string, size: number, sahibiMiyim: boolean, name = code): GrupOzet =>
    ({ code, name, ownerId: sahibiMiyim ? "ben" : "baskasi", size, sahibiMiyim });

  test("KENDİ kurduğun gruplar başta", () => {
    /* Kodu vermesi gereken kişi kurucu — listenin başında durmalı. */
    const s = grupSirala([g("AAAAAA", 9, false), g("BBBBBB", 2, true)]);
    assert.deepEqual(s.map((x) => x.code), ["BBBBBB", "AAAAAA"]);
  });

  test("eşitlikte kalabalık önce, sonra ada göre", () => {
    const s = grupSirala([
      g("CCCCCC", 3, false, "Ceyiz"),
      g("AAAAAA", 7, false, "Ahmet"),
      g("BBBBBB", 3, false, "Bade"),
    ]);
    assert.deepEqual(s.map((x) => x.name), ["Ahmet", "Bade", "Ceyiz"]);
  });

  test("boş liste ve null patlamıyor", () => {
    assert.deepEqual(grupSirala([]), []);
    assert.deepEqual(grupSirala(null as any), []);
  });
});
