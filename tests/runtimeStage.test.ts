/**
 * ÇALIŞMA PROFİLİ EŞLEMESİ.
 *
 * Sunucu `RUNTIME_STAGE` / `FEATURES_MODE` ortam değişkenleriyle bir profil
 * ilan ediyor; bu eşleme onu kullanıcıya gösterilen sınırlara (kaç takım,
 * kaç lig) ve etikete çeviriyor. `runtimeConfig.ts` expo-constants içe
 * aktardığı ve `API_BASE`'i modül yüklenirken hesapladığı için Node altında
 * hiç çalıştırılamıyordu — eşleme bu yüzden `lib/runtimeStage.ts` içine saf
 * çekirdek olarak ayrıldı.
 *
 * ⚠️ TEST TABLOYU KOPYALAMIYOR. Beklenen sayıları elle yazmak totoloji
 * olurdu (tablo değişince beklenti de değişir). Onun yerine eşlemenin KENDİ
 * kuralları sınanıyor: sunucunun gönderdiği sayı varsayılanı EZER, bilinmeyen
 * profil sessizce yutulmaz, profil adı büyük harfe çevrilir.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { mapRuntimeStage } from "../lib/runtimeStage.ts";

describe("kurulum", () => {
  test("bilinen bir profil GERÇEKTEN tanınıyor", () => {
    /* Sondaj: eşleme her girdiye "CUSTOM" dönseydi aşağıdaki "sunucu sayısı
     * kazanır" iddiaları da geçerdi ve bilinen profillerin hiç tanınmadığı
     * anlaşılmazdı. */
    const s = mapRuntimeStage({ profile: "TR_30_TEAMS" });
    assert.ok(s, "bilinen profil null dondu");
    assert.notEqual(s!.level, "CUSTOM",
      "bilinen profil CUSTOM'a dustu — tablo hic okunmuyor olabilir");
    assert.ok(typeof s!.maxTeams === "number" && s!.maxTeams! > 0);
  });
});

describe("profil tanıma", () => {
  test("dört bilinen profilin hepsi AYRI seviye veriyor", () => {
    /* Seviyeler arayüzde farklı rozetlere karşılık geliyor; hepsi aynı
     * değere inerse ayrım kaybolur. */
    const seviyeler = ["DEV_4_TEAMS", "TR_30_TEAMS", "GLOBAL_100_TEAMS", "GLOBAL_456_TEAMS"]
      .map((p) => mapRuntimeStage({ profile: p })!.level);
    assert.equal(new Set(seviyeler).size, 4,
      `dort profil ${new Set(seviyeler).size} ayri seviye uretti: ${JSON.stringify(seviyeler)}`);
  });

  test("sınırlar profil büyüdükçe ARTIYOR", () => {
    /* Değişmezi tablodan türetiyoruz, sabit sayı yazmıyoruz. */
    const t = (p: string) => mapRuntimeStage({ profile: p })!;
    const sirali = ["DEV_4_TEAMS", "TR_30_TEAMS", "GLOBAL_100_TEAMS", "GLOBAL_456_TEAMS"].map(t);
    for (let i = 1; i < sirali.length; i++) {
      assert.ok(sirali[i].maxTeams! > sirali[i - 1].maxTeams!,
        `${sirali[i].profile} takim siniri oncekinden buyuk degil`);
    }
  });

  test("profil adı KÜÇÜK harfle gelse de tanınıyor", () => {
    /* Ortam değişkeni elle yazılıyor; küçük harfli bir değer yüzünden
     * uygulamanın "Custom profil" göstermesi yapılandırma hatası gibi
     * görünür ve teşhisi zorlaştırır. */
    const a = mapRuntimeStage({ profile: "tr_30_teams" });
    const b = mapRuntimeStage({ profile: "TR_30_TEAMS" });
    assert.deepEqual(a, b, "kucuk harfli profil taninmadi");
  });
});

describe("sunucunun gönderdiği sayı varsayılanı EZER", () => {
  test("maxTeams / maxLeagues sunucudan gelirse o kullanılıyor", () => {
    /**
     * Önemli: sunucu sınırı daralttığında (kota, yük) istemci eski
     * varsayılanı göstermemeli — kullanıcı olmayan bir kapasiteyi görür.
     */
    const s = mapRuntimeStage({ profile: "TR_30_TEAMS", maxTeams: 7, maxLeagues: 2 })!;
    assert.equal(s.maxTeams, 7, "sunucunun gonderdigi takim siniri yok sayildi");
    assert.equal(s.maxLeagues, 2, "sunucunun gonderdigi lig siniri yok sayildi");
    assert.equal(s.level, "TR", "sayi gelince profil tanimasi bozuldu");
  });

  test("sayı gelmezse profilin VARSAYILANI kullanılıyor", () => {
    const varsayilan = mapRuntimeStage({ profile: "TR_30_TEAMS" })!;
    const acik = mapRuntimeStage({ profile: "TR_30_TEAMS", maxTeams: 7 })!;
    assert.notEqual(varsayilan.maxTeams, 7);
    assert.ok(varsayilan.maxTeams! > 0, "varsayilan sinir bos");
    assert.equal(varsayilan.maxLeagues, acik.maxLeagues,
      "acikca gonderilmeyen alan varsayilandan gelmeliydi");
  });

  test("sıfır GEÇERLİ bir sınır — varsayılana düşmemeli", () => {
    /* `??` yerine `||` yazılırsa 0 yutulur ve kullanıcıya "30 takım"
     * gösterilirken gerçekte hiç maç açılmaz. */
    const s = mapRuntimeStage({ profile: "TR_30_TEAMS", maxTeams: 0 })!;
    assert.equal(s.maxTeams, 0,
      "sunucu 0 gonderdi ama varsayilana dusuldu — ekranda olmayan kapasite gorunur");
  });
});

describe("tanınmayan girdiler", () => {
  test("bilinmeyen profil SESSİZCE YUTULMUYOR", () => {
    /**
     * `null` dönseydi ekranda hiçbir aşama görünmez ve yanlış yapılandırma
     * fark edilmezdi. Görünür kalması bilinçli.
     */
    const s = mapRuntimeStage({ profile: "BAMBASKA_PROFIL" });
    assert.ok(s, "bilinmeyen profil null dondu — yanlis yapilandirma gorunmez olur");
    assert.equal(s!.level, "CUSTOM");
    assert.ok(s!.label.includes("BAMBASKA_PROFIL"),
      `etikette profil adi yok: ${JSON.stringify(s!.label)}`);
  });

  test("bilinmeyen profilde `notes` varsa ETİKET olarak kullanılıyor", () => {
    const s = mapRuntimeStage({ profile: "X", notes: "Elle kurulmuş deneme" })!;
    assert.equal(s.label, "Elle kurulmuş deneme");
  });

  test("mode YOKSA null — bu tek meşru null", () => {
    /* Sunucu henüz yanıt vermediyse aşama bilinmiyor demektir; boş bir
     * rozet göstermek yanlış bilgi olurdu. */
    assert.equal(mapRuntimeStage(null), null);
    assert.equal(mapRuntimeStage(undefined), null);
  });

  test("profil alanı boşsa CUSTOM, ama çökmüyor", () => {
    const s = mapRuntimeStage({});
    assert.ok(s, "bos nesne null dondu");
    assert.equal(s!.level, "CUSTOM");
    assert.equal(s!.maxTeams, null, "sinir bilinmiyorken uydurma sayi uretildi");
  });
});
