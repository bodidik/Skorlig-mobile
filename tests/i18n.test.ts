/**
 * ÇEVİRİ ÇEKİRDEĞİ — `t()`, dil seçimi, abonelik.
 *
 * Bu modül 3499 satır ve UYGULAMANIN HER EKRANINDA kullanılıyor, ama tek
 * satırlık bir `import { Platform, NativeModules } from "react-native"`
 * yüzünden Node altında yüklenemiyor ve hiç ölçülemiyordu. RN bağımlılığı
 * yalnızca cihaz dilini okuyan ~15 satırdaydı; o kısım tembel `require`'a
 * çevrildi (hemen yanındaki expo-localization ile aynı kalıp) ve modülün
 * tamamı ölçülebilir hâle geldi.
 *
 * Buradaki üç kural da ÜRETİMDE yaşanmış kusurlardan geliyor; hepsi
 * kaynaktaki yorumlarda ölçümüyle yazılı:
 *   · Türkçe telefonda uygulama İngilizce açılıyordu (bridgeless RN'de
 *     NativeModules yolu undefined dönüyor, sessizce "en" yedeğine düşüyordu)
 *   · Dil seçimi ekranı yenilemiyordu (modül değişkenini React izlemez)
 *   · "Tercihi kaldır" düğmesi hiçbir şey yapmıyordu (`if (lang && …)`
 *     boş değeri sessizce yutuyordu)
 */

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { t, getLang, setLang, dilAboneOl } from "../lib/i18n.ts";

const KOK = path.dirname(fileURLToPath(import.meta.url));
const I18N_YOL = path.join(KOK, "..", "lib", "i18n.ts");

beforeEach(() => { setLang("tr"); });

