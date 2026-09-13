import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { t, setLang } from "../lib/i18n.ts";
import { EN_AZ_HARF } from "../lib/aramaSuzgeci.ts";

/**
 * ARAMA YÜZEYLERİ — kutu gerçekten bağlı mı, süzgeç gerçekten uygulanıyor mu.
 *
 * ⚠️ SAF MODÜLÜN YEŞİL OLMASI YETMEZ. `aramaSuzgeci.test.ts` kuralın doğru
 * olduğunu gösteriyor; bu dosya kuralın EKRANA BAĞLI olduğunu gösteriyor.
 * İkisi ayrı iddia: süzgeç kusursuz çalışıp hiçbir listeye uygulanmıyor
 * olabilir ve iki test de yeşil kalırdı — deponun "0 kusur ile 0 ölçüm aynı
 * görünür" tuzağı.
 *
 * ⚠️ KULLANICI İSTEĞİ (2026-09-13): "hem canlı maçlarda, hem tahmin
 * listelerinde, hem başarı listelerinde ... 3 harf yazınca öneriler."
 * Üç yüzeyin üçü de burada sayılıyor.
 */

const KOK = path.join(import.meta.dirname, "..");
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), "utf8").replace(/\r\n?/g, "\n");

const YUZEYLER = [
  { dosya: "app/(tabs)/live.tsx", ad: "canli maclar" },
  { dosya: "app/(tabs)/stats.tsx", ad: "siralama sekmesi" },
  { dosya: "app/(tabs)/kings.tsx", ad: "krallar tablosu" },
];

describe("arama kutusu üç yüzeyde de bağlı", () => {
  for (const y of YUZEYLER) {
    test(`${y.ad}: kutu içe aktarılmış ve çiziliyor`, () => {
      const src = oku(y.dosya);
      assert.match(src, /import AramaKutusu from/, `${y.ad}: bilesen ice aktarilmamis`);
      assert.match(src, /<AramaKutusu/, `${y.ad}: kutu cizilmiyor`);
      assert.match(src, /from "\.\.\/\.\.\/lib\/aramaSuzgeci"/, `${y.ad}: suzgec ice aktarilmamis`);
    });
  }

  test("canlı sekmesi İKİ liste süzüyor — maçlar ve tahminler", () => {
    /* Kullanici "tahmin listeleri"ni ayrica istedi; o liste predict.tsx'te
     * degil canli sekmesinin "benim tahminlerim" kipinde duruyor. */
    const src = oku("app/(tabs)/live.tsx");
    assert.equal((src.match(/<AramaKutusu/g) || []).length, 2,
      "canli sekmesinde iki arama kutusu olmali (maclar + tahminlerim)");
    assert.match(src, /suzulmusGuncel\.map/, "guncel tahminler suzulmus listeden cizilmiyor");
    assert.match(src, /suzulmusEski\.map/, "eski tahminler suzulmus listeden cizilmiyor");
  });

  test("maç listesi SÜZÜLMÜŞ diziden çiziliyor", () => {
    /* ⚠️ ASIL TUZAK BU: kutu ekranda durur, `data` hala ham listedir ve
     * yazmak hicbir sey degistirmez — deponun "ekranda duran ama hicbir seyi
     * degistirmeyen kontrol" sinifi. */
    const src = oku("app/(tabs)/live.tsx");
    assert.match(src, /: suzulmusListe\n/, "FlatList ham listeyi ciziyor");
    assert.match(src, /suzulmusListe\[index - 1\]/,
      "grup basligi ham listeye bakiyor — suzunce yanlis baslik basar");
  });

  test("sıralama ekranları süzülmüş diziden çiziliyor", () => {
    const stats = oku("app/(tabs)/stats.tsx");
    assert.match(stats, /gosterilenRows\.slice\(0, gosterilecek\)\.map/, "stats ham listeyi ciziyor");
    const kings = oku("app/(tabs)/kings.tsx");
    assert.match(kings, /gosterilenSatirlar\.slice\(0, gosterilecek\)\.map/, "kings ham listeyi ciziyor");
  });
});

