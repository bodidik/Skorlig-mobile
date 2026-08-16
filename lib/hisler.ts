/**
 * HİS KATMANI — ses + titreşim, tek kaynak.
 *
 * İlkeler:
 *  - Oyun hissi SÜSTÜR: bu modüldeki hiçbir hata oyunu düşüremez —
 *    her dış çağrı try/catch, modüller TEMBEL yüklenir (açılışı ağırlaştırmaz).
 *  - Kullanıcı sesi/titreşimi KAPATABİLİR; tercih cihazda kalıcıdır
 *    (skorlig.* anahtar geleneği). Varsayılan: ikisi de açık.
 *  - Ses dosyası tek ve küçük (assets/sfx/gol.wav ~50KB, sentez — telifsiz).
 */
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "skorlig.hisler";

export type HisTercihleri = { ses: boolean; titresim: boolean };

let tercih: HisTercihleri = { ses: true, titresim: true };
let yuklendi = false;
const dinleyiciler = new Set<() => void>();

async function yukle() {
  if (yuklendi) return;
  yuklendi = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      tercih = { ses: p?.ses !== false, titresim: p?.titresim !== false };
      dinleyiciler.forEach((f) => f());
    }
  } catch {}
}
yukle();

export function hisTercih(): HisTercihleri {
  return tercih;
}

export async function hisAyarla(degisiklik: Partial<HisTercihleri>) {
  tercih = { ...tercih, ...degisiklik };
  dinleyiciler.forEach((f) => f());
  try { await AsyncStorage.setItem(KEY, JSON.stringify(tercih)); } catch {}
}

/** Ayar ekranı için reaktif okuma. */
export function useHisler(): HisTercihleri {
  const [, tetikle] = useState(0);
  useEffect(() => {
    const f = () => tetikle((x) => x + 1);
    dinleyiciler.add(f);
    return () => { dinleyiciler.delete(f); };
  }, []);
  return tercih;
}

/* ── Ses ────────────────────────────────────────────────────────────────── */

let _player: any = null;
let _playerSoz: Promise<any> | null = null;

async function playerAl() {
  if (_player) return _player;
  if (!_playerSoz) {
    _playerSoz = (async () => {
      // Tembel: expo-audio ancak İLK gol anında yüklenir.
      const Audio = await import("expo-audio");
      try {
        // Sessiz moddaki iOS'ta da duyulmasın diye zorlamıyoruz; Android'de
        // diğer seslerle karışabilir (müzik kısılmaz, üstüne çalar).
        await Audio.setAudioModeAsync({ playsInSilentMode: false });
      } catch {}
      _player = Audio.createAudioPlayer(require("../assets/sfx/gol.wav"));
      return _player;
    })().catch((e) => {
      _playerSoz = null; // bir dahaki denemede yeniden kur
      throw e;
    });
  }
  return _playerSoz;
}

/**
 * Sesi ISIT — oynatıcıyı önceden kurar, ÇALMAZ.
 *
 * NEDEN VAR (2026-08-16, "sesler oynatılmıyor" bildirimi): oynatıcı ilk gol
 * anında kuruluyor ve AYNI tick'te `play()` çağrılıyordu. WAV henüz
 * yüklenmemişken çalma sessizce yutuluyor — oturumun İLK golü hiç
 * duyulmuyordu. Isıtma açılışta yapılınca ilk gol de çalıyor.
 *
 * Uygulama kökünde bir kez çağrılır; hata his katmanı kuralınca yutulur
 * (ses çalmaması oyunu düşürmez) ama geliştirmede görünür.
 */
export function sesiIsit() {
  if (!tercih.ses) return;
  playerAl().catch((e) => {
    if (__DEV__) console.warn("[hisler] ses isitma basarisiz:", e?.message || e);
  });
}

let _sonCalmaMs = 0;

/**
 * Gol sesi — tercihe bağlı; hata sessizce yutulur (his katmanı kuralı).
 *
 * ⚠️ 2 SANİYELİK HIZ SINIRI VAR. Canlı skor listesinde aynı yoklama turunda
 * birden çok maç gol atabilir; sınırsız çalma "ses kakofonisi" üretir — bu
 * korku yüzünden liste ekranı tamamen SESSİZE alınmıştı ve kullanıcı golü
 * hiç duymuyordu. Sınır sayesinde liste ekranında ses açılabildi: aynı anda
 * 3 gol = 1 ses, yeterli sinyal.
 */
export async function golSesiCal() {
  if (!tercih.ses) return;
  const simdi = Date.now();
  if (simdi - _sonCalmaMs < 2000) return;
  _sonCalmaMs = simdi;
  try {
    const p = await playerAl();
    p.seekTo(0);
    p.play();
  } catch (e) {
    /* Üretimde sessiz (his katmanı kuralı) ama geliştirmede GÖRÜNÜR:
     * bare catch yüzünden "ses çalmıyor" aylarca teşhissiz kalmıştı. */
    if (__DEV__) console.warn("[hisler] gol sesi calinamadi:", (e as any)?.message || e);
  }
}

/* ── Titreşim ───────────────────────────────────────────────────────────── */

/** Gol: belirgin "başarı" darbesi · dokunuş: hafif tık. */
export async function titret(tur: "gol" | "hafif" = "hafif") {
  if (!tercih.titresim) return;
  try {
    const H = await import("expo-haptics");
    if (tur === "gol") await H.notificationAsync(H.NotificationFeedbackType.Success);
    else await H.impactAsync(H.ImpactFeedbackStyle.Light);
  } catch {}
}