describe("kurulum", () => {
  test("modül Node altında GERÇEKTEN yüklendi", () => {
    /**
     * ⚠️ ASIL NÖBETÇİ. Biri bu dosyaya statik `react-native` içe aktarımı
     * geri koyarsa modül yüklenemez olur ve aşağıdaki testlerin HEPSİ
     * sessizce çalışmaz. Yüklenebilirliğin kendisi ölçülüyor.
     */
    for (const f of [t, getLang, setLang, dilAboneOl]) {
      assert.equal(typeof f, "function");
    }
  });

  test("kaynakta STATİK react-native içe aktarımı YOK", () => {
    /* Yukarıdaki test yalnızca bu süreçte yüklenebildiğini gösterir;
     * bu, kuralın kaynakta korunduğunu gösteriyor. */
    const src = fs.readFileSync(path.join(KOK, "..", "lib", "i18n.ts"), "utf8");
    const statik = src
      .split(/\r?\n/)
      .filter((l) => /^\s*import\s.*from\s+["']react-native["']/.test(l));
    assert.deepEqual(statik, [],
      "statik react-native ice aktarimi geri gelmis — modul Node altinda " +
      "yuklenemez olur ve i18n testleri sessizce calismaz");
  });
});

describe("t() — çeviri ve yedekler", () => {
  test("Türkçe metin dönüyor", () => {
    setLang("tr");
    assert.equal(t("matches" as any), "Maçlar");
  });

  test("dil değişince metin de değişiyor", () => {
    /* Sondaj: `t` her zaman aynı dizeyi döndürseydi yukarıdaki iddia da
     * geçerdi ve dil seçiminin işlediği ölçülmezdi. */
    setLang("tr");
    const tr = t("matches" as any);
    setLang("en");
    const en = t("matches" as any);
    assert.notEqual(tr, en, `iki dilde ayni metin dondu: ${JSON.stringify(tr)}`);
  });

  test("kapsam dışı dilde HİÇBİR anahtar ham basılmıyor (İngilizce yedek)", () => {
    /**
     * Bilinçli kapsam kararı: yeni anahtarlar yalnızca tr+en olarak
     * ekleniyor, öteki diller İngilizce yedeğe düşüyor. Yedek çalışmazsa
     * kullanıcı ekranda ham anahtar görür ("myBets" gibi).
     *
     * ⚠️ TEK ANAHTAR SEÇMEK YANILTTI. İlk sürümde `myBets` kullandım ve test
     * düştü: o, 22 dilin tamamında karşılığı olan 40 çekirdek anahtardan
     * biri, yani yedeğe HİÇ düşmüyor. Kusur kaynakta değil kurulumdaydı.
     * Doğrusu anahtarı tahmin etmek değil, sözlükten TÜRETMEK — böylece
     * ölçüm sözlük büyüdükçe kendini ayarlıyor.
     */
    /* ⚠️ Satır sonu sabiti KULLANILMIYOR: depo CRLF ve elle yazılan bir
     * "\n" deseni burada hiç eşleşmez (bu depoda defalarca yaşandı).
     * Satır bazlı okuma iki biçimde de doğru çalışır. */
    const satirlar = fs.readFileSync(I18N_YOL, "utf8").split(/\r?\n/);

    /** Bir dil bloğundaki `anahtar: "değer"` çiftleri (tek satırlık olanlar). */
    const sozluk = (dil: string) => {
      const bas = satirlar.findIndex((l) => l === `  ${dil}: {`);
      const harita = new Map<string, string>();
      if (bas < 0) return harita;
      for (let i = bas + 1; i < satirlar.length; i++) {
        if (/^  \},?$/.test(satirlar[i])) break;          // dil bloğu bitti
        const m = /^ {4}([A-Za-z_]\w*)\s*:\s*("(?:[^"\\]|\\.)*")\s*,?\s*$/.exec(satirlar[i]);
        if (!m) continue;
        /**
         * ⚠️ DEĞER `JSON.parse` İLE ÇÖZÜLÜYOR — ham almak yanlış alarm üretti.
         * Sekiz anahtarın metninde kaçış dizisi var (`\n`, `\"`); ham okuma
         * bunları iki karakter olarak alıyor, `t()` ise gerçek satır sonunu
         * döndürüyor ve karşılaştırma sapıyordu. Kusur kaynakta değil
         * ayrıştırıcıdaydı.
         */
        try { harita.set(m[1], JSON.parse(m[2]) as string); } catch { /* atla */ }
      }
      return harita;
    };

    const en = sozluk("en");
    const de = sozluk("de");

    /* Sondaj: ayrıştırma tutmadıysa aşağıdaki döngü boş döner ve test
     * "temiz" görünür. Sayıyı ölçmeden "0 kusur" demek anlamsız. */
    assert.ok(en.size > 100, `en sozlugunden ${en.size} anahtar cikti — ayristirma tutmadi`);
    assert.ok(de.size > 0, `de sozlugunden ${de.size} anahtar cikti — ayristirma tutmadi`);

    const yalnizEn = [...en.keys()].filter((k) => !de.has(k));
    assert.ok(yalnizEn.length > 0,
      "de sozlugu en ile birebir ayni — kapsam karari degismis olabilir, " +
      "bu durumda yedek yolu hic calismaz ve test bir sey olcmez");

    /**
     * ⚠️ ÖLÇÜT "t(k) === k" OLAMAZ — bir kez yanlış alarm üretti. `points`
     * anahtarının İngilizce karşılığı da "points"; o ölçüt bunu "ham anahtar
     * basıldı" sanıyor. Doğrusu İNGİLİZCE DEĞERLE karşılaştırmak: yedek
     * çalışıyorsa `t()` tam olarak onu döndürmeli.
     */
    setLang("de");
    const sapanlar = yalnizEn.filter((k) => t(k as any) !== en.get(k));
    assert.deepEqual(sapanlar.slice(0, 5), [],
      `${sapanlar.length}/${yalnizEn.length} anahtar de dilinde Ingilizce ` +
      "yedege dusmedi");
  });
  test("tanınmayan anahtar ANAHTARIN KENDİSİNİ döndürüyor (çökmüyor)", () => {
    /* Eksik anahtar hoş değil ama ekranı çökertmemeli; görünür kalması
     * da iyi — eksik çeviri fark edilsin. */
    assert.equal(t("boyle_bir_anahtar_yok" as any), "boyle_bir_anahtar_yok");
  });

  test("parametre GERÇEKTEN yerleştiriliyor (tek ve çok parametreli)", () => {
    /**
     * ⚠️ İLK SÜRÜM TOTOLOJİYDİ: `split/join` mantığını teste yeniden yazıp
     * onu ölçüyordum, `t()` hiç çağrılmıyordu. Mutasyon süpürmesi yakaladı —
     * kaynaktaki yerleştirmeyi bozmak testi düşürmüyordu.
     *
     * ⚠️ AYNI KALIBIN İKİ KEZ GEÇMESİ bugün ULAŞILAMAZ: sözlükte 235
     * parametreli anahtar var ve HİÇBİRİNDE aynı kalıp tekrarlamıyor
     * (ölçüldü). Yani `split/join` yerine `replace` yazmak bugün davranışı
     * değiştirmez — eşdeğer mutant. Kayda geçiriliyor, uydurma bir anahtarla
     * test edilmiyor.
     */
    setLang("tr");
    const tek = t("streakOf" as any, { n: 7 });
    assert.ok(!tek.includes("{n}"), `kalip doldurulmadi: ${JSON.stringify(tek)}`);
    assert.ok(tek.includes("7"), `deger yerlesmedi: ${JSON.stringify(tek)}`);

    const cok = t("ptsToNext" as any, { n: 12, rank: "Amatör" });
    assert.ok(!cok.includes("{n}") && !cok.includes("{rank}"),
      `cok parametreli kalip eksik dolduruldu: ${JSON.stringify(cok)}`);
    assert.ok(cok.includes("12") && cok.includes("Amatör"),
      `degerler yerlesmedi: ${JSON.stringify(cok)}`);
  });

  test("parametre verilmezse kalıp OLDUĞU GİBİ kalıyor", () => {
    /* Çağıran parametreyi unutursa ekranda `{n}` görünür — sessizce boş
     * bırakmaktan iyidir, eksikliği fark edilir. */
    setLang("tr");
    assert.ok(t("streakOf" as any).includes("{n}"),
      "parametre verilmeyince kalip sessizce silinmis");
  });
});

