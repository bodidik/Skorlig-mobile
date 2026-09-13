import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  siraHaritasi, siraFarklari, podyumDegistiMi,
  girisGecikmesi, sayacKaresi, ADIM_MS, EN_COK_MS,
} from "../lib/yarisHareketi.ts";

/**
 * YARIŞ HAREKETİ.
 *
 * ⚠️ BU KURAL EKRANIN İÇİNDEYDİ ve ölçülemiyordu. En kırılgan yeri:
 * yanlış hesaplanan bir "▲3" kullanıcıya OLMAYAN bir yükseliş gösterir —
 * ve bu ekran kullanıcının dakikalarca izleyeceği ekran.
 */

const s = (liste: [string, number][]) => liste.map(([userId, rank]) => ({ userId, rank }));

describe("sıra farkları", () => {
  test("ilk yüklemede hareket YOK", () => {
    /* ⚠️ Önceki anlık görüntü yokken her satır "değişmiş" sayılsaydı ekran
     * açılışta baştan aşağı ▲▼ ile dolardı; hiçbiri gerçek olmazdı. */
    const yeni = siraHaritasi(s([["a", 1], ["b", 2]]));
    assert.deepEqual(siraFarklari(null, yeni), {});
    assert.deepEqual(siraFarklari(new Map(), yeni), {});
  });

  test("yükselen pozitif, düşen negatif", () => {
    const onceki = siraHaritasi(s([["a", 1], ["b", 2], ["c", 3]]));
    const yeni = siraHaritasi(s([["c", 1], ["a", 2], ["b", 3]]));
    const d = siraFarklari(onceki, yeni);
    assert.equal(d["c"], 2, "3 -> 1 iki basamak YUKSELDI");
    assert.equal(d["a"], -1, "1 -> 2 dustu");
    assert.equal(d["b"], -1);
  });

  test("sırası değişmeyen listeye girmiyor", () => {
    const onceki = siraHaritasi(s([["a", 1], ["b", 2]]));
    const yeni = siraHaritasi(s([["a", 1], ["b", 2]]));
    assert.deepEqual(siraFarklari(onceki, yeni), {});
  });

  test("İLK KEZ görülen satır 'yükseldi' SAYILMIYOR", () => {
    /* ⚠️ Uç yalnızca ilk N'i gonderiyor. 51. siradan listeye giren biri
     * icin "▲" basmak olcmedigimiz bir seyi iddia etmek olurdu. */
    const onceki = siraHaritasi(s([["a", 1], ["b", 2]]));
    const yeni = siraHaritasi(s([["a", 1], ["b", 2], ["yeni", 3]]));
    assert.deepEqual(siraFarklari(onceki, yeni), {}, "yeni satir hareket uretmemeli");
  });

  test("listeden düşen satır için delta üretilmiyor", () => {
    const onceki = siraHaritasi(s([["a", 1], ["b", 2], ["c", 3]]));
    const yeni = siraHaritasi(s([["a", 1], ["b", 2]]));
    assert.deepEqual(siraFarklari(onceki, yeni), {}, "yanittan cikan satir icin iddia yok");
  });

  test("büyük/küçük harf ayrışması delta üretmiyor", () => {
    /* ⚠️ Kimlik harf düzeni bu depoda kayıtlı bir sessiz hata sınıfı. */
    const onceki = siraHaritasi(s([["xXhSFvM1", 1]]));
    const yeni = siraHaritasi(s([["xxhsfvm1", 1]]));
    assert.deepEqual(siraFarklari(onceki, yeni), {});
  });

  test("bozuk satır çökertmiyor", () => {
    const m = siraHaritasi([
      { userId: "", rank: 1 } as any,
      { userId: "a", rank: NaN } as any,
      { userId: "b", rank: 2 },
    ]);
    assert.equal(m.size, 1);
    assert.equal(m.get("b"), 2);
  });
});

describe("podyum", () => {
  test("ilk yüklemede parlamıyor", () => {
    assert.equal(podyumDegistiMi(null, s([["a", 1], ["b", 2], ["c", 3]])), false);
    assert.equal(podyumDegistiMi([], s([["a", 1]])), false);
  });

  test("ilk üçün SIRASI değişince parlıyor", () => {
    const onceki = s([["a", 1], ["b", 2], ["c", 3], ["d", 4]]);
    const yeni = s([["b", 1], ["a", 2], ["c", 3], ["d", 4]]);
    assert.equal(podyumDegistiMi(onceki, yeni), true);
  });

  test("yalnızca DÖRDÜNCÜ değişince parlamıyor", () => {
    const onceki = s([["a", 1], ["b", 2], ["c", 3], ["d", 4]]);
    const yeni = s([["a", 1], ["b", 2], ["c", 3], ["e", 4]]);
    assert.equal(podyumDegistiMi(onceki, yeni), false, "podyum disi degisim parlatmamali");
  });

  test("puan değişip sıra durunca parlamıyor", () => {
    /* ⚠️ Sayı her yoklamada oynuyor; her oynamada parlatmak ekranı yanıp
     * sönen bir şeye çevirir ve GERÇEK devir teslim fark edilmez olur. */
    const onceki = s([["a", 1], ["b", 2], ["c", 3]]);
    const yeni = s([["a", 1], ["b", 2], ["c", 3]]);
    assert.equal(podyumDegistiMi(onceki, yeni), false);
  });
});

describe("giriş sahnesi", () => {
  test("kademeli ama ÜST SINIRLI", () => {
    /* 25 satirda toplam 2 saniyeyi bulsaydi kullanici tabloyu okumak icin
     * beklerdi — gosteri bilginin onune gecmemeli. */
    assert.equal(girisGecikmesi(0), 0);
    assert.equal(girisGecikmesi(1), ADIM_MS);
    assert.equal(girisGecikmesi(100), EN_COK_MS, "ust sinir uygulanmali");
    assert.ok(EN_COK_MS <= 600, "giris sahnesi yarim saniyeyi asmamali");
  });

  test("bozuk indeks 0 gecikme", () => {
    assert.equal(girisGecikmesi(-5), 0);
    assert.equal(girisGecikmesi(NaN), 0);
  });
});

describe("sayaç karesi", () => {
  test("son kare TAM hedef", () => {
    /* ⚠️ 0.999'da hedefin bir eksiginde donan bir sayac ("24 / 25") veriyi
     * YANLIS soyler. Bitis degeri yuvarlamaya birakilmaz. */
    assert.equal(sayacKaresi(25, 1), 25);
    assert.equal(sayacKaresi(25, 1.5), 25);
    assert.equal(sayacKaresi(25, 0.5), 13);
    assert.equal(sayacKaresi(25, 0), 0);
  });

  test("bozuk girdi çökertmiyor", () => {
    assert.equal(sayacKaresi(NaN as any, 0.5), 0);
    assert.equal(sayacKaresi(25, NaN), 25, "olculemeyen oran son kareye dussun");
    assert.equal(sayacKaresi(25, -1), 0);
  });
});
