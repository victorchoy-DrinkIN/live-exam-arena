import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useAuth } from "@/hooks/use-auth";
import { startOAuthLogin } from "@/constants/oauth";
import { trpc } from "@/lib/trpc";
import type { ExamSnapshot } from "@/server/db";

type HostQuestion = { questionType: "multiple_choice" | "fill_blank"; prompt: string; options: string[]; correctOption: number | null; correctAnswer?: string; acceptedAnswers?: string[]; points: number; timeLimitSeconds: number };

type Snapshot = ExamSnapshot;

const starterQuestions: HostQuestion[] = [
  { questionType: "multiple_choice", prompt: "Which planet is known as the Red Planet?", options: ["Mars", "Venus", "Jupiter", "Mercury"], correctOption: 0, points: 5, timeLimitSeconds: 20 },
  { questionType: "multiple_choice", prompt: "What is the capital city of Japan?", options: ["Seoul", "Tokyo", "Kyoto", "Osaka"], correctOption: 1, points: 5, timeLimitSeconds: 25 },
  { questionType: "multiple_choice", prompt: "Which element has the chemical symbol O?", options: ["Gold", "Oxygen", "Osmium", "Iron"], correctOption: 1, points: 5, timeLimitSeconds: 20 },
];

const DRAFT_CODE_KEY = "live-exam-arena:last-draft-code";

function parseQuestionOptions(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return value.split("|").map((option) => option.trim()).filter(Boolean);
  }
}

