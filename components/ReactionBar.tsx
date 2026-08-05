import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { apiJson } from "../lib/apiFetch";
import { t, useLang } from "../lib/i18n";
import { usePolling } from "../hooks/usePolling";

/**
 * MAÇ ODASI TEPKİ ÇUBUĞU — kapalı liste, serbest metin YOK.
 *
 * Emoji burada, METİN i18n'de, İZİN VERİLEN LİSTE SUNUCUDA. Üçü ayrı yerde
 * duruyor çünkü üçü ayrı hızda değişiyor: yeni dil i18n'e, yeni tepki sunucuya
 * dokunuyor.
 *
 * ⚠️ `EMOJI` burada eksik kalırsa tepki YİNE görünür (anahtar metni yedek).
 * Sunucu listesi tek yetkili: buradaki tablo ondan sonra gelir, onu KISITLAMAZ.
 */
const EMOJI: Record<string, string> = {
  gol: "⚽",
  ates: "🔥",
  sok: "😱",
  guldum: "😂",
  sinir: "😤",
  helal: "👏",
  hakem: "🤨",
  yikildim: "💔",
};

/** Sunucu ulaşılamazsa çubuk boş kalmasın diye yedek sıra. */
const YEDEK_KEYS = Object.keys(EMOJI);

type Feed = { key: string; userId: string; displayName: string; at: number };
type Resp = {
  ok?: boolean;
  keys?: string[];
  counts?: Record<string, number>;
  total?: number;
  feed?: Feed[];
  cooldownMs?: number;
};

type Props = {
  fixtureId: string;
  /** Canlı maçta sık, bittiyse hiç. null → yalnızca açılışta bir kez. */
  pollMs?: number | null;
};

export default function ReactionBar({ fixtureId, pollMs = 20000 }: Props) {
  useLang();
  const [data, setData] = useState<Resp | null>(null);
  const [bekleyen, setBekleyen] = useState<string | null>(null);
  const [uyari, setUyari] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!fixtureId) return;
    const r = await apiJson(`/api/rt/reactions?fixtureId=${encodeURIComponent(fixtureId)}&limit=12`);
    if (r?.ok) setData(r);
  }, [fixtureId]);

  usePolling(load, pollMs ?? null);

  // Uyarı kendiliğinden sönsün — kullanıcı kapatmakla uğraşmasın.
  useEffect(() => {
    if (!uyari) return;
    const z = setTimeout(() => setUyari(null), 2500);
    return () => clearTimeout(z);
  }, [uyari]);

  const keys = useMemo(
    () => (Array.isArray(data?.keys) && data!.keys!.length ? data!.keys! : YEDEK_KEYS),
    [data?.keys]
  );
  const counts = data?.counts || {};

  async function bas(key: string) {
    if (bekleyen) return;
    setBekleyen(key);

    /* ⚠️ İYİMSER SAYIM AMA UYDURMA DEĞİL: sayı hemen artıyor ki dokunuş
     * karşılıksız hissettirmesin, sunucu yanıtı gelince GERÇEK sayımla
     * değiştiriliyor. Reddedilirse (bekleme/kota) eski sayıma dönülüyor —
     * kullanıcı yazılmamış bir tepkiyi yazılmış sanmasın. */
    const oncesi = data;
    setData((d) => ({
      ...(d || {}),
      counts: { ...(d?.counts || {}), [key]: (d?.counts?.[key] || 0) + 1 },
      total: (d?.total || 0) + 1,
    }));

    const r = await apiJson(`/api/rt/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixtureId, key }),
    });

    if (r?.ok) {
      setData((d) => ({ ...(d || {}), counts: r.counts || d?.counts, total: r.total ?? d?.total }));
      load(); // akış da tazelensin
    } else {
      setData(oncesi);
      setUyari(
        r?.error === "TOO_FAST" ? t("reactTooFast")
        : r?.error === "REACTION_LIMIT" ? t("reactLimit")
        : t("reactFailed")
      );
    }
    setBekleyen(null);
  }

  if (!fixtureId) return null;

  const feed = Array.isArray(data?.feed) ? data!.feed! : [];

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Text style={s.title}>{t("reactRoomTitle")}</Text>
        {!!data?.total && <Text style={s.total}>{t("reactTotal", { n: data.total })}</Text>}
      </View>

      <View style={s.grid}>
        {keys.map((k) => {
          const n = counts[k] || 0;
          const aktif = bekleyen === k;
          return (
            <TouchableOpacity
              key={k}
              onPress={() => bas(k)}
              disabled={!!bekleyen}
              style={[s.btn, n > 0 && s.btnDolu, aktif && s.btnAktif]}
            >
              <Text style={s.emoji}>{EMOJI[k] || "•"}</Text>
              <Text style={[s.label, n > 0 && s.labelDolu]} numberOfLines={1}>
                {t(`react_${k}` as any)}
              </Text>
              {n > 0 && <Text style={s.count}>{n}</Text>}
            </TouchableOpacity>
          );
        })}
      </View>

      {!!uyari && <Text style={s.uyari}>{uyari}</Text>}

      {feed.length > 0 && (
        <View style={s.feed}>
          {feed.slice(0, 6).map((f, i) => (
            <Text key={`${f.userId}-${f.at}-${i}`} style={s.feedRow} numberOfLines={1}>
              <Text style={s.feedName}>{f.displayName}</Text>
              {"  "}
              {EMOJI[f.key] || ""} {t(`react_${f.key}` as any)}
            </Text>
          ))}
        </View>
      )}

      {feed.length === 0 && (
        /* Boş oda, hiç olmayan odadan kötüdür: davet edici bir satır bırak. */
        <Text style={s.bos}>{t("reactBeFirst")}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#1e293b",
    gap: 10,
  },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: "#e2e8f0", fontWeight: "800", fontSize: 13 },
  total: { color: "#64748b", fontSize: 11, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#1e293b",
    backgroundColor: "#020617",
  },
  btnDolu: { borderColor: "#334155" },
  btnAktif: { borderColor: "#a3e635", backgroundColor: "#14210a" },
  emoji: { fontSize: 14 },
  label: { color: "#64748b", fontSize: 11, fontWeight: "700" },
  labelDolu: { color: "#94a3b8" },
  count: { color: "#a3e635", fontSize: 11, fontWeight: "900" },
  uyari: { color: "#f59e0b", fontSize: 11 },
  feed: { gap: 3, borderTopWidth: 1, borderTopColor: "#1e293b", paddingTop: 8 },
  feedRow: { color: "#64748b", fontSize: 11 },
  feedName: { color: "#94a3b8", fontWeight: "700" },
  bos: { color: "#475569", fontSize: 11, fontStyle: "italic" },
});
