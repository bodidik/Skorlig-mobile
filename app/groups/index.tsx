/**
 * GRUPLAR EKRANI — kurma, KODU GÖSTERME, kodla katılma.
 *
 * ⚠️ ÖLÇÜLEN KUSUR (2026-09-10 TR40 denetimi, me.tsx:840 ve me.tsx:843 —
 * ikisi de "kritik", 3/3 oy): sunucuda tam çalışan bir grup özelliği vardı ve
 * istemci yalnızca iki ucunu çağırıyordu (`groups/list`, `groups/create`).
 * Grup adı kullanıcıya sorulmuyor, kurulunca dönen `code` okunmuyor, kod
 * hiçbir yerde görünmüyor, girilecek alan yok, pano ekranı yoktu.
 *
 * Yani "arkadaşımla yarışabiliyor muyum?" sorusunun cevabı HAYIR'dı; eksik
 * olan sunucu değil KABLOYDU. Bot gruplarının "keşfedilebilir sabit kod"
 * tasarımı (GSGRUP gibi) da karşılıksız kalıyordu.
 *
 * ⚠️ İSTEK MANTIĞI BU DOSYADA DEĞİL: `lib/gruplar.ts` saf ve Node altında
 * GERÇEK sunucuya karşı sınanıyor (api/tests/grup-kablosu.mongo.test.cjs).
 * Ekranın içine yazılsaydı yalnızca kaynak tarayan bir nöbetçiyle
 * korunabilirdi.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Share,
} from "react-native";
import { useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";

import Colors from "../../constants/colors";
import { t, useLang } from "../../lib/i18n";
import { hataMesaji } from "../../lib/hataMesaji";
import { apiFetch } from "../../lib/apiFetch";
import { useUserId } from "../../lib/useUserId";
import {
  gruplarim,
  grupKur,
  grubaKatil,
  kodNormalle,
  kodGecerliMi,
  KOD_UZUNLUK,
  type GrupOzet,
} from "../../lib/gruplar";

export default function GroupsScreen() {
  useLang();
  const router = useRouter();
  const userId = useUserId();

  const [yukleniyor, setYukleniyor] = useState(true);
  const [yenileniyor, setYenileniyor] = useState(false);
  const [gruplar, setGruplar] = useState<GrupOzet[]>([]);
  const [hata, setHata] = useState("");

  const [ad, setAd] = useState("");
  const [kod, setKod] = useState("");
  const [islemde, setIslemde] = useState(false);

  const yukle = useCallback(async () => {
    if (!userId) { setYukleniyor(false); return; }
    const r = await gruplarim(userId, apiFetch as any);
    if (r.durum === "ok") { setGruplar(r.items); setHata(""); }
    else { setGruplar([]); setHata(hataMesaji(r.hata)); }
    setYukleniyor(false);
  }, [userId]);

  useEffect(() => { yukle(); }, [yukle]);

  async function kur() {
    const isim = ad.trim();
    if (!isim) return;
    setIslemde(true);
    const r = await grupKur(isim, apiFetch as any);
    setIslemde(false);
    if (r.durum !== "ok") { Alert.alert(t("error"), hataMesaji(r.hata)); return; }
    setAd("");
    await yukle();
    /* ⚠️ KOD HEMEN GÖSTERİLİYOR. Eski akış yalnız "Grup oluşturuldu" diyordu
     * ve kodu atıyordu; kullanıcı arkadaşını çağıramıyordu. */
    Alert.alert(t("groupCreated"), t("groupCodeIs", { c: r.code }), [
      { text: t("groupShare"), onPress: () => paylas(r.code, r.name) },
      { text: t("ok") },
    ]);
  }

  async function katil() {
    const k = kodNormalle(kod);
    if (!kodGecerliMi(k)) {
      Alert.alert(t("error"), t("groupCodeBad", { n: KOD_UZUNLUK }));
      return;
    }
    setIslemde(true);
    const r = await grubaKatil(k, apiFetch as any);
    setIslemde(false);
    if (r.durum !== "ok") { Alert.alert(t("error"), hataMesaji(r.hata)); return; }
    setKod("");
    await yukle();
    Alert.alert("SkorLig", t("groupJoined", { g: r.name }));
  }

  async function paylas(code: string, isim: string) {
    try {
      await Share.share({ message: t("groupShareText", { g: isim, c: code }) });
    } catch { /* kullanıcı vazgeçti */ }
  }

  async function kopyala(code: string) {
    try {
      await Clipboard.setStringAsync(code);
      Alert.alert("SkorLig", t("groupCodeCopied"));
    } catch (e: any) {
      Alert.alert(t("error"), hataMesaji(e));
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={yenileniyor}
          onRefresh={async () => { setYenileniyor(true); await yukle(); setYenileniyor(false); }}
          tintColor={Colors.accent}
        />
      }
    >
      <Text style={{ color: Colors.text, fontSize: 22, fontWeight: "800" }}>{t("groupsTitle")}</Text>
      <Text style={{ color: Colors.muted, fontSize: 12, marginTop: 4, lineHeight: 18 }}>
        {t("groupsIntro")}
      </Text>

      {/* ── Kodla katıl ────────────────────────────────────────────────── */}
      <View style={{ marginTop: 20, padding: 14, borderRadius: 12, backgroundColor: Colors.dark }}>
        <Text style={{ color: Colors.text, fontSize: 14, fontWeight: "700" }}>{t("groupJoinTitle")}</Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <TextInput
            value={kod}
            onChangeText={(s) => setKod(kodNormalle(s))}
            placeholder={t("groupCodePh")}
            placeholderTextColor={Colors.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={KOD_UZUNLUK}
            style={{
              flex: 1, color: Colors.text, backgroundColor: Colors.bg,
              borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
              letterSpacing: 3, fontWeight: "700",
            }}
          />
          <TouchableOpacity
            onPress={katil}
            disabled={islemde || !kodGecerliMi(kod)}
            style={{
              paddingHorizontal: 18, justifyContent: "center", borderRadius: 10,
              backgroundColor: kodGecerliMi(kod) ? Colors.accent : Colors.bg,
            }}
          >
            <Text style={{ color: kodGecerliMi(kod) ? Colors.slate900 : Colors.muted, fontWeight: "700" }}>
              {t("groupJoinCta")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Grup kur ───────────────────────────────────────────────────── */}
      <View style={{ marginTop: 12, padding: 14, borderRadius: 12, backgroundColor: Colors.dark }}>
        <Text style={{ color: Colors.text, fontSize: 14, fontWeight: "700" }}>{t("groupCreateTitle")}</Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <TextInput
            value={ad}
            onChangeText={setAd}
            placeholder={t("groupNamePh")}
            placeholderTextColor={Colors.muted}
            maxLength={40}
            style={{
              flex: 1, color: Colors.text, backgroundColor: Colors.bg,
              borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
            }}
          />
          <TouchableOpacity
            onPress={kur}
            disabled={islemde || !ad.trim()}
            style={{
              paddingHorizontal: 18, justifyContent: "center", borderRadius: 10,
              backgroundColor: ad.trim() ? Colors.accent : Colors.bg,
            }}
          >
            <Text style={{ color: ad.trim() ? Colors.slate900 : Colors.muted, fontWeight: "700" }}>
              {t("groupCreateCta")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Gruplarım ──────────────────────────────────────────────────── */}
      {yukleniyor ? (
        <ActivityIndicator color={Colors.accent} style={{ marginTop: 24 }} />
      ) : hata ? (
        <View style={{ marginTop: 20, padding: 14, borderRadius: 12, backgroundColor: Colors.dark }}>
          <Text style={{ color: Colors.text, fontSize: 13 }}>{hata}</Text>
          <TouchableOpacity onPress={yukle} style={{ marginTop: 10 }}>
            <Text style={{ color: Colors.accent, fontWeight: "700" }}>{t("retry")}</Text>
          </TouchableOpacity>
        </View>
      ) : gruplar.length === 0 ? (
        <View style={{ marginTop: 24, padding: 16, borderRadius: 12, backgroundColor: Colors.dark }}>
          <Text style={{ color: Colors.text, fontSize: 14, fontWeight: "700" }}>{t("groupsEmpty")}</Text>
          <Text style={{ color: Colors.muted, fontSize: 12, marginTop: 6, lineHeight: 18 }}>
            {t("groupsEmptyHelp")}
          </Text>
        </View>
      ) : (
        gruplar.map((g) => (
          <TouchableOpacity
            key={g.code}
            activeOpacity={0.85}
            onPress={() => router.push({ pathname: "/groups/[code]", params: { code: g.code } })}
            style={{ marginTop: 12, padding: 14, borderRadius: 12, backgroundColor: Colors.dark }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: Colors.text, fontSize: 16, fontWeight: "800" }}>{g.name}</Text>
              {g.sahibiMiyim ? (
                <Text style={{ color: Colors.accent, fontSize: 11, fontWeight: "700" }}>{t("groupOwner")}</Text>
              ) : null}
            </View>
            <Text style={{ color: Colors.muted, fontSize: 11, marginTop: 4 }}>
              {t("groupMembers", { n: g.size })}
            </Text>

            {/* ⚠️ KOD BURADA GÖRÜNÜYOR — kusurun düzeltildiği yer. */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 }}>
              <Text style={{ color: Colors.muted, fontSize: 11 }}>{t("groupCodeLabel")}</Text>
              <Text selectable style={{ color: Colors.text, fontSize: 16, fontWeight: "800", letterSpacing: 3 }}>
                {g.code}
              </Text>
              <TouchableOpacity onPress={() => kopyala(g.code)}>
                <Text style={{ color: Colors.accent, fontWeight: "700", fontSize: 12 }}>{t("groupCopy")}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => paylas(g.code, g.name)}>
                <Text style={{ color: Colors.accent, fontWeight: "700", fontSize: 12 }}>{t("groupShare")}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}