export default function HostScreen() {
  const router = useRouter();
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const { user, loading: authLoading, isAuthenticated, logout } = useAuth();
  const [mode, setMode] = useState<"setup" | "live">("setup");
  const [title, setTitle] = useState("Friday Knowledge Sprint");
  const [questions, setQuestions] = useState<HostQuestion[]>(starterQuestions);
  const [code, setCode] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [savedDraft, setSavedDraft] = useState<Snapshot | null>(null);
  const [now, setNow] = useState(Date.now());

  const createExam = trpc.exam.create.useMutation();
  const startQuestion = trpc.exam.startQuestion.useMutation();
  const completeExam = trpc.exam.complete.useMutation();
  const liveQuery = trpc.exam.adminByCode.useQuery({ code: code || "NONE" }, { enabled: Boolean(code), refetchInterval: 1000 });
  const liveSnapshot = liveQuery.data ?? snapshot;

  useEffect(() => {
    if (liveQuery.data) setSnapshot(liveQuery.data as Snapshot);
  }, [liveQuery.data]);

  useEffect(() => {
    void AsyncStorage.getItem(DRAFT_CODE_KEY).then((draftCode) => {
      if (draftCode && !code) setCode(draftCode);
    });
  }, [code]);

  useEffect(() => {
    const draft = liveQuery.data as Snapshot | undefined;
    if (mode !== "setup" || savedDraft || !draft || draft.status !== "draft") return;
    setSavedDraft(draft);
    setTitle(draft.title);
    setQuestions(draft.questions.map((question) => ({
      questionType: question.questionType ?? "multiple_choice",
      prompt: question.prompt,
      options: parseQuestionOptions(question.options),
      correctOption: question.correctOption ?? null,
      correctAnswer: question.correctAnswer ?? undefined,
      acceptedAnswers: question.acceptedAnswers ? (() => {
        try {
          const parsed = JSON.parse(question.acceptedAnswers);
          return Array.isArray(parsed) ? parsed.map(String) : [];
        } catch {
          return question.acceptedAnswers.split(/[\n,]/).map((answer) => answer.trim()).filter(Boolean);
        }
      })() : undefined,
      points: question.points ?? 5,
      timeLimitSeconds: question.timeLimitSeconds ?? 30,
    })));
  }, [liveQuery.data, mode, savedDraft]);

  useEffect(() => {
    if (mode !== "live") return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [mode]);

  const activeQuestion = liveSnapshot && liveSnapshot.activeQuestionIndex >= 0 ? liveSnapshot.questions[liveSnapshot.activeQuestionIndex] : null;
  const remainingSeconds = activeQuestion && liveSnapshot?.currentQuestionEndsAt ? Math.max(0, Math.ceil((new Date(liveSnapshot.currentQuestionEndsAt).getTime() - now) / 1000)) : null;

  if (authLoading) {
    return <ScreenContainer className="items-center justify-center"><ActivityIndicator color={colors.primary} size="large" /><Text style={[styles.authLoadingText, { color: colors.muted }]}>Checking host access…</Text></ScreenContainer>;
  }

  if (!isAuthenticated) {
    return (
      <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
        <View style={styles.authGate}>
          <View style={[styles.authGateIcon, { backgroundColor: `${colors.primary}18` }]}><IconSymbol name="chart.bar.fill" color={colors.primary} size={30} /></View>
          <Text style={[styles.authGateKicker, { color: colors.primary }]}>ADMIN ACCESS</Text>
          <Text style={[styles.authGateTitle, { color: colors.foreground }]}>Sign in to host.</Text>
          <Text style={[styles.authGateCopy, { color: colors.muted }]}>Room creation and live controls are reserved for verified administrators.</Text>
          <Pressable onPress={startOAuthLogin} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, width: "100%" }, pressed && styles.pressed]}><IconSymbol name="arrow.right" color={colors.background} size={18} /><Text style={[styles.primaryButtonText, { color: colors.background }]}>Continue with Manus</Text></Pressable>
          <Pressable onPress={() => router.push("/")}><Text style={[styles.backToArena, { color: colors.muted }]}>Back to arena</Text></Pressable>
        </View>
      </ScreenContainer>
    );
  }

  if (user?.role !== "admin") {
    return (
      <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
        <View style={styles.authGate}>
          <View style={[styles.authGateIcon, { backgroundColor: `${colors.warning}18` }]}><IconSymbol name="xmark" color={colors.warning} size={30} /></View>
          <Text style={[styles.authGateKicker, { color: colors.warning }]}>ACCESS RESTRICTED</Text>
          <Text style={[styles.authGateTitle, { color: colors.foreground }]}>Admin approval required.</Text>
          <Text style={[styles.authGateCopy, { color: colors.muted }]}>You’re signed in as {user?.name || user?.email || "a participant"}, but this account cannot create or control rooms.</Text>
          <Pressable onPress={logout} style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.border, backgroundColor: colors.surface, width: "100%" }, pressed && styles.pressed]}><Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>Sign out</Text></Pressable>
          <Pressable onPress={() => router.push("/")}><Text style={[styles.backToArena, { color: colors.muted }]}>Back to arena</Text></Pressable>
        </View>
      </ScreenContainer>
    );
  }

  const updateQuestion = (index: number, patch: Partial<HostQuestion>) => {
    setQuestions((current) => current.map((question, questionIndex) => questionIndex === index ? { ...question, ...patch } : question));
  };

  const buildQuestionPayload = () => questions.map((question) => ({
    ...question,
    options: JSON.stringify(question.questionType === "multiple_choice" ? question.options : []),
    correctOption: question.questionType === "multiple_choice" ? question.correctOption : null,
    correctAnswer: question.questionType === "fill_blank" ? question.acceptedAnswers?.[0]?.trim() || question.correctAnswer?.trim() : null,
    acceptedAnswers: question.questionType === "fill_blank" ? JSON.stringify(question.acceptedAnswers?.filter(Boolean) ?? []) : null,
    points: question.points,
  }));

  const saveDraft = async () => {
    const created = await createExam.mutateAsync({ title: title.trim() || "Untitled sprint", questions: buildQuestionPayload() });
    if (!created) return;
    setSavedDraft(created as Snapshot);
    await AsyncStorage.setItem(DRAFT_CODE_KEY, created.code);
  };

  const launchExam = async () => {
    if (savedDraft) {
      setSnapshot(savedDraft);
      setCode(savedDraft.code);
      setMode("live");
      return;
    }
    const created = await createExam.mutateAsync({
      title: title.trim() || "Untitled sprint",
      questions: buildQuestionPayload(),
    });
    if (!created) return;
    setSnapshot(created as Snapshot);
    setCode(created.code);
    setMode("live");
  };

  const start = async (index: number) => {
    if (!liveSnapshot) return;
    const next = await startQuestion.mutateAsync({ examId: liveSnapshot.id, questionIndex: index });
    setSnapshot(next as Snapshot);
  };

  const finish = async () => {
    if (!liveSnapshot) return;
    const next = await completeExam.mutateAsync({ examId: liveSnapshot.id });
    setSnapshot(next as Snapshot);
  };

  if (mode === "setup") {
    return (
      <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
        <FlatList
          data={questions}
          keyExtractor={(_, index) => String(index)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.setupContent, isWide && styles.setupContentWide]}
          ListHeaderComponent={
            <View style={styles.setupHeader}>
              <Pressable onPress={() => router.push("/")} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
                <IconSymbol name="arrow.left" color={colors.foreground} size={20} />
              </Pressable>
              <View style={styles.headerCopy}>
                <Text style={[styles.kicker, { color: colors.primary }]}>HOST CONTROL</Text>
                <Text style={[styles.title, { color: colors.foreground }]}>Build your sprint.</Text>
                <Text style={[styles.subtitle, { color: colors.muted }]}>Set the questions. We’ll keep the room in sync.</Text>
              </View>
              <View style={[styles.stepPill, { backgroundColor: `${colors.primary}18` }]}><Text style={[styles.stepPillText, { color: colors.primary }]}>SETUP 01</Text></View>
              <TextInput value={title} onChangeText={setTitle} placeholder="Room title" placeholderTextColor={colors.muted} style={[styles.titleInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]} />
              <View style={styles.sectionRow}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Questions</Text>
                <Text style={[styles.sectionMeta, { color: colors.muted }]}>{questions.length} total</Text>
              </View>
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={[styles.questionEditor, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.questionEditorTop}>
                <View style={[styles.numberBadge, { backgroundColor: `${colors.primary}18` }]}><Text style={[styles.numberBadgeText, { color: colors.primary }]}>0{index + 1}</Text></View>
                <Text style={[styles.editorLabel, { color: colors.muted }]}>QUESTION {index + 1}</Text>
                  <TextInput keyboardType="number-pad" value={String(item.points)} onChangeText={(value) => updateQuestion(index, { points: Math.min(1000, Math.max(1, Number(value) || 1)) })} style={[styles.timeInput, { color: colors.primary, borderColor: `${colors.primary}44` }]} />
                  <Text style={[styles.seconds, { color: colors.muted }]}>pts</Text>
                  <TextInput keyboardType="number-pad" value={String(item.timeLimitSeconds)} onChangeText={(value) => updateQuestion(index, { timeLimitSeconds: Math.min(180, Math.max(5, Number(value) || 5)) })} style={[styles.timeInput, { color: colors.primary, borderColor: `${colors.primary}44` }]} />
                <Text style={[styles.seconds, { color: colors.muted }]}>sec</Text>
              </View>
              <View style={styles.typeSelector}>
                {(["multiple_choice", "fill_blank"] as const).map((type) => (
                  <Pressable key={type} onPress={() => updateQuestion(index, { questionType: type, correctOption: type === "multiple_choice" ? (item.correctOption ?? 0) : null, correctAnswer: type === "fill_blank" ? (item.correctAnswer ?? item.acceptedAnswers?.[0] ?? "") : undefined, acceptedAnswers: type === "fill_blank" ? (item.acceptedAnswers ?? (item.correctAnswer ? [item.correctAnswer] : [])) : undefined, options: type === "multiple_choice" ? (item.options.length >= 2 ? item.options : ["Option A", "Option B"]) : [] })} style={[styles.typePill, { backgroundColor: item.questionType === type ? `${colors.primary}18` : colors.background, borderColor: item.questionType === type ? colors.primary : colors.border }]}>
                    <Text style={[styles.typePillText, { color: item.questionType === type ? colors.primary : colors.muted }]}>{type === "multiple_choice" ? "Multiple choice" : "Fill in the blank"}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput multiline value={item.prompt} onChangeText={(value) => updateQuestion(index, { prompt: value })} placeholder="Write the question" placeholderTextColor={colors.muted} style={[styles.promptInput, { color: colors.foreground, borderColor: colors.border }]} />
              {item.questionType === "multiple_choice" ? <>
                <View style={styles.optionGrid}>
                {item.options.map((option, optionIndex) => (
                  <Pressable key={`${index}-${optionIndex}`} onPress={() => updateQuestion(index, { correctOption: optionIndex })} style={({ pressed }) => [styles.optionChip, { borderColor: item.correctOption === optionIndex ? colors.primary : colors.border, backgroundColor: item.correctOption === optionIndex ? `${colors.primary}18` : colors.background }, pressed && styles.pressed]}>
                    <Text style={[styles.optionLetter, { color: item.correctOption === optionIndex ? colors.primary : colors.muted }]}>{String.fromCharCode(65 + optionIndex)}</Text>
                    <TextInput value={option} onChangeText={(value) => updateQuestion(index, { options: item.options.map((current, currentIndex) => currentIndex === optionIndex ? value : current) })} placeholder="Option" placeholderTextColor={colors.muted} style={[styles.optionText, { color: colors.foreground }]} />
                    {item.correctOption === optionIndex && <IconSymbol name="checkmark.circle.fill" size={17} color={colors.success} />}
                    {item.options.length > 2 && <Pressable onPress={() => updateQuestion(index, { options: item.options.filter((_, currentIndex) => currentIndex !== optionIndex), correctOption: item.correctOption === optionIndex ? 0 : item.correctOption !== null && item.correctOption > optionIndex ? item.correctOption - 1 : item.correctOption })} style={styles.iconButton}><IconSymbol name="xmark" size={14} color={colors.muted} /></Pressable>}
                  </Pressable>
                ))}
                </View>
                {item.options.length < 8 && <Pressable onPress={() => updateQuestion(index, { options: [...item.options, `Option ${String.fromCharCode(65 + item.options.length)}`] })} style={[styles.addOptionButton, { borderColor: colors.border }]}><IconSymbol name="plus" size={15} color={colors.primary} /><Text style={[styles.addOptionText, { color: colors.primary }]}>Add option</Text></Pressable>}
              </> : <TextInput multiline value={(item.acceptedAnswers ?? (item.correctAnswer ? [item.correctAnswer] : [])).join("\n")} onChangeText={(value) => { const acceptedAnswers = value.split(/[,\n]/).map((answer) => answer.trim()).filter(Boolean); updateQuestion(index, { acceptedAnswers, correctAnswer: acceptedAnswers[0] ?? "" }); }} placeholder="Accepted answers — one per line or comma-separated" placeholderTextColor={colors.muted} style={[styles.fillAnswerInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]} />}
            </View>
          )}
          ListFooterComponent={
            <View style={styles.setupFooter}>
              <Pressable onPress={() => setQuestions((current) => [...current, { questionType: "multiple_choice", prompt: "New challenge question", options: ["Option A", "Option B", "Option C", "Option D"], correctOption: 0, points: 5, timeLimitSeconds: 20 }])} style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && styles.pressed]}>
                <IconSymbol name="plus" color={colors.primary} size={18} /><Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>Add question</Text>
              </Pressable>
              <View style={styles.actionButtonsRow}>
                <Pressable disabled={createExam.isPending} onPress={saveDraft} style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.border, backgroundColor: colors.surface, flex: 1 }, pressed && styles.pressed]}>
                  {createExam.isPending ? <ActivityIndicator color={colors.primary} /> : <><IconSymbol name="tray.and.arrow.down.fill" color={colors.primary} size={17} /><Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>Save draft</Text></>}
                </Pressable>
                <Pressable disabled={createExam.isPending} onPress={launchExam} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, flex: 1 }, pressed && styles.pressed]}>
                  <IconSymbol name="play.fill" color={colors.background} size={18} /><Text style={[styles.primaryButtonText, { color: colors.background }]}>{savedDraft ? "Release room" : "Create room"}</Text><IconSymbol name="arrow.right" color={colors.background} size={18} />
                </Pressable>
              </View>
              {savedDraft && <Text style={[styles.savedDraftText, { color: colors.success }]}>Draft saved. Release it when you’re ready to share the room code.</Text>}
              {createExam.error && <Text style={[styles.errorText, { color: colors.error }]}>{createExam.error.message}</Text>}
            </View>
          }
        />
      </ScreenContainer>
    );
  }

  if (!liveSnapshot) return <ScreenContainer className="items-center justify-center"><ActivityIndicator color={colors.primary} /></ScreenContainer>;

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={[styles.liveContent, isWide && styles.liveContentWide]} showsVerticalScrollIndicator={false}>
        <View style={styles.liveTopline}>
          <View>
            <Text style={[styles.kicker, { color: colors.primary }]}>LIVE CONTROL ROOM</Text>
            <Text style={[styles.liveTitle, { color: colors.foreground }]}>{liveSnapshot.title}</Text>
          </View>
          <Pressable onPress={() => setMode("setup")} style={({ pressed }) => [styles.backButton, { borderColor: colors.border }, pressed && styles.pressed]}><IconSymbol name="xmark" color={colors.foreground} size={18} /></Pressable>
        </View>
        <View style={[styles.roomBanner, { backgroundColor: colors.primary }]}>
          <View><Text style={[styles.roomLabel, { color: `${colors.background}B8` }]}>ROOM CODE</Text><Text style={[styles.roomCode, { color: colors.background }]}>{liveSnapshot.code}</Text></View>
          <View style={styles.roomStats}><Text style={[styles.roomStatNumber, { color: colors.background }]}>{liveSnapshot.participants.length}</Text><Text style={[styles.roomStatLabel, { color: `${colors.background}B8` }]}>joined</Text></View>
        </View>
        <View style={[styles.liveStatusCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.liveStatusTop}>
            <View style={[styles.liveStatusDot, { backgroundColor: liveSnapshot.status === "complete" ? colors.muted : colors.success }]} />
            <Text style={[styles.liveStatusText, { color: colors.foreground }]}>{liveSnapshot.status === "complete" ? "Room complete" : activeQuestion ? `Question ${liveSnapshot.activeQuestionIndex + 1} is live` : "Room is ready"}</Text>
            {remainingSeconds !== null && <Text style={[styles.timer, { color: remainingSeconds < 6 ? colors.error : colors.primary }]}>{remainingSeconds}s</Text>}
          </View>
          {activeQuestion ? <Text style={[styles.activePrompt, { color: colors.foreground }]}>{activeQuestion.prompt}</Text> : <Text style={[styles.waitingCopy, { color: colors.muted }]}>Start the first question when everyone is ready. Participants will see it instantly.</Text>}
          <View style={styles.controlRow}>
            {liveSnapshot.status !== "complete" && liveSnapshot.activeQuestionIndex < liveSnapshot.questions.length - 1 && <Pressable onPress={() => start(liveSnapshot.activeQuestionIndex + 1)} disabled={startQuestion.isPending} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, flex: 1 }, pressed && styles.pressed]}><IconSymbol name="play.fill" color={colors.background} size={16} /><Text style={[styles.primaryButtonText, { color: colors.background }]}>{liveSnapshot.activeQuestionIndex < 0 ? "Start question 1" : "Start next question"}</Text></Pressable>}
            {liveSnapshot.status !== "complete" && <Pressable onPress={finish} style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.border, backgroundColor: colors.background, flex: 0 }, pressed && styles.pressed]}><IconSymbol name="stop.fill" color={colors.error} size={16} /><Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>Finish</Text></Pressable>}
          </View>
        </View>
        <View style={styles.sectionRow}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Live ranking</Text><Text style={[styles.sectionMeta, { color: colors.muted }]}>updates every second</Text></View>
        <View style={[styles.rankingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {liveSnapshot.ranking.length === 0 ? <Text style={[styles.emptyText, { color: colors.muted }]}>Waiting for the first participant to join.</Text> : liveSnapshot.ranking.slice(0, 5).map((participant: Snapshot["ranking"][number]) => <View key={participant.id} style={styles.rankRow}><Text style={[styles.rankNumber, { color: participant.rank === 1 ? colors.warning : colors.muted }]}>{String(participant.rank).padStart(2, "0")}</Text><View style={styles.rankNameWrap}><Text style={[styles.rankName, { color: colors.foreground }]}>{participant.displayName}</Text><Text style={[styles.rankMeta, { color: colors.muted }]}>{participant.correctCount} correct</Text></View><Text style={[styles.rankScore, { color: colors.primary }]}>{(participant.score ?? 0).toLocaleString()}</Text></View>)}
        </View>
        <View style={styles.sectionRow}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Question report</Text><Text style={[styles.sectionMeta, { color: colors.muted }]}>accuracy</Text></View>
        <View style={[styles.rankingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {liveSnapshot.reports.map((report: Snapshot["reports"][number]) => <View key={report.questionId} style={styles.reportRow}><View style={styles.reportTop}><Text numberOfLines={1} style={[styles.reportPrompt, { color: colors.foreground }]}>{report.position}. {report.prompt}</Text><Text style={[styles.reportPercent, { color: report.accuracy >= 70 ? colors.success : colors.warning }]}>{report.accuracy}%</Text></View><View style={[styles.progressTrack, { backgroundColor: colors.border }]}><View style={[styles.progressFill, { width: `${report.accuracy}%`, backgroundColor: report.accuracy >= 70 ? colors.success : colors.warning }]} /></View><Text style={[styles.reportMeta, { color: colors.muted }]}>{report.correctAnswers} of {report.totalAnswers} answers correct</Text></View>)}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  setupContent: { paddingTop: 18, paddingBottom: 32, gap: 14 },
  setupContentWide: { width: "100%", maxWidth: 1080, alignSelf: "center", paddingHorizontal: 24, paddingTop: 30, gap: 16 },
  setupHeader: { gap: 14, paddingBottom: 4 },
  backButton: { width: 38, height: 38, borderRadius: 13, borderWidth: 1, borderColor: "#E6E8F0", alignItems: "center", justifyContent: "center" },
  headerCopy: { gap: 6 },
  kicker: { fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
  title: { fontSize: 34, lineHeight: 40, fontWeight: "900", letterSpacing: -1.2 },
  subtitle: { fontSize: 15, lineHeight: 22 },
  stepPill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  stepPillText: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  titleInput: { borderWidth: 1, borderRadius: 14, minHeight: 52, paddingHorizontal: 15, fontSize: 15, fontWeight: "700" },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 8 },
  sectionTitle: { fontSize: 19, fontWeight: "900" },
  sectionMeta: { fontSize: 12, fontWeight: "700" },
  questionEditor: { borderRadius: 20, borderWidth: 1, padding: 15, gap: 12 },
  questionEditorTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  typeSelector: { flexDirection: "row", gap: 7 },
  typePill: { flex: 1, minHeight: 36, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  typePillText: { fontSize: 11, fontWeight: "800" },
  numberBadge: { width: 34, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  numberBadgeText: { fontSize: 12, fontWeight: "900" },
  editorLabel: { flex: 1, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  timeInput: { width: 42, borderBottomWidth: 1, paddingVertical: 3, textAlign: "center", fontSize: 13, fontWeight: "800" },
  seconds: { fontSize: 11 },
  promptInput: { minHeight: 58, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingTop: 11, fontSize: 15, lineHeight: 20 },
  optionGrid: { gap: 8 },
  optionChip: { minHeight: 42, borderWidth: 1, borderRadius: 12, flexDirection: "row", alignItems: "center", paddingHorizontal: 10, gap: 9 },
  optionLetter: { fontSize: 11, fontWeight: "900", width: 17 },
  optionText: { flex: 1, fontSize: 13, paddingVertical: 0 },
  iconButton: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  addOptionButton: { minHeight: 38, borderWidth: 1, borderStyle: "dashed", borderRadius: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  addOptionText: { fontSize: 12, fontWeight: "800" },
  fillAnswerInput: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 14 },
  setupFooter: { gap: 10, paddingTop: 2 },
  actionButtonsRow: { flexDirection: "row", gap: 10 },
  savedDraftText: { fontSize: 12, lineHeight: 17, fontWeight: "700" },
  secondaryButton: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  secondaryButtonText: { fontSize: 13, fontWeight: "800" },
  primaryButton: { minHeight: 48, borderRadius: 13, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  primaryButtonText: { fontSize: 13, fontWeight: "900" },
  errorText: { fontSize: 12, lineHeight: 17 },
  liveContent: { paddingTop: 18, paddingBottom: 32, gap: 16 },
  liveContentWide: { width: "100%", maxWidth: 1080, alignSelf: "center", paddingHorizontal: 24, paddingTop: 30, gap: 18 },
  liveTopline: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  liveTitle: { fontSize: 25, fontWeight: "900", marginTop: 4, maxWidth: 280 },
  roomBanner: { minHeight: 92, borderRadius: 20, padding: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  roomLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  roomCode: { fontSize: 29, fontWeight: "900", letterSpacing: 3, marginTop: 3 },
  roomStats: { alignItems: "flex-end" },
  roomStatNumber: { fontSize: 28, fontWeight: "900" },
  roomStatLabel: { fontSize: 11, fontWeight: "700" },
  liveStatusCard: { borderRadius: 20, borderWidth: 1, padding: 17, gap: 14 },
  liveStatusTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveStatusDot: { width: 9, height: 9, borderRadius: 5 },
  liveStatusText: { flex: 1, fontSize: 13, fontWeight: "800" },
  timer: { fontSize: 18, fontWeight: "900" },
  activePrompt: { fontSize: 20, lineHeight: 27, fontWeight: "800" },
  waitingCopy: { fontSize: 14, lineHeight: 21 },
  controlRow: { flexDirection: "row", gap: 9 },
  rankingCard: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 15, paddingVertical: 5 },
  emptyText: { fontSize: 13, paddingVertical: 18, textAlign: "center" },
  rankRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#E6E8F022" },
  rankNumber: { width: 24, fontSize: 12, fontWeight: "900" },
  rankNameWrap: { flex: 1, gap: 2 },
  rankName: { fontSize: 14, fontWeight: "800" },
  rankMeta: { fontSize: 11 },
  rankScore: { fontSize: 14, fontWeight: "900" },
  reportRow: { gap: 7, paddingVertical: 12 },
  reportTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  reportPrompt: { flex: 1, fontSize: 13, fontWeight: "700" },
  reportPercent: { fontSize: 14, fontWeight: "900" },
  progressTrack: { height: 7, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: 7, borderRadius: 4 },
  reportMeta: { fontSize: 11 },
  authLoadingText: { marginTop: 12, fontSize: 13, fontWeight: "700" },
  authGate: { flex: 1, alignItems: "center", justifyContent: "center", gap: 13, paddingBottom: 60 },
  authGateIcon: { width: 72, height: 72, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  authGateKicker: { fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
  authGateTitle: { fontSize: 31, lineHeight: 37, fontWeight: "900", textAlign: "center", letterSpacing: -1 },
  authGateCopy: { maxWidth: 320, fontSize: 14, lineHeight: 21, textAlign: "center", marginBottom: 10 },
  backToArena: { fontSize: 13, fontWeight: "800", padding: 8 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
