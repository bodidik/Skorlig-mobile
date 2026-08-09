// D:\APPden\SkorLig\mobile\app\(tabs)\_layout.tsx
import React from "react";
import { View } from "react-native";
import { Tabs } from "expo-router";
import TabBar from "../../components/TabBar";
import KazancBildirimi from "../../components/KazancBildirimi";
import { t, useLang } from "../../lib/i18n";

export default function TabsLayout() {
  useLang(); // dil değişince sekme başlıkları yenilensin

  return (
    <View style={{ flex: 1 }}>
    <Tabs
      // Özel çubuk: aktif altın hap + dolu ikon + yay animasyonu.
      // İkonlar components/TabBar.tsx içinde rota adına göre eşlenir.
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="live" options={{ title: t("matches") }} />
      <Tabs.Screen name="predict" options={{ title: t("tabPredict") }} />
      <Tabs.Screen name="arena" options={{ title: t("modeDuel") }} />
      <Tabs.Screen name="stats" options={{ title: t("rankingTab") }} />
      <Tabs.Screen name="me" options={{ title: t("tabProfile") }} />
    </Tabs>
    {/* Kullanıcı yokken sonuçlanan kazançların kutlaması — tüm sekmelerin üstünde. */}
    <KazancBildirimi />
    </View>
  );
}
