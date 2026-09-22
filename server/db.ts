import { and, asc, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  examAnswers,
  examParticipants,
  examQuestions,
  liveExams,
  InsertExamAnswer,
  InsertExamQuestion,
  InsertLiveExam,
  InsertExamParticipant,
  InsertUser,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  values.lastSignedIn ??= new Date();
  updateSet.lastSignedIn ??= new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

type MemoryQuestion = InsertExamQuestion & { id: number };
type MemoryParticipant = InsertExamParticipant & { id: number };
type MemoryAnswer = InsertExamAnswer & { id: number };
type MemoryExam = Omit<InsertLiveExam, "id" | "status" | "activeQuestionIndex" | "currentQuestionStartedAt" | "currentQuestionEndsAt"> & {
  id: number;
  status: "draft" | "live" | "complete";
  activeQuestionIndex: number;
  currentQuestionStartedAt: Date | null;
  currentQuestionEndsAt: Date | null;
  questions: MemoryQuestion[];
  participants: MemoryParticipant[];
  answers: MemoryAnswer[];
};

let nextMemoryId = 1;
const memoryExams = new Map<number, MemoryExam>();

function makeMemoryCode() {
  return `LIVE${String(Date.now()).slice(-4)}`;
}

export type ExamSnapshot = {
  id: number;
  code: string;
  title: string;
  status: "draft" | "live" | "complete";
  activeQuestionIndex: number;
  currentQuestionStartedAt: Date | null;
  currentQuestionEndsAt: Date | null;
  questions: Array<MemoryQuestion>;
  participants: Array<MemoryParticipant>;
  ranking: Array<MemoryParticipant & { rank: number }>;
  reports: Array<{
    questionId: number;
    position: number;
    prompt: string;
    totalAnswers: number;
    correctAnswers: number;
    accuracy: number;
  }>;
};

function buildSnapshot(exam: MemoryExam): ExamSnapshot {
  const ranking = [...exam.participants]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.correctCount ?? 0) - (a.correctCount ?? 0) || a.joinedAt!.getTime() - b.joinedAt!.getTime())
    .map((participant, index) => ({ ...participant, rank: index + 1 }));
  const reports = exam.questions.map((question) => {
    const answers = exam.answers.filter((answer) => answer.questionId === question.id);
    const correctAnswers = answers.filter((answer) => answer.isCorrect).length;
    return {
      questionId: question.id,
      position: question.position,
      prompt: question.prompt,
      totalAnswers: answers.length,
      correctAnswers,
      accuracy: answers.length ? Math.round((correctAnswers / answers.length) * 100) : 0,
    };
  });
  return {
    id: exam.id,
    code: exam.code,
    title: exam.title,
    status: exam.status,
    activeQuestionIndex: exam.activeQuestionIndex,
    currentQuestionStartedAt: exam.currentQuestionStartedAt ?? null,
    currentQuestionEndsAt: exam.currentQuestionEndsAt ?? null,
    questions: exam.questions,
    participants: exam.participants,
    ranking,
    reports,
  };
}

export async function createExam(title: string, questionInputs: Array<Omit<InsertExamQuestion, "examId" | "id" | "position">>) {
  const db = await getDb();
  if (!db) {
    const examId = nextMemoryId++;
    const now = new Date();
    const exam: MemoryExam = {
      id: examId,
      code: makeMemoryCode(),
      title,
      status: "draft",
      activeQuestionIndex: -1,
      currentQuestionStartedAt: null,
      currentQuestionEndsAt: null,
      createdAt: now,
      updatedAt: now,
      questions: questionInputs.map((question, index) => ({ ...question, points: question.points ?? 5, id: nextMemoryId++, examId, position: index + 1 })),
      participants: [],
      answers: [],
    };
    memoryExams.set(examId, exam);
    return buildSnapshot(exam);
  }
  const code = `LIVE${String(Date.now()).slice(-6)}`;
  const result = await db.insert(liveExams).values({ code, title, status: "draft", activeQuestionIndex: -1 });
  const examId = Number(result[0].insertId);
  await db.insert(examQuestions).values(questionInputs.map((question, index) => ({ ...question, examId, position: index + 1 })));
  return getExamSnapshot(examId);
}

