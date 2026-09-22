import { describe, expect, it } from "vitest";
import { appRouter } from "../server/routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "../server/_core/context";

process.env.DATABASE_URL = "";

type CookieCall = {
  name: string;
  options: Record<string, unknown>;
};

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(role: "user" | "admin" = "user"): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];
  const user: AuthenticatedUser = {
    id: role === "admin" ? 99 : 1,
    openId: role === "admin" ? "sample-admin" : "sample-user",
    email: role === "admin" ? "admin@example.com" : "sample@example.com",
    name: role === "admin" ? "Sample Admin" : "Sample User",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      hostname: "app.example.com",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({
      maxAge: -1,
      secure: true,
      sameSite: "none",
      httpOnly: true,
      path: "/",
    });
  });
});

describe("admin room controls", () => {
  const roomInput = {
    title: "Protected room",
    questions: [{ prompt: "Pick A", options: JSON.stringify(["A", "B"]), correctOption: 0, timeLimitSeconds: 20 }],
  };

  it("rejects regular users from creating rooms", async () => {
    const caller = appRouter.createCaller(createAuthContext("user").ctx);
    await expect(caller.exam.create(roomInput)).rejects.toThrow("You do not have required permission");
  });

  it("allows admins to create rooms", async () => {
    const caller = appRouter.createCaller(createAuthContext("admin").ctx);
    const room = await caller.exam.create(roomInput);
    expect(room?.title).toBe("Protected room");
    expect(room?.status).toBe("draft");
  });

  it("redacts future questions and correct answers from participants", async () => {
    const adminCaller = appRouter.createCaller(createAuthContext("admin").ctx);
    const participantCaller = appRouter.createCaller(createAuthContext("user").ctx);
    const room = await adminCaller.exam.create({
      title: "Private answers",
      questions: [
        { prompt: "First", options: JSON.stringify(["A", "B"]), correctOption: 0, timeLimitSeconds: 20 },
        { prompt: "Second", options: JSON.stringify(["C", "D"]), correctOption: 1, timeLimitSeconds: 20 },
      ],
    });
    await adminCaller.exam.startQuestion({ examId: room!.id, questionIndex: 0 });

    const visible = await participantCaller.exam.byCode({ code: room!.code });
    expect(visible?.questionCount).toBe(2);
    expect(visible?.questions).toHaveLength(1);
    expect(visible?.questions[0]?.prompt).toBe("First");
    expect("correctOption" in (visible?.questions[0] ?? {})).toBe(false);
    expect("correctAnswer" in (visible?.questions[0] ?? {})).toBe(false);
    expect("acceptedAnswers" in (visible?.questions[0] ?? {})).toBe(false);
  });
});