describe("setLang — dil tercihi", () => {
  test("geçerli dil ayarlanıyor", () => {
    setLang("en");
    assert.equal(getLang(), "en");
    setLang("tr");
    assert.equal(getLang(), "tr");
  });

  test("BOŞ değer cihaz diline dönüyor ('Tercihi kaldır' düğmesi)", () => {
    /**
     * ⚠️ ÜRETİMDE ÇALIŞMAYAN DÜĞME. Eski koşul `if (lang && …)` olduğu için
     * `setLang("")` sessizce hiçbir şey yapmıyordu: sunucu tercihi
     * kaldırıyor, uygulama eski dilde kalıyordu.
     */
    setLang("en");
    setLang("");
    const d = getLang();
    assert.ok(typeof d === "string" && d.length >= 2,
      `bos deger sonrasi dil cozulemedi: ${JSON.stringify(d)}`);
    /* Cihaz dili ortama göre değişir; ölçülen şey "tercih TEMİZLENDİ" —
     * yani yeniden algılama çalıştı ve geçerli bir dil döndü. */
  });

  test("tanınmayan dil kodu uygulamayı kırmıyor", () => {
    setLang("zz-XX-yok");
    const d = getLang();
    assert.ok(typeof d === "string" && d.length > 0);
    assert.doesNotThrow(() => t("matches" as any));
  });
});

describe("abonelik — dil değişince ekran yenilenmeli", () => {
  test("dinleyici ÇAĞRILIYOR", () => {
    /**
     * ⚠️ ÜRETİMDE: kullanıcı dil seçiyor, "kaydedildi" uyarısını alıyor ve
     * ekranda hiçbir şey değişmiyordu. `_lang` bir modül değişkeni, React
     * onu izlemiyor. Abonelik listesi bunun için var.
     */
    let sayac = 0;
    const birak = dilAboneOl(() => { sayac++; });
    setLang("en");
    setLang("tr");
    birak();
    assert.ok(sayac >= 2, `dil iki kez degisti ama dinleyici ${sayac} kez cagrildi`);
  });

  test("abonelik BIRAKILINCA çağrılmıyor (sızıntı yok)", () => {
    /* Negatif kontrol: bırakma çalışmazsa ekran kapandıktan sonra da
     * setState çağrılır ve bellek sızar. */
    let sayac = 0;
    const birak = dilAboneOl(() => { sayac++; });
    birak();
    setLang("en");
    setLang("tr");
    assert.equal(sayac, 0, `birakilan dinleyici ${sayac} kez cagrildi`);
  });

  test("bir dinleyicinin hatası ÖTEKİLERİ engellemiyor", () => {
    /* Bir ekranın hatası bütün uygulamanın dil değişimini kilitlememeli. */
    let saglam = 0;
    const b1 = dilAboneOl(() => { throw new Error("bozuk ekran"); });
    const b2 = dilAboneOl(() => { saglam++; });
    try {
      try { setLang("en"); } catch { /* kaynak yutmuyorsa burada yakalanır */ }
      assert.ok(saglam >= 1,
        "bir dinleyici hata verince otekiler cagrilmadi — tek bozuk ekran " +
        "butun uygulamanin dil degisimini kilitler");
    } finally { b1(); b2(); }
  });
});