export async function getExamSnapshot(examId: number): Promise<ExamSnapshot | undefined> {
  const db = await getDb();
  if (!db) {
    const exam = memoryExams.get(examId);
    return exam ? buildSnapshot(exam) : undefined;
  }
  const exam = (await db.select().from(liveExams).where(eq(liveExams.id, examId)).limit(1))[0];
  if (!exam) return undefined;
  const [questions, participants, answers] = await Promise.all([
    db.select().from(examQuestions).where(eq(examQuestions.examId, examId)).orderBy(asc(examQuestions.position)),
    db.select().from(examParticipants).where(eq(examParticipants.examId, examId)).orderBy(desc(examParticipants.score)),
    db.select().from(examAnswers).where(eq(examAnswers.examId, examId)),
  ]);
  const ranking = participants.map((participant, index) => ({ ...participant, rank: index + 1 }));
  const reports = questions.map((question) => {
    const questionAnswers = answers.filter((answer) => answer.questionId === question.id);
    const correctAnswers = questionAnswers.filter((answer) => answer.isCorrect).length;
    return {
      questionId: question.id,
      position: question.position,
      prompt: question.prompt,
      totalAnswers: questionAnswers.length,
      correctAnswers,
      accuracy: questionAnswers.length ? Math.round((correctAnswers / questionAnswers.length) * 100) : 0,
    };
  });
  return {
    ...exam,
    questions,
    participants,
    ranking,
    reports,
  };
}

export async function getExamByCode(code: string) {
  const db = await getDb();
  if (!db) {
    const exam = [...memoryExams.values()].find((candidate) => candidate.code.toLowerCase() === code.toLowerCase());
    return exam ? buildSnapshot(exam) : undefined;
  }
  const exam = (await db.select().from(liveExams).where(eq(liveExams.code, code.toUpperCase())).limit(1))[0];
  return exam ? getExamSnapshot(exam.id) : undefined;
}

export async function joinExam(examId: number, displayName: string) {
  const normalizedName = displayName.trim().slice(0, 80);
  const db = await getDb();
  if (!db) {
    const exam = memoryExams.get(examId);
    if (!exam) return undefined;
    let participant = exam.participants.find((candidate) => candidate.displayName.toLowerCase() === normalizedName.toLowerCase());
    if (!participant) {
      participant = {
        id: nextMemoryId++,
        examId,
        displayName: normalizedName,
        score: 0,
        correctCount: 0,
        joinedAt: new Date(),
        lastSeenAt: new Date(),
      };
      exam.participants.push(participant);
    } else {
      participant.lastSeenAt = new Date();
    }
    return { participant, snapshot: buildSnapshot(exam) };
  }
  const existing = (await db.select().from(examParticipants).where(and(eq(examParticipants.examId, examId), eq(examParticipants.displayName, normalizedName))).limit(1))[0];
  if (existing) {
    await db.update(examParticipants).set({ lastSeenAt: new Date() }).where(eq(examParticipants.id, existing.id));
    return { participant: existing, snapshot: await getExamSnapshot(examId) };
  }
  const result = await db.insert(examParticipants).values({ examId, displayName: normalizedName });
  const participant = (await db.select().from(examParticipants).where(eq(examParticipants.id, Number(result[0].insertId))).limit(1))[0];
  return { participant, snapshot: await getExamSnapshot(examId) };
}

export async function startQuestion(examId: number, questionIndex: number) {
  const snapshot = await getExamSnapshot(examId);
  const question = snapshot?.questions[questionIndex];
  if (!snapshot || !question) return undefined;
  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + (question.timeLimitSeconds ?? 30) * 1000);
  const db = await getDb();
  if (!db) {
    const exam = memoryExams.get(examId);
    if (!exam) return undefined;
    exam.status = "live";
    exam.activeQuestionIndex = questionIndex;
    exam.currentQuestionStartedAt = startedAt;
    exam.currentQuestionEndsAt = endsAt;
    exam.updatedAt = startedAt;
    return buildSnapshot(exam);
  }
  await db.update(liveExams).set({ status: "live", activeQuestionIndex: questionIndex, currentQuestionStartedAt: startedAt, currentQuestionEndsAt: endsAt }).where(eq(liveExams.id, examId));
  return getExamSnapshot(examId);
}

