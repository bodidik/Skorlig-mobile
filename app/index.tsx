import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  FlatList, Dimensions, useWindowDimensions, Modal, TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../contexts/AuthContext";
import { markFirstRunDone, isFirstRun } from "../lib/firstRun";
import { getDeviceCountry } from "../lib/locale";
import { apiFetch } from "../lib/apiFetch";
import { savePendingCountry, flushPendingCountry } from "../lib/pendingCountry";
import { savePendingTeam, flushPendingTeam } from "../lib/pendingTeam";
import { savePendingNickname } from "../lib/pendingNickname";
import { adOner, gonderilebilirMi } from "../lib/takmaAd";
import { filterAndRankCountries } from "../lib/countrySort";
import { FALLBACK_COUNTRIES, type CountryOpt } from "../lib/countriesFallback";
import { t, useLang } from "../lib/i18n";
import { useOzellikler } from "../hooks/useOzellikler";
import { ulkeAdi } from "../lib/ulkeler";
import { ilkUyeBildir } from "../lib/ilkUye";

/** `/api/stats/teams` yanıt şeması. */
type TeamOpt = { team: string; flag: string };

const GOLD = "#f59e0b";
const BG   = "#020617";
const CARD = "#0f172a";

/* Düello slaytı yalnızca özellik açıkken (çıkış sürümünde kapalı, IARC). */
const getSlides = (duelloAcik: boolean) => [
  { icon: "⚽", accent: GOLD, title: t("onb1Title"), subtitle: t("onb1Sub"),
    bullets: [t("onb1B1"), t("onb1B2"), t("onb1B3")] },
  { icon: "🪙", accent: GOLD, title: t("onb2Title"), subtitle: t("onb2Sub"),
    bullets: [t("onb2B1"), t("onb2B2"), t("onb2B3")] },
  ...(duelloAcik ? [{ icon: "⚔️", accent: "#ef4444", title: t("onb3Title"), subtitle: t("onb3Sub"),
    bullets: [t("onb3B1"), t("onb3B2"), t("onb3B3")] }] : []),
  { icon: "🏁", accent: "#22c55e", title: t("onb4Title"), subtitle: t("onb4Sub"),
    bullets: [t("onb4B1"), t("onb4B2"), t("onb4B3")] },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  useLang(); // dil değişince ekran yeniden çizilsin
  const ozellik = useOzellikler();
  const SLIDES = getSlides(ozellik.duello);

  const [slide, setSlide]           = useState(0);
  const [country, setCountry]       = useState<string | null>(null);
  const [autoDetected, setAutoDetected] = useState(false);
  const [busy, setBusy]             = useState(false);

  /**
   * TAKMA AD — ülkenin ÜSTÜNDE, zorunlu.
   *
   * ⚠️ ÖLÇÜLEN KUSUR (2026-09-20, canlı sıralama): 6 insan oyuncunun 5'i
   * ekranda ham Firebase kimliği olarak görünüyordu ("ApdTA2V9…"), botlar ise
   * okunabilir adlarla. Ad sorulmadığı için değil — SORULDUĞU YER yüzünden:
   * takma ad yalnızca Profil sekmesinin içindeydi, onboarding hiç sormuyordu.
   *
   * ⚠️ TAKIM GİBİ İSTEĞE BAĞLI DEĞİL, ÜLKE GİBİ ZORUNLU. Takım için yazılan
   * gerekçe ("zorunlu kılmak kullanıcıyı yalan söylemeye iter") burada
   * geçmiyor: herkesin seçebileceği bir adı vardır. Atlanabilir olsaydı
   * ölçülen kusur aynen sürerdi — zaten atlanabilirdi ve sürüyordu.
   *
   * Sürtünme öneriyle düşürülüyor: Google adı varsa alan DOLU açılır, tek
   * dokunuşla geçilir. Yalnızca İLK AD (bkz. lib/takmaAd.ts gizlilik notu).
   */
  const [nick, setNick]             = useState("");
  const [nickHata, setNickHata]     = useState<string | null>(null);
  const [nickOnerildi, setNickOnerildi] = useState(false);

  // Ülke seçici
  const [pickerOpen, setPickerOpen]   = useState(false);
  // Gömülü listeyle BAŞLA: onboarding ağa bağlı kalmasın. Sunucu yanıtı
  // gelince tazelenir. Eskiden boş başlıyordu ve istek düşerse ekran
  // sonsuza kadar spinner'da kalıyordu (Render soğuk başlangıcı 30-60sn,
  // apiFetch 15sn × 3 deneme → hepsi düşüyordu).
  const [allCountries, setAllCountries] = useState<CountryOpt[]>(FALLBACK_COUNTRIES);
  const [search, setSearch]           = useState("");
  const listRef = useRef<FlatList>(null);

  /**
   * ⚠️ ONBOARDING'İ BİR KEZ GÖSTER.
   *
   * Bu ekran `markFirstRunDone()` çağırıyordu ama `isFirstRun()`'ı hiç
   * kontrol etmiyordu. Önceden fark edilmiyordu çünkü _layout, girişten
   * sonra onboarding'i bitirmiş kullanıcıyı doğrudan maçlara yönlendiriyordu.
   * Giriş duvarı kalkınca (misafir gezinebiliyor) kök rotaya düşen dönüş
   * kullanıcısı slaytları HER AÇILIŞTA yeniden görürdü.
   */
  useEffect(() => {
    let alive = true;
    isFirstRun().then((ilkMi) => {
      if (alive && !ilkMi) router.replace("/(tabs)/live");
    });
    return () => { alive = false; };
  }, []);

  // Cihaz dili yalnızca ÖN SEÇİM üretir — kullanıcı onaylar/değiştirir.
  // (en-US dilli Türk kullanıcı otomatik "ABD" olmamalı.)
  useEffect(() => {
    const guess = getDeviceCountry();
    if (guess) { setCountry(guess); setAutoDetected(true); }
  }, []);

  /* Google adından ÖN SEÇİM — ülkedeki kalıbın aynısı: doldur, kullanıcı
   * onaylasın. Oturum onboarding sürerken açılabildiği için `user` bağımlı.
   * ⚠️ KULLANICI YAZMAYA BAŞLADIYSA EZME: `nick` doluysa dokunma, yoksa
   * oturum gecikmeli oturduğunda kişinin yazdığı ad silinirdi. */
  useEffect(() => {
    if (nick) return;
    const oneri = adOner(user?.displayName);
    if (oneri) { setNick(oneri); setNickOnerildi(true); }
  }, [user]);

  // Desteklenen ülkeler — sunucu tek kaynak (canonicalCountry ile uyumlu).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Ülke listesi statik — 5dk önbellek, ekranlar arası tekrar isteği önler.
        const res  = await apiFetch("/api/live2/countries", { skipAuth: true, cacheMs: 5 * 60_000 });
        const data = await res.json();
        // Sunucu şeması: { country, flag }
        const list: CountryOpt[] = (data?.countries ?? [])
          .map((c: any) =>
            typeof c === "string"
              ? { country: c, flag: "" }
              : { country: c?.country, flag: c?.flag ?? "" }
          )
          .filter((c: CountryOpt) => !!c.country);
        // BOŞ yanıt gömülü listeyi EZMEMELİ — sunucu geçici olarak boş
        // dönerse kullanıcı ülke seçemez hale gelirdi.
        if (alive && list.length) setAllCountries(list);
      } catch (e) {
        // Sessizce yutma: gömülü liste devreye girdiği için kullanıcı
        // engellenmiyor, ama sebebi bilmek gerekiyor (eskiden `catch {}`
        // yüzünden sonsuz spinner'ın nedeni hiçbir yerde görünmüyordu).
        console.warn("[onboarding] ülke listesi alınamadı, gömülü liste kullanılıyor:", e);
      }
    })();
    return () => { alive = false; };
  }, []);

  /**
   * TAKIM SEÇİMİ — ülkenin altında, İSTEĞE BAĞLI.
   *
   * ⚠️ ÜLKE GİBİ ZORUNLU DEĞİL. Ülkesiz kullanıcı hiçbir ülke sıralamasına
   * giremiyor, o yüzden orada engel var. Takım yalnızca "aynı takımı
   * tutanlar" sıralamasını açıyor; zorunlu kılmak onboarding'i uzatır ve
   * takım tutmayan kullanıcıyı yalan söylemeye iter.
   *
   * ⚠️ LİSTE SUNUCUDAN, SERBEST METİN DEĞİL. Kullanıcı yazarsa "Galatasaray
   * SK" / "galatasaray" gibi varyantlar doğar; sunucu bunları
   * kanonikleştiriyor (api/lib/takim-katalog.cjs) ama listeden seçtirmek
   * sorunu kaynağında bitiriyor.
   */
  const [team, setTeam] = useState<string | null>(null);
  const [teamPickerOpen, setTeamPickerOpen] = useState(false);
  const [allTeams, setAllTeams] = useState<TeamOpt[]>([]);
  const [teamSearch, setTeamSearch] = useState("");

  useEffect(() => {
    if (!country) { setAllTeams([]); return; }
    let alive = true;
    (async () => {
      try {
        const res = await apiFetch(
          `/api/stats/teams?country=${encodeURIComponent(country)}`,
          { skipAuth: true, cacheMs: 5 * 60_000 }
        );
        const data = await res.json();
        const list: TeamOpt[] = (data?.teams ?? [])
          .map((t: any) => ({ team: t?.team, flag: t?.flag ?? "" }))
          .filter((t: TeamOpt) => !!t.team);
        if (alive) setAllTeams(list);
      } catch (e) {
        // Engellemiyor: takım isteğe bağlı, liste boşsa adım atlanır.
        console.warn("[onboarding] takım listesi alınamadı:", e);
      }
    })();
    return () => { alive = false; };
  }, [country]);

  /* Ülke değişince eski takım seçimi ARTIK GEÇERSİZ — Türkiye'den İspanya'ya
   * geçen kullanıcının seçili "Galatasaray"ı listede olmadığı hâlde ekranda
   * kalırdı. */
  useEffect(() => { setTeam(null); }, [country]);

  const filteredTeams = (() => {
    const q = teamSearch.trim().toLocaleLowerCase("tr");
    if (!q) return allTeams;
    return allTeams.filter((t) => t.team.toLocaleLowerCase("tr").includes(q));
  })();

  // Sıralama + arama önceliği — bkz. lib/countrySort.
  // Boş arama → Türkiye başta, sonrası tr-alfabetik.
  // Arama → Türkiye önce (varsa), sonra "eng" gibi baştan eşleşenler,
  // sonra ortada geçenler. `includes` tek başına bunu yapmıyordu.
  /* ⚠️ SÜZGEÇ GÖRÜNEN ADDA ÇALIŞIR. Ad yerelleştirilip süzgeç ham adda
   * kalsaydı kullanıcı gördüğünü yazınca sonuç alamazdı. */
  const filteredCountries = filterAndRankCountries(
    allCountries, search, (c) => ulkeAdi(c.country) || c.country
  );

  const isLast = slide === SLIDES.length - 1;

  function goNext() {
    if (isLast) { handleStart(); return; }
    const next = slide + 1;
    setSlide(next);
    listRef.current?.scrollToIndex({ index: next, animated: true });
  }

  function goBack() {
    if (slide === 0) return;
    const prev = slide - 1;
    setSlide(prev);
    listRef.current?.scrollToIndex({ index: prev, animated: true });
  }

  async function handleStart() {
    // Ad yazılmadan devam edilemez: adsız kullanıcı sıralamada ham hesap
    // kimliği olarak görünür (ölçüldü — 6 insanın 5'i).
    const ad = nick.trim();
    if (!gonderilebilirMi(ad)) {
      /* ⚠️ ÖNCE ALANI GÖRÜNÜR YAP. "Atla" düğmesi son slayttan ÖNCE de
       * buraya giriyor ve ad alanı yalnızca son slaytta çiziliyor: hatayı
       * olduğu yerde yazsaydık düğme hiçbir şey yapmamış gibi görünürdü
       * (deponun kayıtlı "sessiz boşluk" kusuru). Ülke için bu sorun yok,
       * onun seçicisi modal — her slayttan açılıyor. */
      if (!isLast) {
        const son = SLIDES.length - 1;
        setSlide(son);
        listRef.current?.scrollToIndex({ index: son, animated: true });
      }
      setNickHata(t("nickLength"));
      return;
    }

    // Ülke seçilmeden devam edilemez: ülkesiz kullanıcı hiçbir ülke
    // sıralamasında görünmez ve maç listesi yereline göre kurulamaz.
    if (!country) {
      setPickerOpen(true);
      return;
    }

    setBusy(true);

    /* ⚠️ AD ÜLKEDEN FARKLI: REDDEDİLEBİLİR (benzersizlik, rezerve kelime).
     * Ülke/takım gibi "gönder ve geç" yapılamaz — çakışan bir ad sessizce
     * düşerdi ve kullanıcı adsız başlardı, yani düzeltmenin kendisi ölçülen
     * kusuru geri üretirdi. Ret ekranda gösterilir ve onboarding İLERLEMEZ.
     *
     * ⚠️ BU KONTROL `try/finally`NİN DIŞINDA, bilerek: ilk yazımda içindeydi
     * ve `return` `finally`yi de çalıştırdığı için ret durumunda ekran yine
     * `markFirstRunDone()` çağırıp maçlara geçiyordu — yani ret GÖRÜNMEDEN
     * yutuluyordu. Aynı `finally` ülke/takım için doğru (onlar reddedilmez). */
    if (user) {
      const cevap = await gonderAd(ad);
      if (cevap === "RET") { setBusy(false); return; }
    } else {
      // Oturum yok: yerele yaz, `_layout` kimlik oturunca gönderir. Ret
      // ihtimali o zaman doğarsa NicknameBackfillPrompt yeniden sorar.
      await savePendingNickname(ad);
    }

    try {
      await savePendingCountry(country);
      // Takım isteğe bağlı: yalnızca seçildiyse kaydedilir.
      if (team) await savePendingTeam(team);
      // Oturum varsa hemen gönder; yoksa _layout açılışta flush eder.
      if (user) {
        await flushPendingCountry();
        if (team) await flushPendingTeam();
      }
    } catch {}
    finally {
      await markFirstRunDone();
      setBusy(false);
      router.replace("/(tabs)/live");
    }
  }

  /**
   * Adı sunucuya gönderir.
   *
   * @returns "TAMAM" kaydedildi · "RET" sunucu reddetti (ekranda sebebi var)
   *          · "ERTELENDI" ağ/oturum sorunu — yerele yazıldı, `_layout`
   *          açılışta yeniden dener.
   *
   * ⚠️ AĞ HATASI RET DEĞİL. İkisini ayırmazsak internet dalgalanması
   * kullanıcıyı onboarding'de kilitler; oysa ülke tarafında yıllardır
   * çalışan çözüm "yerele yaz, sonra gönder". Yalnızca sunucunun AÇIKÇA
   * reddettiği ad ilerlemeyi durdurur.
   */
  async function gonderAd(ad: string): Promise<"TAMAM" | "RET" | "ERTELENDI"> {
    try {
      const res  = await apiFetch("/api/users/set-nickname", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: ad }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        /* İlk üye hediyesi yattıysa söyle (bkz. lib/ilkUye.ts). */
        ilkUyeBildir(data);
        return "TAMAM";
      }

      const kod = String(data?.error || "");
      if (kod === "NICKNAME_TAKEN")    { setNickHata(t("nickTaken"));    return "RET"; }
      if (kod === "NICKNAME_RESERVED") { setNickHata(t("nickReserved")); return "RET"; }
      if (kod === "NICKNAME_LENGTH")   { setNickHata(t("nickLength"));   return "RET"; }
      if (kod === "NICKNAME_INVALID")  { setNickHata(t("nickInvalid"));  return "RET"; }

      // Tanımadığımız bir hata (5xx, kapalı uç): kullanıcıyı kilitleme.
      await savePendingNickname(ad);
      return "ERTELENDI";
    } catch {
      await savePendingNickname(ad);
      return "ERTELENDI";
    }
  }

  const accent = SLIDES[slide].accent;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Üst logo şeridi */}
      <View style={{ paddingTop: 56, paddingHorizontal: 24, alignItems: "center", gap: 4 }}>
        <Text style={{ fontSize: 26, fontWeight: "900", color: "#fff", letterSpacing: 1 }}>
          Skor<Text style={{ color: GOLD }}>Lig</Text>
          <Text style={{ color: "#64748b", fontWeight: "400", fontSize: 18 }}> 87</Text>
        </Text>
      </View>

      {/* Slaytlar */}
      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item }) => (
          <View style={{ width, paddingHorizontal: 28, paddingTop: 36, gap: 20 }}>
            {/* İkon + başlık */}
            <View style={{ alignItems: "center", gap: 10 }}>
              <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: item.accent + "22", borderWidth: 2, borderColor: item.accent + "66", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 42 }}>{item.icon}</Text>
              </View>
              <Text style={{ color: "#fff", fontSize: 22, fontWeight: "900", textAlign: "center" }}>
                {item.title}
              </Text>
              <Text style={{ color: "#94a3b8", fontSize: 14, textAlign: "center" }}>
                {item.subtitle}
              </Text>
            </View>

            {/* Bullet listesi */}
            <View style={{ gap: 10 }}>
              {item.bullets.map((b, bi) => (
                <View key={bi} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: item.accent + "33", padding: 14 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: item.accent + "22", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                    <Text style={{ color: item.accent, fontWeight: "900", fontSize: 12 }}>{bi + 1}</Text>
                  </View>
                  <Text style={{ flex: 1, color: "#cbd5e1", fontSize: 14, lineHeight: 20 }}>{b}</Text>
                </View>
              ))}
            </View>

            {/* Kullanıcı adı (son slayt) — zorunlu, ÜLKENİN ÜSTÜNDE.
                Sıra kasıtlı: ekranda ilk sorulan şey kişinin kim olacağı. */}
            {item === SLIDES[SLIDES.length - 1] && (
              <View style={{ backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: nickHata ? "#ef444466" : nick ? GOLD + "33" : "#ef444466", paddingHorizontal: 14, paddingVertical: 12, gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Text style={{ fontSize: 18 }}>🏷️</Text>
                  <Text style={{ flex: 1, color: nick ? GOLD : "#ef4444", fontWeight: "700", fontSize: 13 }}>
                    {nick ? t("yourNickname", { n: nick }) : t("pickYourNickname")}
                  </Text>
                </View>
                <TextInput
                  value={nick}
                  onChangeText={(x) => { setNick(x); setNickHata(null); setNickOnerildi(false); }}
                  placeholder={t("nicknamePh")}
                  placeholderTextColor="#475569"
                  maxLength={20}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{ backgroundColor: BG, borderRadius: 10, borderWidth: 1, borderColor: "#1e293b", paddingHorizontal: 12, paddingVertical: 9, color: "#fff", fontSize: 15 }}
                />
                <Text style={{ color: nickHata ? "#ef4444" : "#64748b", fontSize: 11 }}>
                  {nickHata ? nickHata : nickOnerildi ? t("nickSuggested") : t("nickWhy")}
                </Text>
              </View>
            )}

            {/* Ülke seçimi (son slayt) — zorunlu, dokunarak değiştirilebilir */}
            {item === SLIDES[SLIDES.length - 1] && (
              <TouchableOpacity
                onPress={() => setPickerOpen(true)}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: country ? GOLD + "33" : "#ef444466", paddingHorizontal: 14, paddingVertical: 12 }}
              >
                <Text style={{ fontSize: 18 }}>📍</Text>
                <View style={{ flex: 1 }}>
                  {country ? (
                    <>
                      <Text style={{ color: GOLD, fontWeight: "700", fontSize: 13 }}>{t("yourCountry", { c: country })}</Text>
                      <Text style={{ color: "#64748b", fontSize: 11 }}>
                        {autoDetected ? t("autoPicked") : t("tapToChange")}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={{ color: "#ef4444", fontWeight: "700", fontSize: 13 }}>{t("pickYourCountry")}</Text>
                      <Text style={{ color: "#64748b", fontSize: 11 }}>{t("countryHelps")}</Text>
                    </>
                  )}
                </View>
                <Text style={{ color: "#475569", fontSize: 18 }}>›</Text>
              </TouchableOpacity>
            )}

            {/* Takım seçimi (son slayt) — isteğe bağlı, ülke seçiliyse görünür */}
            {item === SLIDES[SLIDES.length - 1] && !!country && (
              <TouchableOpacity
                onPress={() => setTeamPickerOpen(true)}
                disabled={allTeams.length === 0}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: team ? GOLD + "33" : "#1e293b", paddingHorizontal: 14, paddingVertical: 12, opacity: allTeams.length === 0 ? 0.5 : 1 }}
              >
                <Text style={{ fontSize: 18 }}>⚽</Text>
                <View style={{ flex: 1 }}>
                  {team ? (
                    <>
                      <Text style={{ color: GOLD, fontWeight: "700", fontSize: 13 }}>{t("yourTeam", { t: team })}</Text>
                      <Text style={{ color: "#64748b", fontSize: 11 }}>{t("tapToChange")}</Text>
                    </>
                  ) : (
                    <>
                      <Text style={{ color: "#cbd5e1", fontWeight: "700", fontSize: 13 }}>
                        {t("teamOptionalTitle")} <Text style={{ color: "#475569", fontWeight: "400" }}>{t("optionalParen")}</Text>
                      </Text>
                      <Text style={{ color: "#64748b", fontSize: 11 }}>
                        {allTeams.length === 0 ? t("noTeamsForCountry") : t("teamOpens")}
                      </Text>
                    </>
                  )}
                </View>
                <Text style={{ color: "#475569", fontSize: 18 }}>›</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />

      {/* Alt navigasyon */}
      <View style={{ paddingHorizontal: 24, paddingBottom: 40, gap: 16 }}>
        {/* Nokta göstergesi */}
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6 }}>
          {SLIDES.map((_, i) => (
            <View key={i} style={{ width: i === slide ? 20 : 6, height: 6, borderRadius: 3, backgroundColor: i === slide ? accent : "#1e293b" }} />
          ))}
        </View>

        {/* Butonlar */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          {slide > 0 && (
            <TouchableOpacity
              onPress={goBack}
              style={{ paddingVertical: 14, paddingHorizontal: 20, borderRadius: 999, backgroundColor: CARD, borderWidth: 1, borderColor: "#1e293b" }}
            >
              <Text style={{ color: "#94a3b8", fontWeight: "700", fontSize: 15 }}>←</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={goNext}
            disabled={busy}
            style={{ flex: 1, paddingVertical: 15, borderRadius: 999, backgroundColor: accent, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
          >
            {busy
              ? <ActivityIndicator color="#020617" />
              : <Text style={{ color: "#020617", fontWeight: "900", fontSize: 16 }}>
                  {isLast ? t("letsStart") : t("continueBtn")}
                </Text>
            }
          </TouchableOpacity>
        </View>

        {/* Direkt geç — tanıtımı atlar ama ülke seçimini atlamaz:
            handleStart ülke yoksa seçiciyi açar. */}
        {!isLast && (
          <TouchableOpacity onPress={handleStart} style={{ alignItems: "center" }}>
            <Text style={{ color: "#475569", fontSize: 13 }}>{t("skip")}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Ülke seçici */}
      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: "#000000cc", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: BG, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "80%", paddingTop: 16 }}>
            <View style={{ paddingHorizontal: 20, gap: 12, paddingBottom: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ flex: 1, color: "#fff", fontSize: 18, fontWeight: "900" }}>{t("pickYourCountry")}</Text>
                <TouchableOpacity onPress={() => setPickerOpen(false)}>
                  <Text style={{ color: "#64748b", fontSize: 15 }}>{t("close")}</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t("searchCountryPh")}
                placeholderTextColor="#475569"
                style={{ backgroundColor: CARD, borderRadius: 10, borderWidth: 1, borderColor: "#1e293b", paddingHorizontal: 14, paddingVertical: 10, color: "#fff", fontSize: 15 }}
              />
            </View>

            {/* "Ülkeler yükleniyor…" spinner'ı KALDIRILDI: liste artık gömülü
                listeyle dolu başlıyor, hiç boş olmuyor. Eski hâlinde
                `allCountries.length === 0` hem "yükleniyor" hem "istek
                başarısız" anlamına geliyordu ve ikincisinde spinner sonsuza
                kadar dönüyordu. */}
            {search.trim() && filteredCountries.length === 0 ? (
              <View style={{ padding: 32, alignItems: "center", gap: 6 }}>
                <Text style={{ color: "#64748b", fontSize: 14 }}>{t("countryNotFound")}</Text>
                <Text style={{ color: "#475569", fontSize: 12 }}>{t("tryDifferent")}</Text>
              </View>
            ) : (
              <FlatList
                data={filteredCountries}
                keyExtractor={(c) => c.country}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
                renderItem={({ item: c }) => {
                  const selected = c.country === country;
                  return (
                    <TouchableOpacity
                      onPress={() => {
                        setCountry(c.country);
                        setAutoDetected(false);
                        setSearch("");
                        setPickerOpen(false);
                      }}
                      style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#0f172a" }}
                    >
                      {!!c.flag && <Text style={{ fontSize: 20 }}>{c.flag}</Text>}
                      <Text style={{ flex: 1, color: selected ? GOLD : "#cbd5e1", fontSize: 15, fontWeight: selected ? "700" : "400" }}>
                        {ulkeAdi(c.country)}
                      </Text>
                      {selected && <Text style={{ color: GOLD, fontSize: 16 }}>✓</Text>}
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <Text style={{ color: "#475569", fontSize: 13, textAlign: "center", paddingVertical: 24 }}>
                    {t("noCountryMatch")}
                  </Text>
                }
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Takım seçici */}
      <Modal
        visible={teamPickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setTeamPickerOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: "#000000cc", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: BG, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "80%", paddingTop: 16 }}>
            <View style={{ paddingHorizontal: 20, gap: 12, paddingBottom: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ flex: 1, color: "#fff", fontSize: 18, fontWeight: "900" }}>{t("teamOptionalTitle")}</Text>
                <TouchableOpacity onPress={() => setTeamPickerOpen(false)}>
                  <Text style={{ color: "#64748b", fontSize: 15 }}>{t("close")}</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                value={teamSearch}
                onChangeText={setTeamSearch}
                placeholder={t("searchTeam")}
                placeholderTextColor="#475569"
                style={{ backgroundColor: CARD, borderRadius: 10, borderWidth: 1, borderColor: "#1e293b", paddingHorizontal: 14, paddingVertical: 10, color: "#fff", fontSize: 15 }}
              />
            </View>

            <FlatList
              data={filteredTeams}
              keyExtractor={(t) => t.team}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
              /* Seçimi geri alabilmek gerekiyor: takım isteğe bağlı ve yanlışlıkla
                 seçen kullanıcı başka türlü boşa döndüremezdi. */
              ListHeaderComponent={
                team ? (
                  <TouchableOpacity
                    onPress={() => { setTeam(null); setTeamSearch(""); setTeamPickerOpen(false); }}
                    style={{ paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#0f172a" }}
                  >
                    <Text style={{ color: "#64748b", fontSize: 14 }}>{t("removeSelection")}</Text>
                  </TouchableOpacity>
                ) : null
              }
              renderItem={({ item: t }) => {
                const selected = t.team === team;
                return (
                  <TouchableOpacity
                    onPress={() => { setTeam(t.team); setTeamSearch(""); setTeamPickerOpen(false); }}
                    style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#0f172a" }}
                  >
                    {!!t.flag && <Text style={{ fontSize: 20 }}>{t.flag}</Text>}
                    <Text style={{ flex: 1, color: selected ? GOLD : "#cbd5e1", fontSize: 15, fontWeight: selected ? "700" : "400" }}>
                      {t.team}
                    </Text>
                    {selected && <Text style={{ color: GOLD, fontSize: 16 }}>✓</Text>}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                /* ⚠️ İKİ BOŞ DURUM AYRI ŞEY.
                 *
                 * "Eşleşen takım yok" bir ARAMA sonucudur. Ölçüldü
                 * (2026-08-17): seçilebilir 96 ülkenin 68'inde takım kataloğu
                 * boş, yani o ülkelerden gelen kullanıcı hiçbir şey YAZMADAN
                 * bu mesajı görüyordu — kendi yaptığı bir yanlış varmış gibi.
                 * Eksik olan içerik ve takım adımı zaten isteğe bağlı; metin
                 * bunu söylüyor ve oyuna devam yolunu gösteriyor. */
                <Text style={{ color: "#475569", fontSize: 13, textAlign: "center", paddingVertical: 24, paddingHorizontal: 24, lineHeight: 19 }}>
                  {allTeams.length === 0 ? t("teamListEmpty") : t("noTeamMatch")}
                </Text>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
