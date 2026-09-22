import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";

const STEPS = [
  { number: "01", title: "Set the room", copy: "Build a question set and choose the countdown." },
  { number: "02", title: "Start together", copy: "Every screen opens the same question at the same moment." },
  { number: "03", title: "See the story", copy: "Scores, rank changes, and accuracy update as you go." },
];

export default function HomeScreen() {
  const router = useRouter();
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={[styles.content, isWide && styles.contentWide]} showsVerticalScrollIndicator={false}>
        <View style={styles.topline}>
          <View style={styles.logoMark}>
            <IconSymbol name="bolt.fill" color={colors.background} size={18} />
          </View>
          <Text style={[styles.eyebrow, { color: colors.muted }]}>LIVE EXAM ARENA</Text>
          <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
        </View>

        <View style={styles.hero}>
          <Text style={[styles.kicker, { color: colors.primary }]}>ONE ROOM. ONE CLOCK.</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Make every answer count.</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>A fast, fair competition app for classrooms, teams, and live events.</Text>
        </View>

        <View style={[styles.featureCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.featureHeader}>
            <View>
              <Text style={[styles.cardLabel, { color: colors.muted }]}>THE LIVE LOOP</Text>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Perfectly in sync</Text>
            </View>
            <View style={[styles.iconBubble, { backgroundColor: `${colors.primary}22` }]}>
              <IconSymbol name="clock.fill" color={colors.primary} size={22} />
            </View>
          </View>
          <Text style={[styles.featureCopy, { color: colors.muted }]}>Host controls the question. Participants race the same countdown. The leaderboard tells the rest.</Text>
          <View style={styles.signalRow}>
            <View style={[styles.signalLine, { backgroundColor: colors.primary }]} />
            <View style={[styles.signalLine, { backgroundColor: `${colors.primary}55` }]} />
            <View style={[styles.signalLine, { backgroundColor: `${colors.primary}22` }]} />
            <Text style={[styles.signalText, { color: colors.primary }]}>REAL-TIME</Text>
          </View>
        </View>

        <View style={[styles.actionRow, !isWide && styles.actionRowCompact]}>
          <Pressable onPress={() => router.push("/(tabs)/host")} style={({ pressed }) => [styles.actionCard, { backgroundColor: colors.primary }, pressed && styles.pressed]}>
            <View style={styles.actionIcon}><IconSymbol name="play.fill" color={colors.background} size={18} /></View>
            <Text style={[styles.actionTitle, { color: colors.background }]}>Host a room</Text>
            <Text style={[styles.actionCopy, { color: `${colors.background}B8` }]}>Create questions and launch</Text>
            <IconSymbol name="arrow.right" color={colors.background} size={18} />
          </Pressable>
          <Pressable onPress={() => router.push("/(tabs)/join")} style={({ pressed }) => [styles.actionCard, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }, pressed && styles.pressed]}>
            <View style={[styles.actionIcon, { backgroundColor: `${colors.primary}20` }]}><IconSymbol name="qrcode" color={colors.primary} size={18} /></View>
            <Text style={[styles.actionTitle, { color: colors.foreground }]}>Join a room</Text>
            <Text style={[styles.actionCopy, { color: colors.muted }]}>Enter a code and your name</Text>
            <IconSymbol name="arrow.right" color={colors.muted} size={18} />
          </Pressable>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>How the room moves</Text>
        <View style={styles.steps}>
          {STEPS.map((step) => (
            <View key={step.number} style={styles.stepRow}>
              <Text style={[styles.stepNumber, { color: colors.primary }]}>{step.number}</Text>
              <View style={styles.stepCopy}>
                <Text style={[styles.stepTitle, { color: colors.foreground }]}>{step.title}</Text>
                <Text style={[styles.stepDescription, { color: colors.muted }]}>{step.copy}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 18, paddingBottom: 32, gap: 22 },
  contentWide: { width: "100%", maxWidth: 1180, alignSelf: "center", paddingHorizontal: 28, paddingTop: 30, gap: 24 },
  topline: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoMark: { width: 32, height: 32, borderRadius: 10, backgroundColor: "#8B7CFF", alignItems: "center", justifyContent: "center" },
  eyebrow: { fontSize: 12, letterSpacing: 1.5, fontWeight: "800", flex: 1 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  hero: { gap: 8, paddingTop: 12 },
  heroWide: { maxWidth: 760 },
  kicker: { fontSize: 12, fontWeight: "800", letterSpacing: 1.4 },
  title: { fontSize: 40, lineHeight: 45, fontWeight: "900", letterSpacing: -1.7, maxWidth: 360 },
  subtitle: { fontSize: 16, lineHeight: 24, maxWidth: 350 },
  featureCard: { borderRadius: 24, borderWidth: 1, padding: 20, gap: 16 },
  featureHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.3 },
  cardTitle: { fontSize: 21, fontWeight: "800", marginTop: 5 },
  iconBubble: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  featureCopy: { fontSize: 14, lineHeight: 21 },
  signalRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  signalLine: { height: 4, borderRadius: 2, flex: 1 },
  signalText: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  actionRow: { flexDirection: "row", gap: 12 },
  actionRowCompact: { flexDirection: "column" },
  actionCard: { borderRadius: 20, padding: 16, flex: 1, minHeight: 170, justifyContent: "space-between", gap: 10 },
  actionIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#FFFFFF22", alignItems: "center", justifyContent: "center" },
  actionTitle: { fontSize: 17, fontWeight: "800" },
  actionCopy: { fontSize: 12, lineHeight: 17, minHeight: 34 },
  sectionTitle: { fontSize: 20, fontWeight: "800", marginTop: 4 },
  steps: { gap: 16 },
  stepRow: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  stepNumber: { fontSize: 12, fontWeight: "900", letterSpacing: 1, paddingTop: 2, width: 25 },
  stepCopy: { flex: 1, gap: 3 },
  stepTitle: { fontSize: 15, fontWeight: "800" },
  stepDescription: { fontSize: 13, lineHeight: 19 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
});
