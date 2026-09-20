/**
 * "ŞİMDİ" ŞERİDİ — açılışta öne çıkan tek acil durum.
 *
 * ⚠️ NEDEN VAR: ana ekranda her kart kendi durumunu gösteriyordu ama
 * aralarında ÖNCELİK yoktu — kuponun 40 dk sonra kilitlendiği, kartın
 * kaçıncı sırada olduğuna göre görünür ya da görünmez oluyordu.
 *
 * ⚠️ KARTLAR YENİDEN SIRALANMIYOR (bkz. lib/acilDurum.ts başlığı): üç kart
 * veriyi ayrı ayrı çekiyor, aciliyete göre sıralamak kartları kullanıcının
 * parmağının altında oynatırdı.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  KUPON_ESIK_SN, MAC_ESIK_SN, enAcil, kuponAciliyeti, macAciliyeti,
} from "../lib/acilDurum.ts";
import { MOD_SIRASI } from "../lib/oyunMerkezi.ts";
import { sureMetni } from "../lib/sure.ts";
import { t, setLang } from "../lib/i18n.ts";

const setLangTr = () => setLang("tr");

const KOK = path.join(import.meta.dirname, "..");
const oku = (p: string) => fs.readFileSync(path.join(KOK, p), "utf8").replace(/\r\n?/g, "\n");
const kod = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const M = (sn: number) => `kalan:${sn}`;
const SIMDI = Date.parse("2026-09-20T12:00:00Z");
const ileri = (sn: number) => new Date(SIMDI + sn * 1000).toISOString();

describe("kuponAciliyeti", () => {
  const acikKupon = { durum: "open", katildiMi: false, kalanSaniye: 1800 };

  test("açık · katılmamış · eşik içinde → acil", () => {
    const a = kuponAciliyeti(acikKupon, M);
    assert.ok(a, "acil uretilmedi");
    assert.equal(a!.anahtar, "kupon");
    assert.equal(a!.metin, "kalan:1800");
  });

  test("KATILMIŞSA acil DEĞİL — yapacak iş yok, yalnız gürültü", () => {
    assert.equal(kuponAciliyeti({ ...acikKupon, katildiMi: true }, M), null);
  });

  test("kapanmış kupon acil DEĞİL — 'kaçırdın' diye bağırmıyor", () => {
    assert.equal(kuponAciliyeti({ ...acikKupon, durum: "locked" }, M), null);
    assert.equal(kuponAciliyeti({ ...acikKupon, durum: "settled" }, M), null);
  });

  test("eşiğin dışında acil DEĞİL", () => {
    assert.equal(kuponAciliyeti({ ...acikKupon, kalanSaniye: KUPON_ESIK_SN + 1 }, M), null);
    /* Tam eşik DAHİL: sınırda kaybolmak keyfi olurdu. */
    assert.ok(kuponAciliyeti({ ...acikKupon, kalanSaniye: KUPON_ESIK_SN }, M));
  });

  test("süre bitmiş ya da bozuksa acil DEĞİL", () => {
    for (const v of [0, -5, NaN, null, undefined]) {
      assert.equal(kuponAciliyeti({ ...acikKupon, kalanSaniye: v as any }, M), null, `kalan ${v} kabul edildi`);
    }
    assert.equal(kuponAciliyeti(null, M), null);
  });

  test("öncelik süreyle TERS: yakın olan öne geçiyor", () => {
    const yakin = kuponAciliyeti({ ...acikKupon, kalanSaniye: 300 }, M)!;
    const uzak = kuponAciliyeti({ ...acikKupon, kalanSaniye: 5 * 3600 }, M)!;
    assert.ok(yakin.oncelik > uzak.oncelik, "yakin kupon daha dusuk oncelikli");
  });
});

describe("macAciliyeti", () => {
  const yakinMac = { kickoffISO: ileri(1800), oynandi: false };

  test("başlamak üzere · oynanmamış → acil", () => {
    const a = macAciliyeti(yakinMac, "tek", M, SIMDI);
    assert.ok(a);
    assert.equal(a!.anahtar, "tek");
  });

  test("OYNANMIŞSA acil DEĞİL", () => {
    assert.equal(macAciliyeti({ ...yakinMac, oynandi: true }, "tek", M, SIMDI), null);
  });

  test("başlamış maç acil DEĞİL", () => {
    assert.equal(macAciliyeti({ kickoffISO: ileri(-60), oynandi: false }, "tek", M, SIMDI), null);
  });

  test("eşiğin dışında ve bozuk tarihte acil DEĞİL", () => {
    assert.equal(macAciliyeti({ kickoffISO: ileri(MAC_ESIK_SN + 60), oynandi: false }, "tek", M, SIMDI), null);
    assert.equal(macAciliyeti({ kickoffISO: "yarin", oynandi: false }, "tek", M, SIMDI), null);
    assert.equal(macAciliyeti({ kickoffISO: null, oynandi: false }, "tek", M, SIMDI), null);
  });
});