describe("yüklü listeden fazlası", () => {
  /* ⚠️ ÖLÇÜLDÜ (2026-09-13, canli): /api/rt/totals 1701 satir donduruyor,
   * kings 300 yukluyor. Yerel suzgec %82'yi goremez; "bulunamadi" demek
   * orada YALAN olur. Iki ekran da tamamini aramayi TEKLIF etmeli. */
  test("sıralama ekranları bulunamayınca tam listeyi teklif ediyor", () => {
    for (const d of ["app/(tabs)/stats.tsx", "app/(tabs)/kings.tsx"]) {
      const src = oku(d);
      assert.match(src, /searchBeyondPage/, `${d}: teklif metni yok`);
      assert.match(src, /tamListedeAra/, `${d}: tam arama yolu yok`);
      assert.match(src, /durum === "bulunamadi"/, `${d}: teklif bulunamadi durumuna bagli degil`);
    }
  });

  test("teklif KENDİLİĞİNDEN indirmiyor — dokunmaya bağlı", () => {
    /* Tam liste 182 KB (olculdu). Her tus vurusunda indirmek kabul edilemez;
     * teklif bir dugme, otomatik bir etki degil. */
    const kings = oku("app/(tabs)/kings.tsx");
    assert.match(kings, /onPress=\{tamListedeAra\}/, "teklif dugmeye bagli degil");
    assert.doesNotMatch(kings, /useEffect\([^)]*tamListedeAra/,
      "tam arama bir etkiden tetikleniyor — kullanici istemeden indirir");
  });
});

describe("sıralamada gösterilen ad", () => {
  test("displayName eşlemeye kopyalanıyor", () => {
    /* ⚠️ ÖLÇÜLEN KUSUR: `stats.tsx` esleme fonksiyonu bu alani DUSURUYORDU,
     * yani `gorunenAd()` sessizce userId yedegine iniyordu ve tablo insan
     * kullanicinin 28 karakterlik Firebase kimligini basiyordu. Ayni dosyanin
     * kendi yorumlari ayni tuzagi UC kez kaydetmis (qualified/minPlayed/cups).
     * Canlida gorunmuyordu cunku 1701 satirin 1701'i bot ve bot kimligi ad
     * gibi gorunuyor ("Eden49"). */
    const src = oku("app/(tabs)/stats.tsx");
    assert.match(src, /displayName: t\.displayName/, "displayName eslemede yok");
    assert.match(src, /displayName\?: string \| null;/, "displayName tipte yok");
  });

  test("arama EKRANIN BASTIĞI adı sürüyor, kendi kopyasını değil", () => {
    for (const d of ["app/(tabs)/stats.tsx", "app/(tabs)/kings.tsx"]) {
      const src = oku(d);
      /* ⚠️ DESEN `[^)]*` İLE YAZILMIŞTI ve düştü: ara ok fonksiyonunun kendi
       * parantezi (`(r) =>`) sınıfı kapatıyor, `gorunenAd(r)`a hiç
       * ulaşamıyordu. Kusur kodda değil ölçütteydi. */
      assert.match(src, /suz\([\s\S]{0,160}?gorunenAd\(r\)/,
        `${d}: arama gorunenAd yerine kendi alan listesine bakiyor`);
    }
  });
});

describe("metinler", () => {
  test("arama metinleri iki dilde de var", () => {
    for (const dil of ["tr", "en"] as const) {
      setLang(dil);
      for (const k of ["searchPlaceholder", "searchTeams", "searchPeople",
        "searchMinChars", "searchNoResult", "searchCount", "searchClear",
        "searchBeyondPage"] as const) {
        const m = t(k);
        assert.ok(m && m !== k && m.length > 2, `${dil}/${k} cevrilmemis`);
      }
    }
    setLang("tr");
  });

  test("eşik metne GÖMÜLÜ değil — yer tutucudan geliyor", () => {
    /* ⚠️ `EN_AZ_HARF` bir gun 2 ya da 4 olursa metin yalan soylemesin.
     * Ayni sinif "nasil oynanir" sayfasinda da nobette. */
    setLang("tr");
    const ham = oku("lib/i18n.ts").split("\n").filter((l) => /^\s*searchMinChars:/.test(l));
    assert.equal(ham.length, 2, "tr ve en olmali");
    for (const satir of ham) {
      assert.match(satir, /\{n\}/, "esik yer tutucusu yok");
      assert.doesNotMatch(satir.slice(satir.indexOf(":") + 1).replace(/\{n\}/g, ""), /[0-9]/,
        "metne sabit rakam gomulmus");
    }
    assert.match(t("searchMinChars", { n: String(EN_AZ_HARF) }), /3/,
      "yer tutucu doldurulunca esik gorunmeli");
  });
});
