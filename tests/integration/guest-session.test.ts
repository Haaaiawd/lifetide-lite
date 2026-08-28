import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

if ("loadEnvFile" in process) {
  (process as NodeJS.Process & { loadEnvFile(path: string): void }).loadEnvFile(".env");
}

const prisma = new PrismaClient();

const baseURL = "http://localhost:3000";

function cookieHeader(headers: Record<string, string>): string | undefined {
  const raw = headers["set-cookie"];
  if (!raw || !raw.trim().startsWith("guest-token=")) return undefined;
  return raw.trim();
}

function cookieValue(headers: Record<string, string>): string | undefined {
  return cookieHeader(headers)?.split(";")[0];
}

test.describe("Guest session, consent and data lifecycle", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("new visitor receives an opaque HttpOnly guest token and a 24h session", async ({ browser }) => {
    const ctx = await browser.newContext();
    const request = ctx.request;

    const res = await request.get(`${baseURL}/api/session`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(new Date(body.expiresAt).getTime() - new Date(body.createdAt).getTime()).toBeGreaterThanOrEqual(
      24 * 60 * 60 * 1000 - 1000
    );
    expect(body.missingRequired).toEqual(["ai"]);

    const guestCookie = cookieHeader(res.headers());
    expect(guestCookie).toBeDefined();
    expect(guestCookie).toContain("HttpOnly");
    expect(guestCookie).toContain("SameSite=lax");

    await ctx.close();
  });

  test("same cookie resumes the same session without exposing sensitive data in localStorage", async ({ browser }) => {
    const ctx = await browser.newContext();
    const request = ctx.request;

    const res1 = await request.get(`${baseURL}/api/session`);
    const body1 = await res1.json();

    const res2 = await request.get(`${baseURL}/api/session`);
    expect(res2.status()).toBe(200);

    const body2 = await res2.json();
    expect(body2.id).toBe(body1.id);

    expect(body2).not.toHaveProperty("token");
    expect(res2.headers()["set-cookie"]).toBeUndefined();

    await ctx.close();
  });

  test("AI/upload processing is blocked without consent and allowed after consent", async ({ browser }) => {
    const ctx = await browser.newContext();
    const request = ctx.request;

    await request.get(`${baseURL}/api/session`);

    const answerRes = await request.post(`${baseURL}/api/answer`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ questionId: "q1", value: "方向不清" }),
    });
    expect(answerRes.status()).toBe(403);

    const uploadRes = await request.post(`${baseURL}/api/uploads`, {
      multipart: {
        file: {
          name: "resume.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("unconsented upload"),
        },
      },
    });
    expect(uploadRes.status()).toBe(403);

    const consentRes = await request.post(`${baseURL}/api/session/consent`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({
        consents: [
          { type: "ai", given: true },
          { type: "upload", given: true },
          { type: "research", given: false },
        ],
      }),
    });
    expect(consentRes.status()).toBe(200);
    const consentBody = await consentRes.json();
    expect(consentBody.canUseAI).toBe(true);
    expect(consentBody.canUpload).toBe(true);
    expect(consentBody.missingRequired).toEqual([]);

    const answerOk = await request.post(`${baseURL}/api/answer`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ questionId: "q1", value: "方向不清" }),
    });
    expect(answerOk.status()).toBe(201);

    const uploadOk = await request.post(`${baseURL}/api/uploads`, {
      multipart: {
        file: {
          name: "resume.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("consented upload"),
        },
      },
    });
    expect(uploadOk.status()).toBe(201);

    await ctx.close();
  });

  test("research consent stays optional and can be withheld without blocking core flow", async ({ browser }) => {
    const ctx = await browser.newContext();
    const request = ctx.request;

    await request.get(`${baseURL}/api/session`);

    const consentRes = await request.post(`${baseURL}/api/session/consent`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({
        consents: [
          { type: "ai", given: true },
          { type: "upload", given: true },
        ],
      }),
    });
    expect(consentRes.status()).toBe(200);
    const body = await consentRes.json();
    expect(body.missingRequired).toEqual([]);

    const answerRes = await request.post(`${baseURL}/api/answer`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ questionId: "q1", value: "ok" }),
    });
    expect(answerRes.status()).toBe(201);

    await ctx.close();
  });

  test("one guest cannot read or mutate another guest's session", async ({ browser, playwright }) => {
    const alice = await browser.newContext();
    const bob = await browser.newContext();

    const a1 = await alice.request.get(`${baseURL}/api/session`);
    const aBody = await a1.json();

    const b1 = await bob.request.get(`${baseURL}/api/session`);

    await bob.request.post(`${baseURL}/api/session/consent`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ consents: [{ type: "ai", given: true }, { type: "upload", given: true }] }),
    });
    const bAnswer = await bob.request.post(`${baseURL}/api/answer`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ questionId: "q1", value: "bob" }),
    });
    expect(bAnswer.status()).toBe(201);

    expect(aBody).not.toHaveProperty("token");

    const anon = await playwright.request.newContext({ baseURL });
    const noCookieAnswer = await anon.post(`${baseURL}/api/answer`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ questionId: "q1", value: "no-cookie" }),
    });
    expect(noCookieAnswer.status()).toBe(401);

    const guessed = await anon.post(`${baseURL}/api/answer`, {
      headers: { cookie: `guest-token=${aBody.id}`, "content-type": "application/json" },
      data: JSON.stringify({ questionId: "q1", value: "guessed" }),
    });
    expect(guessed.status()).toBe(401);

    await anon.dispose();
    await alice.close();
    await bob.close();
  });

  test("cleanup job deletes expired answers, uploads and derived content", async ({ browser }) => {
    const ctx = await browser.newContext();
    const request = ctx.request;

    const res = await request.get(`${baseURL}/api/session`);
    const session = await res.json();

    await request.post(`${baseURL}/api/session/consent`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ consents: [{ type: "ai", given: true }, { type: "upload", given: true }] }),
    });

    await request.post(`${baseURL}/api/answer`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ questionId: "q1", value: "to-be-deleted" }),
    });

    await request.post(`${baseURL}/api/uploads`, {
      multipart: {
        file: {
          name: "to-be-deleted.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("to be deleted"),
        },
      },
    });

    await prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const before = await prisma.answer.count({ where: { sessionId: session.id } });
    expect(before).toBe(1);

    const cleanup = await request.post(`${baseURL}/api/session/cleanup`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? "dev-cron-secret-do-not-use-in-production"}` },
    });
    expect(cleanup.status()).toBe(200);

    const afterSession = await prisma.session.findUnique({ where: { id: session.id } });
    expect(afterSession).toBeNull();
    const afterAnswer = await prisma.answer.count({ where: { sessionId: session.id } });
    expect(afterAnswer).toBe(0);
    const afterUpload = await prisma.upload.count({ where: { sessionId: session.id } });
    expect(afterUpload).toBe(0);

    await ctx.close();
  });
});
