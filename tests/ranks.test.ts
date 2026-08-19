/**
 * RÜTBE MERDİVENİ VE BAŞARIMLAR.
 *
 * Rütbe kullanıcının profilinde ve liderlik tablosunda görünüyor; yanlış
 * hesap doğrudan "hak etmediğim rütbedeyim / hak ettiğimi alamadım" demek.
 *
 * ⚠️ TEST TABLOYU KOPYALAMIYOR. Beklenen eşikleri elle yazmak totoloji
 * üretirdi: eşik değişince test de değişir ve hiçbir şey ölçmez. Onun yerine
 * merdivenin KENDİ değişmezleri sınanıyor (artan sıra, sınırda doğru rütbe,
 * ilerleme 0..1 arası) ve eşikler tablodan OKUNUYOR.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  RANKS, ACHIEVEMENTS, getRank, getNextRank, rankProgress, getUnlocked,
  type AchCtx,
} from "../lib/ranks.ts";

const bos = (): AchCtx => ({
  matches: 0, totalPoints: 0, totalEarned: 0,
  bestSeries: 0, seriesCount: 0, activeSeries: false,
});

describe("kurulum", () => {
  test("merdiven GERÇEKTEN yüklendi ve artan sırada", () => {
    /* Bu sondaj olmadan aşağıdaki her iddia tek elemanlı bir tabloda da
     * geçerdi. Ayrıca artan sıra, `getRank` döngüsünün doğruluk şartı. */
    assert.ok(RANKS.length >= 2, "merdivende en az iki rutbe olmali");
    for (let i = 1; i < RANKS.length; i++) {
      assert.ok(RANKS[i].minPts > RANKS[i - 1].minPts,
        `${RANKS[i].key} esigi (${RANKS[i].minPts}) oncekinden buyuk degil — ` +
        "getRank son eslesen rutbeyi secer, siralama bozulursa yanlis rutbe verir");
    }
    assert.equal(RANKS[0].minPts, 0, "ilk rutbenin esigi 0 olmali");
  });
});

describe("getRank", () => {
  test("her eşiğin TAM ÜSTÜNDE o rütbe veriliyor", () => {
    for (const r of RANKS) {
      assert.equal(getRank(r.minPts).key, r.key,
        `${r.minPts} puanda ${r.key} beklenirdi`);
    }
  });

  test("eşiğin BİR ALTINDA bir önceki rütbe veriliyor", () => {
    /* Sınırın iki yanı: yalnızca "eşikte doğru" demek, `>=` yerine `>`
     * yazılmış bir merdiveni yakalamaz. */
    for (let i = 1; i < RANKS.length; i++) {
      assert.equal(getRank(RANKS[i].minPts - 1).key, RANKS[i - 1].key,
        `${RANKS[i].minPts - 1} puanda ${RANKS[i - 1].key} beklenirdi`);
    }
  });

  test("negatif ve sıfır puan en alt rütbeye düşüyor", () => {
    /* Puan CEZAYLA negatif olabiliyor (settle2). Tanımsız bir rütbe
     * dönerse profil ekranı çöker. */
    assert.equal(getRank(0).key, RANKS[0].key);
    assert.equal(getRank(-50).key, RANKS[0].key, "negatif puanda rutbe bulunamadi");
  });

  test("tavanın üstünde en yüksek rütbede kalıyor", () => {
    const son = RANKS[RANKS.length - 1];
    assert.equal(getRank(son.minPts * 10).key, son.key);
  });
});

