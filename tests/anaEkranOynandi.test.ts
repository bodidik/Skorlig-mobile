/**
 * ANA EKRAN "OYNADIN" DURUMU — Haftalık Tahmin ve Tek Maç kartları.
 *
 * ⚠️ KULLANICI BİLDİRİMİ (2026-09-18): "kişi kuponu oynayınca ana sayfada o
 * kupon seçenek olarak hâlâ sıfırdan sunuluyor. Tek maç/haftalık kupon...
 * Bunu oynadığımız anlaşılsın ana sayfada."
 *
 * Ölçülen üç kök neden:
 *   · Kupon kartı yalnız İLK açılışta yükleniyordu — kupon ekranında katılıp
 *     geri dönen oyuncu kartı "Katıl" ile görüyordu.
 *   · Kart hangi HAFTANIN kuponu olduğunu yazmıyordu; planlayıcı 4 hafta ileri
 *     kurduğu için W41'e katılan oyuncu W39'u aynı kupon sanıyordu (canlı).
 *   · Tek Maç kartının "gönderildi" durumu yalnız bellekteydi; sunucuya hiç
 *     sorulmuyordu (sunucu tarafı: api tests/ana-ekran-oynandi-durumu).
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { tarihAraligiEtiketi } from "../lib/macSaati.ts";
import { t, setLang } from "../lib/i18n.ts";

const KOK = path.join(import.meta.dirname, "..");
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), "utf8").replace(/\r\n?/g, "\n");
const kod = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const KUPON = kod(oku("components/KuponKarti.tsx"));
const GUNUN = kod(oku("components/DailyMatchCard.tsx"));
const SIMDI = { simdi: new Date("2026-09-18T12:00:00+03:00") };

describe("tarihAraligiEtiketi", () => {
  test("aynı ay: 25–27 Eyl (sıra ve tekrar önemsiz)", () => {
    assert.equal(tarihAraligiEtiketi(["2026-09-27T21:45:00+03:00", "2026-09-25T21:45:00+03:00", "2026-09-26T19:00:00+03:00"], SIMDI), "25–27 Eyl");
  });
  test("ay değişiyor: 30 Eyl – 2 Eki", () => {
    assert.equal(tarihAraligiEtiketi(["2026-09-30T20:00:00+03:00", "2026-10-02T20:00:00+03:00"], SIMDI), "30 Eyl – 2 Eki");
  });
  test("tek gün; yıl yalnız farklıysa; bozuk girdi boş", () => {
    assert.equal(tarihAraligiEtiketi(["2026-09-25T21:45:00+03:00", "2026-09-25T18:00:00+03:00"], SIMDI), "25 Eyl");
    assert.equal(tarihAraligiEtiketi(["2026-12-31T20:00:00+03:00", "2027-01-02T20:00:00+03:00"], SIMDI), "31 Ara – 2 Oca 2027");
    assert.equal(tarihAraligiEtiketi([null, "bozuk"], SIMDI), "");
  });
  test("İngilizce ay önde: Sep 25–27", () => {
    assert.equal(tarihAraligiEtiketi(["2026-09-25T21:45:00+03:00", "2026-09-27T21:45:00+03:00"], { ...SIMDI, yerel: "en-US" }), "Sep 25–27");
  });
});

describe("Haftalık Tahmin kartı", () => {
  test("ekrana HER DÖNÜŞTE yenileniyor (yalnız ilk açılışta değil)", () => {
    assert.match(KUPON, /useFocusEffect\(useCallback\(\(\) => \{\s*if \(oturumYukleniyor\) return;\s*yukle\(\);/);
    assert.doesNotMatch(KUPON, /useEffect\(/, "ilk-acilista-yukle deseni geri gelmis");
  });

  test("başlıkta haftanın tarih aralığı var", () => {
    assert.match(KUPON, /tarihAraligiEtiketi\(\(k\.maclar \|\| \[\]\)\.map\(\(m\) => m\.kickoffISO\)/);
    assert.match(KUPON, /alt=\{\[baslik, tarihi\(kupon\)\]\.filter\(Boolean\)\.join\(" · "\)\}/);
  });

  test("katıldığı öteki açık hafta ayrı satırda", () => {
    assert.match(KUPON, /liste\.filter\(\(k\) => k\.katildiMi && k\.id !== kupon\.id && k\.durum === "open"\)/);
    assert.match(KUPON, /t\("homeOtherJoined", \{ d: digerKatilinan\.map\(tarihi\)/);
  });
});

describe("Tek Maç kartı", () => {
  test("oynanmış maçı sunucudan okuyor ve ekrana dönüşte tazeliyor", () => {
    assert.match(GUNUN, /apiFetch\(`\/api\/pred\/flags\?fixtureIds=\$\{encodeURIComponent\(fid\)\}`\)/);
    assert.match(GUNUN, /j\.fixtures\.includes\(fid\)/);
    assert.match(GUNUN, /OUTCOMES\.find\(\(o\) => o\.api === j\.sonuclar\?\.\[fid\]\)/);
    assert.match(GUNUN, /setSubmitted\(true\);\s*\n\s*if \(secim\) setSelected\(secim\);/);
    assert.match(GUNUN, /useFocusEffect\(useCallback\(\(\) => \{ tahminiOku\(\); \}, \[tahminiOku\]\)\);/);
  });

  test("oynanmışsa seçimi yazıyor; konfeti yalnız ŞİMDİ gönderilende", () => {
    assert.match(GUNUN, /t\("predYourPick", \{/);
    assert.match(GUNUN, /\{yeniGonderildi && <Konfeti /);
    assert.match(GUNUN, /setSubmitted\(true\);\s*\n\s*setYeniGonderildi\(true\);/);
  });
});

describe("metinler", () => {
  test("TR ve EN'de var; Oyun Merkezi metninde 'kupon' kelimesi yok", () => {
    for (const dil of ["tr", "en"] as const) {
      setLang(dil);
      for (const k of ["homeOtherJoined", "predYourPick"]) {
        assert.notEqual(t(k as any), k, `${dil} ${k} eksik`);
      }
    }
    setLang("tr");
    assert.equal(t("predYourPick", { s: "Trabzonspor" }), "✓ Tahminin: Trabzonspor");
    assert.equal(t("homeOtherJoined", { d: "9–11 Eki" }), "✓ Katıldığın diğer hafta: 9–11 Eki");
    for (const k of ["homeOtherJoined", "predYourPick"]) {
      assert.doesNotMatch(t(k as any), /kupon/i, `${k} bahis dili`);
    }
  });
});