describe("enAcil — TEK satır seçiyor", () => {
  test("en yüksek öncelikli kazanıyor", () => {
    const a = { anahtar: "kupon" as const, oncelik: 10, metin: "a" };
    const b = { anahtar: "tek" as const, oncelik: 90, metin: "b" };
    assert.equal(enAcil([a, b], MOD_SIRASI)!.metin, "b");
    assert.equal(enAcil([b, a], MOD_SIRASI)!.metin, "b", "girdi sirasi sonucu degistirdi");
  });

  test("EŞİTLİKTE sıra karar veriyor — girdi sırası DEĞİL", () => {
    /* Girdi sırası kartların veri dönüş sırasına bağlı ve koşumdan koşuma
     * değişiyor; aynı durumda farklı şerit göstermek kararsızlık olurdu. */
    const kupon = { anahtar: "kupon" as const, oncelik: 50, metin: "kupon" };
    const tek = { anahtar: "tek" as const, oncelik: 50, metin: "tek" };
    const beklenen = MOD_SIRASI.indexOf("kupon") < MOD_SIRASI.indexOf("tek") ? "kupon" : "tek";
    assert.equal(enAcil([kupon, tek], MOD_SIRASI)!.metin, beklenen);
    assert.equal(enAcil([tek, kupon], MOD_SIRASI)!.metin, beklenen, "girdi sirasi sonucu degistirdi");
  });

  test("sıra EKRANDAKİ sırayla aynı kaynaktan — bağımsız bir kopya değil", () => {
    /* Eşitlik kuralı MOD_SIRASI'ndan geliyor; şeridin seçtiği oyun ile
     * kartların sırası ayrışırsa kullanıcı şeritte gördüğünü ekranda
     * bulamaz. Sıra dizisi parametre, yani kaynağı çağrı yerinde görünür. */
    const kupon = { anahtar: "kupon" as const, oncelik: 50, metin: "kupon" };
    const tek = { anahtar: "tek" as const, oncelik: 50, metin: "tek" };
    /* Ters sıra verilince sonuç DA tersine dönmeli — ölçüt sırayı gerçekten
     * okuyor mu, yoksa sabit bir cevap mı veriyor? */
    const ters = [...MOD_SIRASI].reverse();
    assert.notEqual(
      enAcil([kupon, tek], MOD_SIRASI)!.metin,
      enAcil([kupon, tek], ters)!.metin,
      "sira parametresi sonucu hic etkilemiyor — olcut kor"
    );
  });

  test("boş / geçersiz girdide null", () => {
    assert.equal(enAcil([], MOD_SIRASI), null);
    assert.equal(enAcil([null, undefined], MOD_SIRASI), null);
    assert.equal(enAcil([{ anahtar: "tek", oncelik: NaN, metin: "x" }], MOD_SIRASI), null);
  });

  test("NÖBETÇİ: ölçüt kör değil — geçerli girdi GERÇEKTEN sonuç veriyor", () => {
    assert.ok(enAcil([{ anahtar: "tek", oncelik: 1, metin: "x" }], MOD_SIRASI), "gecerli girdi de null dondu");
  });
});

