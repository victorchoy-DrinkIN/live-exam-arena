import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type JoinState = "entry" | "waiting" | "question" | "results";
type Participant = { id: number; displayName: string; score: number; correctCount: number; rank: number };
type Question = { id: number; questionType: "multiple_choice" | "fill_blank"; prompt: string; options: string; position: number; timeLimitSeconds: number };
type Snapshot = { id: number; code: string; title: string; status: "draft" | "live" | "complete"; activeQuestionIndex: number; currentQuestionStartedAt: string | Date | null; currentQuestionEndsAt: string | Date | null; questions: Question[]; questionCount?: number; currentQuestionNumber?: number | null; ranking: Participant[] };

function getOptions(question: Question | null) {
  if (!question) return [];
  try {
    const parsed = JSON.parse(question.options);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return question.options.split("|").map((option) => option.trim()).filter(Boolean);
  }
}

export default function JoinScreen() {
  const router = useRouter();
  const colors = useColors();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const [state, setState] = useState<JoinState>("entry");
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [room, setRoom] = useState<Snapshot | null>(null);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [responseText, setResponseText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [now, setNow] = useState(Date.now());
  const activeQuestionIdRef = useRef<number | null>(null);

  const roomQuery = trpc.exam.byCode.useQuery({ code: code.trim().toUpperCase() || "NONE" }, { enabled: state !== "entry" && Boolean(code), refetchInterval: 1000 });
  const joinMutation = trpc.exam.join.useMutation();
  const answerMutation = trpc.exam.answer.useMutation();

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!roomQuery.data) return;
    const nextRoom = roomQuery.data as Snapshot;
    setRoom(nextRoom);
    if (nextRoom.status === "complete") setState("results");
    else if (nextRoom.activeQuestionIndex >= 0 && !submitted) setState("question");
  }, [roomQuery.data, submitted]);

  const currentQuestion = room && room.activeQuestionIndex >= 0 ? room.questions[room.activeQuestionIndex] : null;
  const options = useMemo(() => getOptions(currentQuestion), [currentQuestion]);
  const remainingSeconds = currentQuestion && room?.currentQuestionEndsAt ? Math.max(0, Math.ceil((new Date(room.currentQuestionEndsAt).getTime() - now) / 1000)) : null;
  const isExpired = remainingSeconds !== null && remainingSeconds <= 0;
  const myRank = room?.ranking.find((entry) => entry.id === participant?.id);

  useEffect(() => {
    if (!currentQuestion) return;
    if (activeQuestionIdRef.current === currentQuestion.id) return;
    activeQuestionIdRef.current = currentQuestion.id;
    setSelectedOption(null);
    setResponseText("");
    setSubmitted(false);
    setState("question");
  }, [currentQuestion]);

  const joinRoom = async () => {
    if (!code.trim() || !displayName.trim()) return;
    const foundRoom = await roomQuery.refetch();
    const exam = foundRoom.data as Snapshot | undefined;
    if (!exam) return;
    const result = await joinMutation.mutateAsync({ examId: exam.id, displayName: displayName.trim() });
    if (!result) return;
    setRoom(result.snapshot as Snapshot);
    setParticipant({ ...(result.participant as Omit<Participant, "rank">), rank: 0 });
    setState((result.snapshot as Snapshot).status === "live" ? "question" : "waiting");
  };

  const submitAnswer = async (optionIndex: number | null, textAnswer?: string) => {
    if (!room || !participant || !currentQuestion || submitted || isExpired) return;
    setSelectedOption(optionIndex);
    setSubmitted(true);
    try {
      const next = await answerMutation.mutateAsync({ examId: room.id, participantId: participant.id, questionId: currentQuestion.id, selectedOption: optionIndex, responseText: textAnswer ?? null, responseMs: Math.max(0, Date.now() - new Date(room.currentQuestionStartedAt ?? Date.now()).getTime()) });
      setRoom(next as Snapshot);
    } catch {
      setSubmitted(false);
    }
  };

  const leave = () => {
    setState("entry");
    setRoom(null);
    setParticipant(null);
    setSelectedOption(null);
    setResponseText("");
    setSubmitted(false);
  };

  if (state === "entry") {
    return (
      <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={[styles.entryContent, isWide && styles.entryContentWide]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Pressable onPress={() => router.push("/")} style={({ pressed }) => [styles.backButton, { borderColor: colors.border }, pressed && styles.pressed]}><IconSymbol name="arrow.left" color={colors.foreground} size={20} /></Pressable>
            <View style={styles.entryHeader}><Text style={[styles.kicker, { color: colors.primary }]}>PARTICIPANT MODE</Text><Text style={[styles.title, { color: colors.foreground }]}>Find your room.</Text><Text style={[styles.subtitle, { color: colors.muted }]}>Enter the code from your host. Once the room starts, everyone sees the same clock.</Text></View>
            <View style={[styles.entryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.inputLabel, { color: colors.muted }]}>ROOM CODE</Text>
              <TextInput value={code} onChangeText={(value) => setCode(value.toUpperCase())} autoCapitalize="characters" maxLength={12} placeholder="LIVE1234" placeholderTextColor={colors.muted} style={[styles.codeInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} />
              <Text style={[styles.inputLabel, { color: colors.muted }]}>YOUR NAME</Text>
              <TextInput value={displayName} onChangeText={setDisplayName} maxLength={30} placeholder="How should we call you?" placeholderTextColor={colors.muted} style={[styles.nameInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} />
              <Pressable disabled={joinMutation.isPending || roomQuery.isFetching} onPress={joinRoom} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary }, pressed && styles.pressed]}>{joinMutation.isPending || roomQuery.isFetching ? <ActivityIndicator color={colors.background} /> : <><IconSymbol name="arrow.right" color={colors.background} size={18} /><Text style={[styles.primaryButtonText, { color: colors.background }]}>Enter the room</Text></>}</Pressable>
              {(roomQuery.error || joinMutation.error) && <Text style={[styles.errorText, { color: colors.error }]}>We couldn’t find that room. Check the code and try again.</Text>}
            </View>
            <View style={styles.tipRow}><IconSymbol name="bolt.fill" color={colors.warning} size={18} /><Text style={[styles.tipText, { color: colors.muted }]}>Speed matters, but accuracy is worth more.</Text></View>
          </ScrollView>
        </KeyboardAvoidingView>
      </ScreenContainer>
    );
  }

  if (!room || !participant) return <ScreenContainer className="items-center justify-center"><ActivityIndicator color={colors.primary} /></ScreenContainer>;

  if (state === "waiting") {
    return (
      <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
        <ScrollView contentContainerStyle={[styles.waitingContent, isWide && styles.centeredContentWide]} showsVerticalScrollIndicator={false}>
          <View style={styles.waitingTop}><View style={[styles.livePill, { backgroundColor: `${colors.success}18` }]}><View style={[styles.liveDot, { backgroundColor: colors.success }]} /><Text style={[styles.livePillText, { color: colors.success }]}>CONNECTED</Text></View><Pressable onPress={leave}><Text style={[styles.leaveText, { color: colors.muted }]}>Leave</Text></Pressable></View>
          <View style={styles.waitingHero}><View style={[styles.waitingIcon, { backgroundColor: `${colors.primary}18` }]}><IconSymbol name="clock.fill" color={colors.primary} size={30} /></View><Text style={[styles.waitingTitle, { color: colors.foreground }]}>You’re in, {participant.displayName}.</Text><Text style={[styles.waitingCopy, { color: colors.muted }]}>Waiting for the host to start the first question. Keep this screen open.</Text></View>
          <View style={[styles.waitingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.inputLabel, { color: colors.muted }]}>ROOM</Text><Text style={[styles.waitingRoomTitle, { color: colors.foreground }]}>{room.title}</Text><View style={styles.waitingStatRow}><View><Text style={[styles.waitingStatNumber, { color: colors.primary }]}>{room.ranking.length}</Text><Text style={[styles.waitingStatLabel, { color: colors.muted }]}>players joined</Text></View><View><Text style={[styles.waitingStatNumber, { color: colors.primary }]}>{room.questionCount ?? room.questions.length}</Text><Text style={[styles.waitingStatLabel, { color: colors.muted }]}>questions</Text></View><View><Text style={[styles.waitingStatNumber, { color: colors.primary }]}>LIVE</Text><Text style={[styles.waitingStatLabel, { color: colors.muted }]}>status</Text></View></View></View>
        </ScrollView>
      </ScreenContainer>
    );
  }

  if (state === "results") {
    return (
      <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
        <ScrollView contentContainerStyle={[styles.resultsContent, isWide && styles.centeredContentWide]} showsVerticalScrollIndicator={false}>
          <View style={[styles.resultBadge, { backgroundColor: `${colors.warning}20` }]}><IconSymbol name="trophy.fill" color={colors.warning} size={24} /></View><Text style={[styles.waitingTitle, { color: colors.foreground }]}>That’s a wrap.</Text><Text style={[styles.waitingCopy, { color: colors.muted }]}>{room.title} has ended. Here’s how you landed.</Text>
          <View style={[styles.scoreCard, { backgroundColor: colors.primary }]}><Text style={[styles.scoreLabel, { color: `${colors.background}B8` }]}>YOUR FINAL SCORE</Text><Text style={[styles.scoreNumber, { color: colors.background }]}>{myRank?.score ?? participant.score}</Text><View style={styles.scoreBottom}><Text style={[styles.scoreDetail, { color: colors.background }]}>{myRank?.correctCount ?? participant.correctCount} correct</Text><Text style={[styles.scoreDetail, { color: colors.background }]}>Rank #{myRank?.rank ?? "—"}</Text></View></View>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Top of the room</Text>
          <View style={[styles.rankingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>{room.ranking.slice(0, 5).map((entry) => <View key={entry.id} style={styles.rankRow}><Text style={[styles.rankNumber, { color: entry.rank === 1 ? colors.warning : colors.muted }]}>{String(entry.rank).padStart(2, "0")}</Text><Text style={[styles.rankName, { color: colors.foreground, flex: 1 }]}>{entry.displayName}</Text><Text style={[styles.rankScore, { color: colors.primary }]}>{entry.score.toLocaleString()}</Text></View>)}</View>
          <Pressable onPress={leave} style={({ pressed }) => [styles.secondaryButton, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && styles.pressed]}><Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>Join another room</Text></Pressable>
        </ScrollView>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={[styles.questionContent, isWide && styles.centeredContentWide]} showsVerticalScrollIndicator={false}>
        <View style={styles.questionTop}><View><Text style={[styles.kicker, { color: colors.primary }]}>{room.title.toUpperCase()}</Text><Text style={[styles.questionCount, { color: colors.foreground }]}>Question {room.currentQuestionNumber ?? room.activeQuestionIndex + 1} <Text style={{ color: colors.muted }}>/ {room.questionCount ?? room.questions.length}</Text></Text></View><View style={[styles.timerPill, { borderColor: remainingSeconds !== null && remainingSeconds < 6 ? colors.error : colors.primary }]}><IconSymbol name="clock.fill" color={remainingSeconds !== null && remainingSeconds < 6 ? colors.error : colors.primary} size={15} /><Text style={[styles.timerText, { color: remainingSeconds !== null && remainingSeconds < 6 ? colors.error : colors.primary }]}>{remainingSeconds ?? "—"}s</Text></View></View>
        <View style={[styles.questionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.questionPrompt, { color: colors.foreground }]}>{currentQuestion?.prompt}</Text><Text style={[styles.questionHint, { color: colors.muted }]}>{submitted ? "Answer locked. Nice work — watch the room." : currentQuestion?.questionType === "fill_blank" ? "Type your answer, then submit once." : "Choose one answer before the clock hits zero."}</Text></View>
        {currentQuestion?.questionType === "fill_blank" ? <View style={styles.fillAnswerPanel}><TextInput editable={!submitted && !isExpired} value={responseText} onChangeText={setResponseText} placeholder="Type your answer" placeholderTextColor={colors.muted} style={[styles.participantFillInput, { color: colors.foreground, backgroundColor: colors.surface, borderColor: colors.border }]} /><Pressable disabled={!responseText.trim() || submitted || isExpired} onPress={() => submitAnswer(null, responseText)} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: !responseText.trim() || submitted || isExpired ? 0.45 : 1 }, pressed && styles.pressed]}><Text style={[styles.primaryButtonText, { color: colors.background }]}>{submitted ? "Answer submitted" : "Submit answer"}</Text><IconSymbol name="arrow.right" color={colors.background} size={18} /></Pressable></View> : <View style={styles.answerList}>{options.map((option, index) => <Pressable key={`${currentQuestion?.id}-${index}`} disabled={submitted || isExpired} onPress={() => submitAnswer(index)} style={({ pressed }) => [styles.answerRow, { backgroundColor: selectedOption === index ? `${colors.primary}18` : colors.surface, borderColor: selectedOption === index ? colors.primary : colors.border }, pressed && styles.pressed]}><View style={[styles.answerLetter, { backgroundColor: selectedOption === index ? colors.primary : colors.background }]}><Text style={[styles.answerLetterText, { color: selectedOption === index ? colors.background : colors.muted }]}>{String.fromCharCode(65 + index)}</Text></View><Text style={[styles.answerText, { color: colors.foreground }]}>{option}</Text>{selectedOption === index && <IconSymbol name="checkmark.circle.fill" color={colors.success} size={20} />}</Pressable>)}</View>}
        {answerMutation.error && <Text style={[styles.errorText, { color: colors.error }]}>That answer window has closed.</Text>}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  entryContent: { paddingTop: 18, paddingBottom: 32, gap: 20 },
  entryContentWide: { width: "100%", maxWidth: 640, alignSelf: "center", paddingTop: 34, paddingHorizontal: 12 },
  centeredContentWide: { width: "100%", maxWidth: 760, alignSelf: "center", paddingHorizontal: 12, paddingTop: 28 },
  backButton: { width: 38, height: 38, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  entryHeader: { gap: 7, paddingTop: 9 },
  kicker: { fontSize: 11, fontWeight: "900", letterSpacing: 1.4 },
  title: { fontSize: 36, lineHeight: 42, fontWeight: "900", letterSpacing: -1.3 },
  subtitle: { fontSize: 15, lineHeight: 23, maxWidth: 340 },
  entryCard: { borderRadius: 22, borderWidth: 1, padding: 16, gap: 10 },
  inputLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginTop: 3 },
  codeInput: { height: 57, borderWidth: 1, borderRadius: 14, paddingHorizontal: 15, fontSize: 23, fontWeight: "900", letterSpacing: 2.5 },
  nameInput: { height: 52, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, fontSize: 15 },
  primaryButton: { minHeight: 49, borderRadius: 14, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9, marginTop: 6 },
  primaryButtonText: { fontSize: 14, fontWeight: "900" },
  errorText: { fontSize: 12, lineHeight: 17 },
  tipRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 5 },
  tipText: { fontSize: 12, fontWeight: "700" },
  waitingContent: { paddingTop: 18, paddingBottom: 32, gap: 26 },
  waitingTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  livePill: { borderRadius: 8, paddingVertical: 6, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  livePillText: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  leaveText: { fontSize: 12, fontWeight: "800" },
  waitingHero: { alignItems: "center", gap: 10, paddingTop: 28 },
  waitingIcon: { width: 70, height: 70, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  waitingTitle: { fontSize: 28, lineHeight: 34, fontWeight: "900", letterSpacing: -0.9, textAlign: "center" },
  waitingCopy: { fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 330 },
  waitingCard: { borderRadius: 20, borderWidth: 1, padding: 17, gap: 10 },
  waitingRoomTitle: { fontSize: 18, fontWeight: "800" },
  waitingStatRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: 12 },
  waitingStatNumber: { fontSize: 20, fontWeight: "900" },
  waitingStatLabel: { fontSize: 11, marginTop: 2 },
  questionContent: { paddingTop: 18, paddingBottom: 32, gap: 18 },
  questionTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  questionCount: { fontSize: 21, fontWeight: "900", marginTop: 4 },
  timerPill: { borderWidth: 1, borderRadius: 13, paddingVertical: 9, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 6 },
  timerText: { fontSize: 14, fontWeight: "900" },
  questionCard: { borderWidth: 1, borderRadius: 22, padding: 20, gap: 14, minHeight: 172, justifyContent: "center" },
  questionPrompt: { fontSize: 23, lineHeight: 31, fontWeight: "900", letterSpacing: -0.5 },
  questionHint: { fontSize: 12, lineHeight: 18 },
  answerList: { gap: 10 },
  answerRow: { borderWidth: 1, borderRadius: 15, minHeight: 61, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 11 },
  answerLetter: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  answerLetterText: { fontSize: 12, fontWeight: "900" },
  answerText: { flex: 1, fontSize: 14, fontWeight: "700" },
  fillAnswerPanel: { gap: 10 },
  participantFillInput: { minHeight: 58, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, fontSize: 16 },
  resultsContent: { paddingTop: 26, paddingBottom: 32, gap: 16, alignItems: "center" },
  resultBadge: { width: 64, height: 64, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  scoreCard: { width: "100%", borderRadius: 22, padding: 20, gap: 7 },
  scoreLabel: { fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  scoreNumber: { fontSize: 43, fontWeight: "900", letterSpacing: -1.4 },
  scoreBottom: { flexDirection: "row", justifyContent: "space-between", paddingTop: 8 },
  scoreDetail: { fontSize: 12, fontWeight: "800" },
  sectionTitle: { width: "100%", fontSize: 19, fontWeight: "900", marginTop: 5 },
  rankingCard: { width: "100%", borderRadius: 18, borderWidth: 1, paddingHorizontal: 15, paddingVertical: 5 },
  rankRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#E6E8F022" },
  rankNumber: { width: 24, fontSize: 12, fontWeight: "900" },
  rankName: { fontSize: 14, fontWeight: "800" },
  rankScore: { fontSize: 14, fontWeight: "900" },
  secondaryButton: { width: "100%", minHeight: 49, borderWidth: 1, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  secondaryButtonText: { fontSize: 14, fontWeight: "900" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
