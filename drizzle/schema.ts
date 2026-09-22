import {
  boolean,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const liveExams = mysqlTable("live_exams", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 12 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["draft", "live", "complete"]).default("draft").notNull(),
  activeQuestionIndex: int("activeQuestionIndex").default(-1).notNull(),
  currentQuestionStartedAt: timestamp("currentQuestionStartedAt"),
  currentQuestionEndsAt: timestamp("currentQuestionEndsAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const examQuestions = mysqlTable("exam_questions", {
  id: int("id").autoincrement().primaryKey(),
  examId: int("examId").notNull(),
  position: int("position").notNull(),
  questionType: mysqlEnum("questionType", ["multiple_choice", "fill_blank"]).default("multiple_choice").notNull(),
  prompt: text("prompt").notNull(),
  options: text("options").notNull(),
  correctOption: int("correctOption"),
  correctAnswer: text("correctAnswer"),
  acceptedAnswers: text("acceptedAnswers"),
  points: int("points").default(5).notNull(),
  timeLimitSeconds: int("timeLimitSeconds").default(30).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const examParticipants = mysqlTable(
  "exam_participants",
  {
    id: int("id").autoincrement().primaryKey(),
    examId: int("examId").notNull(),
    displayName: varchar("displayName", { length: 80 }).notNull(),
    score: int("score").default(0).notNull(),
    correctCount: int("correctCount").default(0).notNull(),
    joinedAt: timestamp("joinedAt").defaultNow().notNull(),
    lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  },
  (table) => ({
    examParticipantNameIdx: uniqueIndex("exam_participant_name_idx").on(table.examId, table.displayName),
  }),
);

export const examAnswers = mysqlTable("exam_answers", {
  id: int("id").autoincrement().primaryKey(),
  examId: int("examId").notNull(),
  questionId: int("questionId").notNull(),
  participantId: int("participantId").notNull(),
  selectedOption: int("selectedOption"),
  responseText: text("responseText"),
  isCorrect: boolean("isCorrect").default(false).notNull(),
  responseMs: int("responseMs"),
  answeredAt: timestamp("answeredAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type LiveExam = typeof liveExams.$inferSelect;
export type ExamQuestion = typeof examQuestions.$inferSelect;
export type ExamParticipant = typeof examParticipants.$inferSelect;
export type ExamAnswer = typeof examAnswers.$inferSelect;
export type InsertLiveExam = typeof liveExams.$inferInsert;
export type InsertExamQuestion = typeof examQuestions.$inferInsert;
export type InsertExamParticipant = typeof examParticipants.$inferInsert;
export type InsertExamAnswer = typeof examAnswers.$inferInsert;
