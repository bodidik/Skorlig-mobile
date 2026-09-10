/**
 * ARKADAŞ ARAMA — istemci mantığı.
 *
 * ⚠️ ÖLÇÜLEN KUSUR (2026-09-10 TR40 denetimi, api/routes/friends.cjs:497):
 * sertleştirilmiş `GET /api/friends/search` sunucuda hazırdı ve İSTEMCİDE
 * HİÇ ÇAĞRILMIYORDU. Arkadaş ekleme akışı girdi alanına yazılan metni
 * doğrudan `/request` gövdesine koyuyordu; o uç ise metni yalnızca kimlik
 * olarak çözüyor.
 *
 * ÖLÇÜLDÜ (gerçek routes/friends.cjs + bellek-içi Mongo):
 *     "Dz87" / "dz87" / "userA"  -> 400 TO_NOT_REGISTERED
 *     28 karakterlik Firebase UID -> 200
 * Aynı metinler `/search`te kullanıcıyı buluyordu. Yani uygulamada bir kişiyi
 * bulmanın yolu yoktu; kimlik hiçbir ekranda gösterilmiyor.
 *
 * Uçtan uca kablo (bu modül + GERÇEK sunucu) ayrıca ölçülüyor:
 * `api/tests/arkadas-arama-istemci-kablosu.mongo.test.cjs`.
 *
 * Çalıştırma:  npm test   (kök: mobile/)
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { kisiAra, kimlikGibiMi, EN_AZ_HARF } from "../lib/friendSearch.ts";

/** Çağrılan yolları kaydeden sahte `apiFetch`. */
function sahteGetir(govde: any) {
  const yollar: string[] = [];
  const fn = async (yol: string) => {
    yollar.push(yol);
    if (govde instanceof Error) throw govde;
    return { json: async () => govde };
  };
  return { fn, yollar };
}

const KISI = {
  userId: "xXhSFvM1SFYN3kUYAdMGRaUkPp53",
  name: "Dz87",
  flag: "🇹🇷",
  totalPoints: 42,
  isFriend: false,
  pendingIn: false,
  pendingOut: false,
};

describe("kurulum sınandı", () => {
  test("yeterli uzunlukta sorgu GERÇEKTEN ağa çıkıyor", () => {
    /* ⚠️ Bu olmadan aşağıdaki "kısa sorgu ağa çıkmadı" iddiası hiçbir şey
     * kanıtlamaz: modül tümden bozuksa da hiçbir sorgu ağa çıkmaz. */
    const g = sahteGetir({ ok: true, items: [KISI] });
    return kisiAra("dz", g.fn).then((r) => {
      assert.equal(g.yollar.length, 1, "uzun sorgu bile aga cikmadi — olcum anlamsiz");
      assert.equal(r.durum, "ok");
      assert.equal(r.items.length, 1);
    });
  });
});

describe("kısa sorgu", () => {
  test(`${EN_AZ_HARF} harften kısa sorgu SUNUCUYA GİTMİYOR`, async () => {
    /* Her tuş vuruşunda tek harflik sorgu atmak hız sınırını yer ve
     * neredeyse tüm kullanıcı listesini döndürür. */
    const g = sahteGetir({ ok: true, items: [KISI] });
    for (const q of ["", " ", "d", "  a  "]) {
      const r = await kisiAra(q, g.fn);
      assert.equal(r.durum, "kisa", `${JSON.stringify(q)} kisa sayilmadi`);
      assert.deepEqual(r.items, []);
    }
    assert.equal(g.yollar.length, 0, "kisa sorgu aga cikti: " + g.yollar.join(", "));
  });
});

