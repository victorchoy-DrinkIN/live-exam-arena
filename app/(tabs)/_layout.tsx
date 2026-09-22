import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWide = Platform.OS === "web" && (typeof window !== "undefined" ? window.innerWidth >= 900 : false);
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 58 + bottomPadding;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.tint,
        tabBarInactiveTintColor: colors.muted,
        tabBarButton: HapticTab,
        tabBarStyle: {
          paddingTop: isWide ? 10 : 8,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
        },
        tabBarLabelStyle: { fontSize: isWide ? 12 : 11, fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Arena",
          tabBarIcon: ({ color }) => <IconSymbol size={23} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="host"
        options={{
          title: "Host",
          tabBarIcon: ({ color }) => <IconSymbol size={23} name="chart.bar.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="join"
        options={{
          title: "Join",
          tabBarIcon: ({ color }) => <IconSymbol size={23} name="person.2.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
