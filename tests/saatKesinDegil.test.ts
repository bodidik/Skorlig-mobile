import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { fiksturSaatEtiketi, macSaatiEtiketi } from "../lib/macSaati.ts";

/**
 * YER TUTUCU SAAT EKRANDA GÖSTERİLMEZ.
 *
 * ⚠️ ÖLÇÜLEN KUSUR (2026-09-12, sunucu tarafı): ESPN gelecek Süper Lig
 * turlarını `timeValid:false` ile veriyor ve hepsine turun nominal gününü
 * damgalıyor. Üretimde o an dokuz kayıt vardı ve dokuzu da
 * `2026-10-11T18:00Z` — bir turun TAMAMI aynı dakikada.
 *
 * Sunucu kararı (kullanıcı, aynı gün): kayıt LİSTEDE KALIR ama oynanamaz;
 * yanıtta `saatKesinDegil: true` geliyor. Ekranın işi tek: o yer tutucuyu
 * SAAT diye basmamak. Basarsa kullanıcı gerçek saati kaçırır ve üstüne
 * tahmin ekranında sebebini göremeden duvara çarpar.
 *
 * ⚠️ NEGATİF TARAF ŞART: kural gevşetilirse (her kayıtta saati gizle) saat
 * bilgisi BÜTÜN maçlardan kaybolur — kusuru "yanlış saat"ten "hiç saat yok"a
 * çevirirdik. Aşağıdaki iddiaların yarısı bunu nöbetliyor.
 *
 * Çalıştırma:  npm test
 */

const SABIT = new Date("2026-09-12T10:00:00");
const SECENEK = { simdi: SABIT, bugun: "Bugün", yarin: "Yarın" };
const BUGUN_ISO = "2026-09-12T21:00:00";

describe("fiksturSaatEtiketi", () => {
  test("saat KESİNSE saat basılır (negatif kontrol)", () => {
    const e = fiksturSaatEtiketi(
      { kickoffISO: BUGUN_ISO, saatKesinDegil: false }, SECENEK,
    );
    assert.match(e, /21:00/, `kesin saatli maçta saat kayboldu: "${e}"`);
  });

  test("alan HİÇ YOKSA davranış eskisiyle birebir aynı", () => {
    /* Eski sunucu bu alanı göndermiyor; tek bir maçın saati bile kaybolmamalı. */
    const eski = macSaatiEtiketi(BUGUN_ISO, SECENEK);
    const yeni = fiksturSaatEtiketi({ kickoffISO: BUGUN_ISO }, SECENEK);
    assert.equal(yeni, eski, "alanı olmayan kayıtta etiket değişti");
    assert.match(yeni, /21:00/);
  });

  test("saat KESİN DEĞİLSE saat basılmaz, GÜN kalır", () => {
    const e = fiksturSaatEtiketi(
      { kickoffISO: BUGUN_ISO, saatKesinDegil: true }, SECENEK,
    );
    assert.doesNotMatch(e, /\d{2}:\d{2}/, `yer tutucu saat ekrana basıldı: "${e}"`);
    assert.ok(e.length > 0, "gün de kayboldu — takvim okunamaz hâle gelir");
    assert.equal(e, "Bugün", `gün etiketi bozuldu: "${e}"`);
  });

  test("işaretli kayıtta İLERİ TARİH de gün olarak okunur", () => {
    const e = fiksturSaatEtiketi(
      { kickoffISO: "2026-10-11T18:00:00", saatKesinDegil: true }, SECENEK,
    );
    assert.doesNotMatch(e, /\d{2}:\d{2}/, `yer tutucu saat basıldı: "${e}"`);
    assert.match(e, /11/, `gün numarası kayboldu: "${e}"`);
  });

  test("kickoffDate yedeği ve boş girdi bozulmadı", () => {
    assert.equal(fiksturSaatEtiketi({ kickoffDate: "2026-09-12" }, SECENEK), "Bugün");
    assert.equal(fiksturSaatEtiketi({}, SECENEK), "");
    assert.equal(fiksturSaatEtiketi(null, SECENEK), "");
  });
});

/* ── Çağrı yerleri: ekranlar bu kuralı GERÇEKTEN uyguluyor mu ───────────── */

const KOK = path.join(import.meta.dirname, "..");
const yalin = (p: string) =>
  fs.readFileSync(path.join(KOK, p), "utf8").replace(/\r\n?/g, "\n");

describe("çağrı yerleri", () => {
  test("live ekranı saat etiketini HELPER üzerinden kuruyor", () => {
    /* ⚠️ Ekran kendi kopyasını yazarsa bu dosyadaki ölçüm hiçbir şeyi
     * korumaz — bu deponun "iki gerçeklik" kusuru. */
    const src = yalin("app/(tabs)/live.tsx");
    assert.match(src, /fiksturSaatEtiketi\(fx,/,
      "live ekranı helper'ı kullanmıyor");
    assert.doesNotMatch(src, /macSaatiEtiketi\(fx\.kickoffISO/,
      "ekran hâlâ ham kickoff'u etikete veriyor — yer tutucu saat basılır");
  });

  test("mini turnuva kurma ekranı işaretli maçı seçtirmiyor", () => {
    /* Sunucu `/api/mini/create` isteğini SAAT_KESIN_DEGIL ile reddediyor;
     * listede bırakmak kullanıcıyı kapıya kadar yürütmek olurdu. */
    const src = yalin("app/mini/create.tsx");
    assert.match(src, /saatKesinDegil === true\) return false/,
      "mini kurma listesi işaretli maçı süzmüyor");
  });

  test("tahmin ekranı işaretli maçı 'sıradaki maç' seçmiyor", () => {
    const src = yalin("app/(tabs)/predict.tsx");
    assert.match(src, /saatKesinDegil === true\) return false/,
      "tahmin ekranı işaretli maçı sıradaki maç olarak seçebiliyor");
  });
});
