import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";

type Props = {
  title?: string;
  homeRoute?: string;
};

export default function BackBar({ title, homeRoute = "/(tabs)/live" }: Props) {
  const router = useRouter();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 8,
        borderBottomWidth: 1,
        borderBottomColor: "#1e293b",
        backgroundColor: "#020617",
      }}
    >
      <TouchableOpacity
        onPress={() => {
          if (router.canGoBack()) router.back();
          else router.replace(homeRoute as any);
        }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 8,
          backgroundColor: "#1e293b",
        }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={{ color: "#94a3b8", fontSize: 18, lineHeight: 20 }}>‹</Text>
        <Text style={{ color: "#94a3b8", fontWeight: "700", fontSize: 13 }}>Geri</Text>
      </TouchableOpacity>

      {title ? (
        <Text style={{ flex: 1, color: "#f1f5f9", fontWeight: "800", fontSize: 15 }} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}

      <TouchableOpacity
        onPress={() => router.replace(homeRoute as any)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 8,
          backgroundColor: "#1e293b",
        }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={{ color: "#94a3b8", fontSize: 14 }}>🏠</Text>
        <Text style={{ color: "#94a3b8", fontWeight: "700", fontSize: 13 }}>Ana Sayfa</Text>
      </TouchableOpacity>
    </View>
  );
}
