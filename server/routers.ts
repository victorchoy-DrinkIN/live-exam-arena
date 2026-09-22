import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import * as db from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";

const questionInput = z.object({
  questionType: z.enum(["multiple_choice", "fill_blank"]).default("multiple_choice"),
  prompt: z.string().min(1).max(2000),
  options: z.string().default("[]"),
  correctOption: z.number().int().min(0).max(7).nullable().optional(),
  correctAnswer: z.string().max(500).nullable().optional(),
  acceptedAnswers: z.string().max(4000).nullable().optional(),
  points: z.number().int().min(1).max(1000).default(5),
  timeLimitSeconds: z.number().int().min(5).max(180),
}).superRefine((question, context) => {
  if (question.questionType === "multiple_choice" && question.correctOption === null || question.questionType === "multiple_choice" && question.correctOption === undefined) {
    context.addIssue({ code: "custom", path: ["correctOption"], message: "Choose the correct option" });
  }
  let hasAcceptedAnswer = Boolean(question.correctAnswer?.trim());
  if (!hasAcceptedAnswer && question.acceptedAnswers?.trim()) {
    try {
      const parsed = JSON.parse(question.acceptedAnswers);
      hasAcceptedAnswer = Array.isArray(parsed) && parsed.some((answer) => String(answer).trim().length > 0);
    } catch {
      hasAcceptedAnswer = question.acceptedAnswers.split(/[,\n]/).some((answer) => answer.trim().length > 0);
    }
  }
  if (question.questionType === "fill_blank" && !hasAcceptedAnswer) {
    context.addIssue({ code: "custom", path: ["acceptedAnswers"], message: "Enter at least one accepted answer" });
  }
});

function redactSnapshot(snapshot: Awaited<ReturnType<typeof db.getExamByCode>>) {
  if (!snapshot) return undefined;
  const activeQuestion = snapshot.status === "live" && snapshot.activeQuestionIndex >= 0
    ? snapshot.questions[snapshot.activeQuestionIndex]
    : undefined;
  const visibleQuestions = activeQuestion
    ? [(({ correctOption: _correctOption, correctAnswer: _correctAnswer, acceptedAnswers: _acceptedAnswers, ...question }) => question)(activeQuestion)]
    : [];
  return {
    ...snapshot,
    activeQuestionIndex: activeQuestion ? 0 : -1,
    questions: visibleQuestions,
    questionCount: snapshot.questions.length,
    currentQuestionNumber: activeQuestion?.position ?? null,
    reports: [],
  };
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  exam: router({
    byCode: publicProcedure.input(z.object({ code: z.string().min(4).max(12) })).query(async ({ input }) => redactSnapshot(await db.getExamByCode(input.code))),
    adminByCode: adminProcedure.input(z.object({ code: z.string().min(4).max(12) })).query(({ input }) => db.getExamByCode(input.code)),
    create: adminProcedure
      .input(
        z.object({
          title: z.string().min(1).max(255),
          questions: z.array(questionInput).min(1).max(50),
        }),
      )
      .mutation(({ input }) => db.createExam(input.title, input.questions)),
    join: publicProcedure
      .input(z.object({ examId: z.number().int(), displayName: z.string().min(2).max(80) }))
      .mutation(async ({ input }) => {
        const result = await db.joinExam(input.examId, input.displayName);
        return result ? { ...result, snapshot: redactSnapshot(result.snapshot) } : result;
      }),
    startQuestion: adminProcedure
      .input(z.object({ examId: z.number().int(), questionIndex: z.number().int().min(0) }))
      .mutation(({ input }) => db.startQuestion(input.examId, input.questionIndex)),
    answer: publicProcedure
      .input(
        z.object({
          examId: z.number().int(),
          participantId: z.number().int(),
          questionId: z.number().int(),
          selectedOption: z.number().int().min(0).max(7).nullable().optional(),
          responseText: z.string().max(500).nullable().optional(),
          responseMs: z.number().int().min(0).max(180000),
        }),
      )
      .mutation(async ({ input }) => redactSnapshot(await db.answerQuestion(input.examId, input.participantId, input.questionId, input.selectedOption ?? null, input.responseText ?? null, input.responseMs))),
    complete: adminProcedure.input(z.object({ examId: z.number().int() })).mutation(({ input }) => db.completeExam(input.examId)),
  }),
});

export type AppRouter = typeof appRouter;
