/**
 * BİRİKİM — puan/LC artış animasyonunun saf mantığı (lib/birikim.ts).
 * Kullanıcı örneği: 10 puan + 0.7 → önce "+0.7", sonra 10.7.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { puanYaz } from "../lib/lcBicim.ts";
import { farkHesapla, birikimCoz } from "../lib/birikim.ts";

describe("farkHesapla", () => {
  test("kullanıcının örneği: 10 + 0.7 → 10.7 (kayan nokta artığı yok)", () => {
    const f = farkHesapla({ puan: 10, lc: 50 }, 10.7, 50);
    assert.equal(f.canlandir, true);
    assert.equal(f.puanArti, 0.7);
    assert.equal(puanYaz(f.yeni.puan), "10.7");
    const g = farkHesapla({ puan: 11, lc: 0 }, 11.7, 0);
    assert.equal(g.puanArti, 0.7); // 11.7 - 11 = 0.6999999999999993 ham
  });

  test("ilk açılış canlanmaz (0'dan 1987'ye sayan sayaç yalan olurdu)", () => {
    const f = farkHesapla(null, 42, 1987);
    assert.equal(f.canlandir, false);
    assert.deepEqual(f.yeni, { puan: 42, lc: 1987 });
  });

  test("değişiklik yoksa canlanmaz — odağa her dönüşte yeniden oynamasın", () => {
    assert.equal(farkHesapla({ puan: 12, lc: 30 }, 12, 30).canlandir, false);
  });

  test("LC harcaması ve puan düşüşü canlanmaz", () => {
    const f = farkHesapla({ puan: 5, lc: 100 }, 4, 97);
    assert.equal(f.canlandir, false);
    assert.equal(f.lcArti, 0);
    assert.equal(f.puanArti, 0);
  });

  test("puan düşerken LC artarsa yalnız LC canlanır", () => {
    const f = farkHesapla({ puan: 10, lc: 10 }, 9, 12);
    assert.equal(f.puanArti, 0);
    assert.equal(f.lcArti, 2);
    assert.equal(f.canlandir, true);
  });
});

describe("birikimCoz", () => {
  test("bozuk kayıt ilk açılış sayılır", () => {
    assert.equal(birikimCoz(null), null);
    assert.equal(birikimCoz("{bozuk"), null);
    assert.equal(birikimCoz(JSON.stringify({ puan: "x", lc: 1 })), null);
  });
  test("geçerli kayıt okunur", () => {
    assert.deepEqual(birikimCoz(JSON.stringify({ puan: 3, lc: 100 })), { puan: 3, lc: 100 });
  });
});

test("IARC kararı: birikim kartı sikke YIĞINI çizmiyor, tek LcSikke kullanıyor", () => {
  const kaynak = fs.readFileSync(path.join(import.meta.dirname, "..", "components", "BirikimKarti.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
  assert.ok(kaynak.includes("<LcSikke"), "LcSikke kullanılmıyor");
  assert.ok(!/Array\.from\(/.test(kaynak), "sikke dizisi (yığın) çiziliyor");
});