export async function answerQuestion(examId: number, participantId: number, questionId: number, selectedOption: number | null, responseText: string | null, responseMs: number) {
  const snapshot = await getExamSnapshot(examId);
  if (!snapshot || snapshot.status !== "live") throw new Error("This room is not accepting answers");
  const question = snapshot.questions.find((candidate) => candidate.id === questionId);
  if (!question) throw new Error("Question not found");
  if (snapshot.currentQuestionEndsAt && Date.now() > snapshot.currentQuestionEndsAt.getTime()) throw new Error("Time is up");
  if (snapshot.questions[snapshot.activeQuestionIndex]?.id !== questionId) throw new Error("That question is not active");
  const normalizedResponse = responseText?.trim().toLocaleLowerCase() ?? "";
  let acceptedAnswers: string[] = [];
  if (question.acceptedAnswers) {
    try {
      const parsed = JSON.parse(question.acceptedAnswers);
      if (Array.isArray(parsed)) acceptedAnswers = parsed.map(String);
    } catch {
      acceptedAnswers = question.acceptedAnswers.split(/[,\n]/);
    }
  }
  if (!acceptedAnswers.length && question.correctAnswer) acceptedAnswers = [question.correctAnswer];
  const normalizedAcceptedAnswers = acceptedAnswers.map((answer) => answer.trim().toLocaleLowerCase()).filter(Boolean);
  if (question.questionType === "fill_blank" && !normalizedResponse) throw new Error("Answer is required");
  if (question.questionType !== "fill_blank" && selectedOption === null) throw new Error("Choose an option");
  const isCorrect = question.questionType === "fill_blank"
    ? Boolean(normalizedResponse && normalizedAcceptedAnswers.includes(normalizedResponse))
    : selectedOption !== null && selectedOption === question.correctOption;
  const points = isCorrect ? (question.points ?? 5) : 0;
  const db = await getDb();
  if (!db) {
    const exam = memoryExams.get(examId);
    if (!exam) throw new Error("Exam not found");
    if (exam.answers.some((answer) => answer.participantId === participantId && answer.questionId === questionId)) throw new Error("Answer already submitted");
    exam.answers.push({ id: nextMemoryId++, examId, questionId, participantId, selectedOption, responseText, isCorrect, responseMs, answeredAt: new Date() });
    const participant = exam.participants.find((candidate) => candidate.id === participantId);
    if (participant) {
      participant.score = (participant.score ?? 0) + points;
      participant.correctCount = (participant.correctCount ?? 0) + (isCorrect ? 1 : 0);
      participant.lastSeenAt = new Date();
    }
    return buildSnapshot(exam);
  }
  const previous = (await db.select().from(examAnswers).where(and(eq(examAnswers.participantId, participantId), eq(examAnswers.questionId, questionId))).limit(1))[0];
  if (previous) throw new Error("Answer already submitted");
  await db.insert(examAnswers).values({ examId, questionId, participantId, selectedOption, responseText, isCorrect, responseMs });
  await db.update(examParticipants).set({ score: sql`${examParticipants.score} + ${points}`, correctCount: sql`${examParticipants.correctCount} + ${isCorrect ? 1 : 0}`, lastSeenAt: new Date() }).where(eq(examParticipants.id, participantId));
  return getExamSnapshot(examId);
}

export async function completeExam(examId: number) {
  const db = await getDb();
  if (!db) {
    const exam = memoryExams.get(examId);
    if (!exam) return undefined;
    exam.status = "complete";
    exam.currentQuestionEndsAt = new Date();
    return buildSnapshot(exam);
  }
  await db.update(liveExams).set({ status: "complete", currentQuestionEndsAt: new Date() }).where(eq(liveExams.id, examId));
  return getExamSnapshot(examId);
}