describe("getNextRank ve rankProgress", () => {
  test("en üst rütbede sonraki YOK ve ilerleme tam", () => {
    const son = RANKS[RANKS.length - 1];
    assert.equal(getNextRank(son.minPts), null, "en ust rutbede sonraki dondu");
    assert.equal(rankProgress(son.minPts), 1);
  });

  test("EKSİ puanda sonraki rütbe DOĞRU, çubuk BOŞ", () => {
    /**
     * ⚠️ GERÇEK KUSUR — mutasyon süpürmesinin kaçağı buraya çıktı.
     * `rankProgress`teki 0..1 kırpması kaldırıldığında hiçbir test
     * düşmüyordu; sebebi kırpmanın gereksiz olması değil, ULAŞILAMAZ
     * olmasıydı. Eski `getNextRank` "eşiği puandan büyük İLK rütbe" diyordu
     * ve puan negatifken MEVCUT rütbeyi döndürüyordu (Çaylak, eşik 0).
     * Sonra `rankProgress` `range = 0` görüp erken `return 1` yapıyordu:
     *
     *     -100 puan → rütbe Çaylak, sonraki Çaylak, ilerleme %100
     *
     * Yani sıfırın altındaki kullanıcı çubuğu TAMAMEN DOLU görüyordu.
     * Eksi puan gerçek: settle2 ceza yazıyor, üretim liderlik verisinde
     * negatif satırlar ölçüldü.
     */
    for (const p of [-1, -100, -9999]) {
      const sonraki = getNextRank(p);
      assert.notEqual(sonraki, null, `${p} puanda sonraki rutbe yok dendi`);
      assert.equal(sonraki!.key, RANKS[1].key,
        `${p} puanda sonraki rutbe ${sonraki!.label} — mevcut rutbe "sonraki" ` +
        "gibi donduruluyor olabilir");
      assert.equal(rankProgress(p), 0,
        `${p} puanda ilerleme ${rankProgress(p)} — sifirin altindaki kullanici ` +
        "cubugu dolu goruyor");
    }
  });

  test("ilerleme DAİMA 0..1 aralığında", () => {
    /* Arayüz bunu doğrudan çubuk genişliğine çeviriyor; 1'i aşan bir değer
     * çubuğu kutusundan taşırır, negatif değer ters çizer. */
    for (const p of [-100, -1, 0, 1, 49, 50, 199, 1000, 2000, 99999]) {
      const x = rankProgress(p);
      assert.ok(x >= 0 && x <= 1, `${p} puanda ilerleme ${x} — 0..1 disinda`);
    }
  });

  test("eşiğe yaklaştıkça ilerleme ARTIYOR", () => {
    /* Değişmezi tablodan türetiyoruz, sabit sayı yazmıyoruz. */
    const alt = RANKS[0].minPts, ust = RANKS[1].minPts;
    const a = rankProgress(alt);
    const b = rankProgress(Math.floor((alt + ust) / 2));
    const c = rankProgress(ust - 1);
    assert.ok(a < b && b < c, `ilerleme artmiyor: ${a} → ${b} → ${c}`);
  });
});

describe("başarımlar", () => {
  test("boş profilde HİÇBİRİ açık değil", () => {
    /* Yeni kullanıcıya hak etmediği rozeti göstermek, rozet sisteminin
     * anlamını tümden siler. */
    assert.deepEqual(getUnlocked(bos()), [],
      "hicbir sart saglanmadan rozet acildi");
  });

  test("her başarımın eşiği GERÇEKTEN sınanıyor", () => {
    /**
     * ⚠️ Bu, rozet başına iki yönlü ölçüm: `check` her zaman true dönen bir
     * fonksiyona dönüşürse boş profil testi yakalar; her zaman false dönerse
     * bu test yakalar. Tek yönlü olsa mutasyonun yarısı kaçardı.
     */
    const alanlar: Array<keyof AchCtx> = [
      "matches", "totalPoints", "totalEarned", "bestSeries", "seriesCount",
    ];
    for (const a of ACHIEVEMENTS) {
      const doygun: AchCtx = { ...bos(), activeSeries: true };
      for (const k of alanlar) (doygun as any)[k] = 1_000_000;
      assert.equal(a.check(doygun), true,
        `${a.key} her sart saglandiginda bile acilmiyor`);
    }
  });

  test("rozet anahtarları tekil", () => {
    const anahtarlar = ACHIEVEMENTS.map((a) => a.key);
    assert.equal(new Set(anahtarlar).size, anahtarlar.length,
      "ayni anahtarli iki rozet var — liste render'inda key cakisir");
  });

  test("rütbe anahtarları tekil", () => {
    const anahtarlar = RANKS.map((r) => r.key);
    assert.equal(new Set(anahtarlar).size, anahtarlar.length);
  });
});
