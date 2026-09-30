/**
 * LC VE PUAN GÖSTERİMİ — kayan nokta artığı ekrana basılmamalı.
 *
 * Bu modülün kendi başlığı kusuru ölçümle anlatıyor ve ikisi de ÜRETİMDE
 * görülmüş:
 *
 *     cüzdan:     "37.999999999999986 LC"   (20 kez 1.9 eklenince)
 *     liderlik:   "5.717648576819556e-17p"  (gerçekte sıfır)
 *
 * Kaynak taraf da düzeltildi ama depoda ZATEN kirli veri var ve o satırlar
 * yeniden hesaplanmıyor — yani buradaki koruma kalıcı. Test de bu yüzden
 * gerçek üretim değerleriyle yazıldı, uydurma sayılarla değil.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { lcYaz, puanYaz } from "../lib/lcBicim.ts";

describe("lcYaz — cüzdan tutarı", () => {
  test("kayan nokta artığı temizleniyor (üretimde görülen değer)", () => {
    assert.equal(lcYaz(37.999999999999986), "38",
      "IEEE754 artigi ekrana basiliyor");
    assert.equal(lcYaz(569.9999999999998), "570");
  });

  test("gerçek kesirli tutar KORUNUYOR", () => {
    /* Negatif kontrol: düzeltme "hepsini tam sayıya yuvarla" olmamalı.
     * Düello ödülü gerçekten kesirli (stake 1 → 1.9) ve kullanıcı bunu
     * doğru görmeli. */
    assert.equal(lcYaz(1.9), "1.9", "gercek kesirli tutar yutuldu");
    assert.equal(lcYaz(5.7), "5.7");
    assert.equal(lcYaz(0.1), "0.1");
  });

  test("TEK ondalık hane (kullanıcı kararı 2026-09-30)", () => {
    assert.equal(lcYaz(12.36), "12.4", "iki ondalik basiliyor");
    assert.equal(lcYaz(3.84), "3.8");
    assert.equal(puanYaz(47.25001), "47.3");
    assert.equal(puanYaz(-2.66), "-2.7");
  });

  test("gereksiz sıfır yazılmıyor", () => {
    assert.equal(lcYaz(38), "38");
    assert.equal(lcYaz(38.0), "38");
    assert.equal(lcYaz(1.9), "1.9");   // 1.90 değil
  });

  test("geçersiz girdi 0 döner, NaN basılmaz", () => {
    /* Ekranda "NaN LC" görmek, kullanıcının bakiyesi konusunda en kötü
     * bilgilendirmedir. */
    for (const g of [null, undefined, NaN, "abc" as any, {} as any]) {
      assert.equal(lcYaz(g), "0", `${String(g)} icin 0 beklenirdi`);
    }
  });

  test("çok küçük artık sıfır olarak yazılıyor", () => {
    assert.equal(lcYaz(5.717648576819556e-17), "0",
      "bilimsel gosterim ekrana sizdi");
  });
});

describe("puanYaz — puan gösterimi", () => {
  test("üretimde ölçülen kirli değerler temizleniyor", () => {
    /* data/leaderboard.json'dan alınan gerçek satırlar. */
    assert.equal(puanYaz(5.717648576819556e-17), "0");
    assert.equal(puanYaz(-1.4420000000000002), "-1.4");
    assert.equal(puanYaz(0.9270000000000002), "0.9");
  });

  test("NEGATİF puan korunuyor (ceza görünür olmalı)", () => {
    /* `lcYaz`dan ayrı tutulmasının sebebi: puan negatif olabilir, LC olamaz.
     * Ceza gizlenirse kullanıcı neden puan kaybettiğini anlamaz. */
    assert.equal(puanYaz(-3), "-3");
    assert.equal(puanYaz(-0.5), "-0.5");
  });

  test("geçersiz girdi 0 döner", () => {
    for (const g of [null, undefined, NaN, "x" as any]) {
      assert.equal(puanYaz(g), "0");
    }
  });
});