describe("sureMetni — TEK biçimleyici", () => {
  /* ⚠️ BİR TUR İKİNCİ BİR BİÇİMLEYİCİ (`kabaSure`) YAZILDI ve testi de
   * yazıldı. Sonra görüldü ki depoda zaten `sureMetni` var, üstelik İKİ
   * kopya hâlinde (`KuponKarti.tsx` + `app/kupon.tsx`, ikisinin yorumunda
   * da "AYNI kural" yazılı). Üçüncüyü eklemek yerine taban `lib/sure.ts`e
   * çıkarıldı; bu bölüm onun nöbetçisi. */
  test("gün · saat · dakika kademeleri", () => {
    setLangTr();
    assert.match(sureMetni(2 * 86400 + 3 * 3600, t), /2/);
    assert.match(sureMetni(2 * 3600 + 10 * 60, t), /2/);
    assert.match(sureMetni(45 * 60, t), /45/);
  });

  test("bir dakikanın altı '0 dk' YAZMIYOR", () => {
    /* Eski iki kopyada bu sınır yoktu: 40 saniye kala "0 dk" çıkıyordu ve
     * kapanmış gibi okunuyordu. */
    setLangTr();
    assert.doesNotMatch(sureMetni(40, t), /\b0\b/);
    assert.match(sureMetni(40, t), /1/);
  });

  test("süre bittiğinde 'kapandı' diyor", () => {
    setLangTr();
    assert.equal(sureMetni(0, t), t("closedLower"));
    assert.equal(sureMetni(-10, t), t("closedLower"));
  });

  test("`t` PARAMETRE — modül i18n'i içe aktarmıyor (Node altında yüklenebilsin)", () => {
    /* Depo kuralı: uzantısız `from "./i18n"` Node'da çözülmüyor, uzantılı
     * biçim yalnız tests/ altında. Bağımlılık çağırana bırakıldı. */
    assert.doesNotMatch(kod(oku("lib/sure.ts")), /from "\.\/i18n"/, "lib/sure.ts i18n'i ice aktarmis");
  });

  test("İKİ KOPYA KALMADI: kart ve ekran tek kaynaktan okuyor", () => {
    for (const p of ["components/KuponKarti.tsx", "app/kupon.tsx"]) {
      const src = kod(oku(p));
      assert.doesNotMatch(src, /function sureMetni\(/, `${p} hala kendi kopyasini tasiyor`);
      assert.match(src, /from "\.\.?\/(lib\/)?sure"/, `${p} tek kaynaktan ice aktarmiyor`);
    }
  });
});

describe("kablolama — kartlar bildiriyor, merkez topluyor", () => {
  const MERKEZ = kod(oku("components/OyunMerkezi.tsx"));

  test("iki kart da aciliyetini bildiriyor", () => {
    assert.match(MERKEZ, /<KuponKarti\s+onAcil=\{bildir\("kupon"\)\}/, "kupon karti bildirmiyor");
    assert.match(MERKEZ, /onAcil=\{bildir\("tek"\)\}/, "tek mac karti bildirmiyor");
  });

  test("HOOK'LAR erken dönüşün ÜSTÜNDE", () => {
    /* ⚠️ BU İDDİANIN SEBEBİ GERÇEK BİR HATA: ilk yazımda `useState`/
     * `useCallback` `if (!tam)` dönüşünün ALTINDAYDI. `tam` değiştiğinde
     * (maç listesi ↔ Benimkiler) React'in gördüğü hook sayısı değişiyor ve
     * "Rendered fewer hooks than expected" ile ÇÖKÜYOR. */
    const hook = MERKEZ.indexOf("const [aciller, setAciller]");
    const donus = MERKEZ.indexOf("if (!tam) {");
    assert.ok(hook > 0 && donus > 0, "kurulum: iki isaret de bulunmali");
    assert.ok(hook < donus, "hook kosullu donusun ALTINDA — tam degisince cokerdi");
  });

  test("aynı değer yeniden bildirilirse durum DEĞİŞMİYOR", () => {
    /* Kartlar odakta her yenilemede bildiriyor; aynı değeri yazmak
     * ebeveyni gereksiz çizer ve çizim → bildirim → çizim döngüsü açar. */
    assert.match(MERKEZ, /if \(e === y\) return o;/, "ozdeslik kisa devresi yok");
    assert.match(MERKEZ, /e\.metin === y\.metin && e\.oncelik === y\.oncelik/, "deger karsilastirmasi yok");
  });

  test("şerit hedefi modun KENDİ eylemini kullanıyor", () => {
    /* İkinci bir yönlendirme tablosu "aynı ad, farklı hedef" sınıfını
     * açardı: şerit bir yere, kart başka yere götürürdü. */
    assert.match(MERKEZ, /\(tanim as any\)\[a\.anahtar\]\?\.bas/, "serit ayri bir hedef tablosu kullaniyor");
  });

  test("eşitlik sırası EKRANIN sırasıyla aynı kaynaktan", () => {
    assert.match(MERKEZ, /enAcil\(Object\.values\(aciller\), MOD_SIRASI\)/,
      "serit farkli bir sira kullaniyor — sectigi oyun kartlarla ayrisabilir");
  });
});

describe("şerit", () => {
  const SERIT = kod(oku("components/SimdiSeridi.tsx"));

  test("acil yoksa HİÇBİR ŞEY çizilmiyor", () => {
    /* Boş kutu ya da "şu an acil bir şey yok" satırı kalıcı yer kaplar,
     * hiçbir iş üretmez ve şeridin belirmesini sıradanlaştırır. */
    assert.match(SERIT, /if \(!acil\) return null;/);
  });

  test("erişilebilir ad METNİN TAMAMI", () => {
    /* Ekran okuyucu yalnız "Git" duyarsa neye gideceğini bilmez. */
    assert.match(SERIT, /accessibilityLabel=\{`\$\{acil\.metin\}/);
  });

  test("dokunma hedefi 44px", () => {
    assert.match(SERIT, /minHeight: 44/);
  });

  test("sabit Türkçe metin YOK — hepsi t()", () => {
    /* i18n çırçırı: yeni dosya tavanı yükseltmemeli. */
    assert.doesNotMatch(SERIT.replace(/t\("[^"]*"\)/g, ""), /[çğıöşüÇĞİÖŞÜ]/);
  });
});

describe("YENİ AĞ ÇAĞRISI YOK", () => {
  test("acilDurum saf: apiFetch/react-native içe aktarmıyor", () => {
    /* ⚠️ Aciliyet, kartların ZATEN cektigi veriden turuyor. Buraya bir uc
     * cagrisi girerse hem iki gerceklik acilir hem acilisa yuk biner. */
    const src = kod(oku("lib/acilDurum.ts"));
    assert.doesNotMatch(src, /apiFetch|react-native|fetch\(/, "saf cekirdege ag cagrisi sizmis");
  });
});
