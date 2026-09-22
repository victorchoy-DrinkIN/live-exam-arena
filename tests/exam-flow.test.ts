import { beforeAll, describe, expect, it } from "vitest";

let createExam: typeof import("../server/db").createExam;
let joinExam: typeof import("../server/db").joinExam;
let startQuestion: typeof import("../server/db").startQuestion;
let answerQuestion: typeof import("../server/db").answerQuestion;
let completeExam: typeof import("../server/db").completeExam;

beforeAll(async () => {
  process.env.DATABASE_URL = "";
  const db = await import("../server/db");
  createExam = db.createExam;
  joinExam = db.joinExam;
  startQuestion = db.startQuestion;
  answerQuestion = db.answerQuestion;
  completeExam = db.completeExam;
});

describe("live exam lifecycle", () => {
  it("creates a room and lets participants join before the host starts", async () => {
    const room = await createExam("Science sprint", [
      { questionType: "multiple_choice", prompt: "2 + 2?", options: JSON.stringify(["3", "4"]), correctOption: 1, timeLimitSeconds: 20 },
    ]);
    expect(room?.status).toBe("draft");
    expect(room?.questions).toHaveLength(1);
    expect(room?.questions[0]?.points).toBe(5);

    const joined = await joinExam(room!.id, "Avery");
    expect(joined?.participant.displayName).toBe("Avery");
    expect(joined?.snapshot?.participants).toHaveLength(1);
  });

  it("starts one authoritative window and awards speed-adjusted points", async () => {
    const room = await createExam("Speed round", [
      { questionType: "multiple_choice", prompt: "Pick A", options: JSON.stringify(["A", "B"]), correctOption: 0, points: 12, timeLimitSeconds: 20 },
    ]);
    const joined = await joinExam(room!.id, "Jordan");
    const started = await startQuestion(room!.id, 0);

    expect(started?.status).toBe("live");
    expect(started?.activeQuestionIndex).toBe(0);
    expect(started?.currentQuestionEndsAt).toBeTruthy();

    const answered = await answerQuestion(room!.id, joined!.participant.id, started!.questions[0].id, 0, null, 250);
    const jordan = answered?.ranking.find((entry) => entry.id === joined!.participant.id);
    expect(jordan?.correctCount).toBe(1);
    expect(jordan?.score).toBe(12);

    await expect(answerQuestion(room!.id, joined!.participant.id, started!.questions[0].id, 1, null, 500)).rejects.toThrow("Answer already submitted");
  });

  it("moves a room into the complete state", async () => {
    const room = await createExam("Finals", [
      { questionType: "multiple_choice", prompt: "Ready?", options: JSON.stringify(["Yes", "No"]), correctOption: 0, timeLimitSeconds: 10 },
    ]);
    const completed = await completeExam(room!.id);
    expect(completed?.status).toBe("complete");
  });

  it("rejects answers for a previous question after advancing", async () => {
    const room = await createExam("No going back", [
      { questionType: "multiple_choice", prompt: "First", options: JSON.stringify(["A", "B"]), correctOption: 0, timeLimitSeconds: 20 },
      { questionType: "multiple_choice", prompt: "Second", options: JSON.stringify(["C", "D"]), correctOption: 1, timeLimitSeconds: 20 },
    ]);
    const joined = await joinExam(room!.id, "Riley");
    const first = await startQuestion(room!.id, 0);
    await answerQuestion(room!.id, joined!.participant.id, first!.questions[0].id, 0, null, 400);
    const second = await startQuestion(room!.id, 1);

    expect(second?.activeQuestionIndex).toBe(1);
    await expect(answerQuestion(room!.id, joined!.participant.id, first!.questions[0].id, 1, null, 500)).rejects.toThrow("That question is not active");
  });

  it("scores a case-insensitive fill-in-the-blank answer", async () => {
    const room = await createExam("Fill blank", [
      { questionType: "fill_blank", prompt: "The largest ocean is the ___ Ocean.", options: JSON.stringify([]), correctOption: null, correctAnswer: "Pacific", acceptedAnswers: JSON.stringify(["Pacific", "Pacific Ocean"]), points: 5, timeLimitSeconds: 20 },
    ]);
    const joined = await joinExam(room!.id, "Morgan");
    const started = await startQuestion(room!.id, 0);
    const answered = await answerQuestion(room!.id, joined!.participant.id, started!.questions[0].id, null, " pacific ocean ", 600);
    const morgan = answered?.ranking.find((entry) => entry.id === joined!.participant.id);
    expect(morgan?.correctCount).toBe(1);
    expect(morgan?.score).toBe(5);
  });
});
