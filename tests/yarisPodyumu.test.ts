import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { t, setLang } from "../lib/i18n.ts";

/**
 * YARIŞ PODYUMU — bileşen bağlı mı, kurallar yerinde mi.
 *
 * ⚠️ KULLANICI İSTEĞİ (2026-09-13): "tahmin sıralama yarışının daha göze
 * çarpan şekilde sunulması ve sayfaya girince canlı değişimlerin göze hitap
 * eder değişimi ... kişinin dakikalarca o sayfayı takip edeceğini unutmayalım."
 */

const KOK = path.join(import.meta.dirname, "..");
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), "utf8").replace(/\r\n?/g, "\n");

describe("podyum ekrana bağlı", () => {
  const ekran = oku("app/match-race/[fixtureId].tsx");

  test("içe aktarılmış ve çiziliyor", () => {
    assert.match(ekran, /import YarisPodyumu from/, "bilesen ice aktarilmamis");
    assert.match(ekran, /<YarisPodyumu/, "podyum cizilmiyor");
  });

  test("eski 'yarışta N/M' çubuğu KALDIRILDI — sayı iki yerde yazmıyor", () => {
    /* ⚠️ Podyum sayacı ile eski çubuk yan yana dursaydı aynı sayı ekranda
     * iki kez görünürdü; ikisi ayrışınca hangisinin doğru olduğu
     * anlaşılmazdı — deponun "iki gerçeklik" sınıfı. */
    assert.doesNotMatch(ekran, /\{data\.inRaceCount\} \/ \{data\.totalPlayers\}/,
      "eski sayac cubugu hala duruyor");
    /* ⚠️ İLK YAZIMDA `inRaceCount` GEÇİŞLERİNİ SAYDIM ve iddia düştü: tip
     * bildirimi (`inRaceCount?: number`) de sayılıyordu. Sayılması gereken
     * OKUMA, yani `data.inRaceCount`. Kusur koddaydı sandım, ölçütteydi. */
    assert.equal((ekran.match(/data\.inRaceCount/g) || []).length, 1,
      "inRaceCount ekranda tek yerde OKUNMALI (podyuma gecilen prop)");
  });

  test("hareket hesabı ekranın içinde DEĞİL, yaprak modülde", () => {
    /* Kural `useEffect` govdesindeyken olculemiyordu. */
    assert.match(ekran, /from "\.\.\/\.\.\/lib\/yarisHareketi"/, "modul ice aktarilmamis");
    assert.match(ekran, /siraFarklari\(oncekiSiralar\.current, yeni\)/,
      "ekran hala kendi kopyasini hesapliyor");
    assert.doesNotMatch(ekran, /if \(o != null && o !== sira\)/,
      "eski elle hesap satiri duruyor — iki gerceklik");
  });
});

describe("giriş hareketi SAHTE DEĞİL", () => {
  const bilesen = oku("components/YarisPodyumu.tsx");

  test("podyum parıltısı ilk yüklemede çalışmıyor", () => {
    /* ⚠️ Ekranin kendi kurali "acilista yapay hareket olmasin" ve HAKLI.
     * Girisdeki hareket bir DEGISIM iddiasi tasimiyor: duran tabloyu aciyor.
     * Parilti ise yalnizca GERCEK devir teslimde. */
    assert.match(bilesen, /podyumDegistiMi\(onceki, ilkUc\)/,
      "parilti gercek degisime bagli degil");
    assert.match(bilesen, /oncekiPodyum = useRef<PodyumSatiri\[\] \| null>\(null\)/,
      "onceki podyum tutulmuyor");
  });

  test("giriş sahnesi bir KEZ oynuyor", () => {
    /* Her yoklamada yeniden sahnelenseydi 20 saniyede bir tablo yeniden
     * kurulur, okumak imkansizlasirdi. */
    assert.match(bilesen, /if \(acildi \|\| ilkUc\.length === 0\) return;/,
      "giris sahnesi tekrar tekrar oynayabilir");
  });

  test("sayaç yerel sürücü KULLANMIYOR", () => {
    /* ⚠️ useNativeDriver yalnizca donusum ve opakligi tasiyor; METIN degerini
     * degistiremiyor. `true` verilseydi sayac hic saymazdi. */
    assert.match(bilesen, /duration: SAYAC_MS[\s\S]{0,80}useNativeDriver: false/,
      "sayac animasyonu yerel surucuyle yazilmis — metin degismez");
  });

  test("nabız yalnızca maç canlıyken atıyor", () => {
    /* Biten macta nabiz atmak "birseyler oluyor" yalani soyler. */
    assert.match(bilesen, /if \(!canli\) return;/, "nabiz canli kapisina bagli degil");
  });
});

describe("sıralama anahtarı yazılı", () => {
  test("podyum sıranın neye göre olduğunu söylüyor", () => {
    /* ⚠️ OLCULDU (2026-09-13, canli): sunucu inRace -> distance -> points
     * siraliyor. Bir yuzeyde 5.7 puanli oyuncu -1.1 puanlinin ALTINDA
     * gorunuyor. Anahtari yazmayan tablo keyfi gorunur — ayni kusur
     * rating/ratingRaw ile olculmustu. */
    const bilesen = oku("components/YarisPodyumu.tsx");
    assert.match(bilesen, /raceOrderHint/, "siralama anahtari ekranda yazmiyor");
  });

  test("ipucu metni iki dilde ve puanı tek ölçüt göstermiyor", () => {
    for (const dil of ["tr", "en"] as const) {
      setLang(dil);
      for (const k of ["raceBoardTitle", "raceStillIn", "raceOrderHint"] as const) {
        const m = t(k);
        assert.ok(m && m !== k && m.length > 2, `${dil}/${k} cevrilmemis`);
      }
    }
    setLang("tr");
    assert.match(t("raceOrderHint"), /yakın/i, "tr ipucu yakinlik anahtarini soylemiyor");
    setLang("en");
    assert.match(t("raceOrderHint"), /closest/i, "en ipucu yakinlik anahtarini soylemiyor");
    setLang("tr");
  });
});