describe("istek yolu", () => {
  test("terim ve limit KAÇIRILARAK kuruluyor", async () => {
    const g = sahteGetir({ ok: true, items: [] });
    await kisiAra("ali & veli", g.fn, 5);
    assert.equal(g.yollar[0], "/api/friends/search?q=ali%20%26%20veli&limit=5",
      "sorgu dizesi kacirilmadi — & parametreyi boler");
  });

  test("Türkçe harf kaçırılıyor", async () => {
    const g = sahteGetir({ ok: true, items: [] });
    await kisiAra("İsmail", g.fn);
    assert.ok(g.yollar[0].includes(encodeURIComponent("İsmail")),
      "Turkce harf ham gonderiliyor: " + g.yollar[0]);
  });

  test("baştaki/sondaki boşluk kırpılıyor", async () => {
    const g = sahteGetir({ ok: true, items: [] });
    await kisiAra("  dz87  ", g.fn);
    assert.equal(g.yollar[0], "/api/friends/search?q=dz87&limit=20");
  });
});

describe("yanıt", () => {
  test("ok:false HATA — ekran sessizce boş kalmıyor", async () => {
    const g = sahteGetir({ ok: false, error: "Q_REQUIRED" });
    const r = await kisiAra("dz", g.fn);
    assert.equal(r.durum, "hata");
    assert.equal((r as any).hata, "Q_REQUIRED");
  });

  test("JSON değil / boş gövde HATA", async () => {
    /* apiFetch fırlatmaz, `{ ok:false, error:"BAD_JSON" }` döndürür. */
    for (const govde of [null, undefined, "<html>", { items: [KISI] }]) {
      const g = sahteGetir(govde);
      const r = await kisiAra("dz", g.fn);
      assert.equal(r.durum, "hata", `${JSON.stringify(govde)} icin hata beklenirdi`);
      assert.deepEqual(r.items, []);
    }
  });

  test("ağ fırlatırsa YAKALANIYOR — ekran donmuyor", async () => {
    const g = sahteGetir(new Error("fetch failed"));
    const r = await kisiAra("dz", g.fn);
    assert.equal(r.durum, "hata");
    assert.match((r as any).hata, /fetch failed/);
  });

  test("engellenmiş satır ELENİYOR", async () => {
    const g = sahteGetir({ ok: true, items: [
      KISI,
      { ...KISI, userId: "engelledigim", blockedByMe: true },
      { ...KISI, userId: "beni-engelleyen", blockedMe: true },
    ] });
    const r = await kisiAra("dz", g.fn);
    assert.deepEqual(r.items.map((x) => x.userId), [KISI.userId],
      "engel iliskisi olan kisi listede kaldi");
  });

  test("eksik alanlar savunmacı dolduruluyor, kimliksiz satır atılıyor", async () => {
    const g = sahteGetir({ ok: true, items: [
      { userId: "u1" },
      { userId: "  " },
      { name: "kimliksiz" },
    ] });
    const r = await kisiAra("dz", g.fn);
    assert.equal(r.items.length, 1);
    assert.deepEqual(r.items[0], {
      userId: "u1", name: "u1", flag: null, totalPoints: 0,
      isFriend: false, pendingIn: false, pendingOut: false,
    });
  });

  test("ilişki bayrakları taşınıyor — ekran 'zaten arkadaş' diyebilsin", async () => {
    const g = sahteGetir({ ok: true, items: [{ ...KISI, isFriend: true, pendingOut: true }] });
    const r = await kisiAra("dz", g.fn);
    assert.equal(r.items[0].isFriend, true);
    assert.equal(r.items[0].pendingOut, true);
  });
});

describe("kimlik gibi mi", () => {
  test("Firebase UID'si kimlik sayılıyor, isim sayılmıyor", () => {
    /* ⚠️ ESKİ YOL KAPANMIYOR: kimliği bir yerden yapıştıran kullanıcı
     * doğrudan istek gönderebilmeli, arama devreye girmemeli. */
    assert.equal(kimlikGibiMi("xXhSFvM1SFYN3kUYAdMGRaUkPp53"), true);
    assert.equal(kimlikGibiMi("  xXhSFvM1SFYN3kUYAdMGRaUkPp53  "), true);
    assert.equal(kimlikGibiMi("Dz87"), false);
    assert.equal(kimlikGibiMi("ali veli"), false);
    assert.equal(kimlikGibiMi("İsmailİsmailİsmailİsmail"), false, "Turkce harfli ad kimlik sayildi");
    assert.equal(kimlikGibiMi(""), false);
  });
});
