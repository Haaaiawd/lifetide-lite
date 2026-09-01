import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

if ("loadEnvFile" in process) {
  (process as NodeJS.Process & { loadEnvFile(path: string): void }).loadEnvFile(".env");
}

const prisma = new PrismaClient();
const baseURL = "http://localhost:3000";

// Helper: create an invite code directly in DB for testing
async function createTestInviteCode(): Promise<string> {
  const { randomBytes } = await import("node:crypto");
  const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code: string;
  do {
    code = Array.from(randomBytes(8)).map((b) => CHARSET[b % CHARSET.length]).join("");
  } while (await prisma.inviteCode.findUnique({ where: { code } }));
  await prisma.inviteCode.create({ data: { code, maxUses: 100, note: "test" } });
  return code;
}

test.describe("Auth: register, login, logout, me", () => {
  test.setTimeout(30000);
  test.afterAll(async () => {
    const users = await prisma.user.findMany({ where: { email: { startsWith: "auth-test-" } } });
    for (const u of users) {
      await prisma.session.updateMany({ where: { userId: u.id }, data: { userId: null } });
      await prisma.user.delete({ where: { id: u.id } });
    }
    await prisma.inviteCode.deleteMany({ where: { note: "test" } });
    await prisma.$disconnect();
  });

  const testPassword = "test123456";

  function makeEmail() {
    return `auth-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  }

  test("register creates user and sets auth cookie", async ({ browser }) => {
    const email = makeEmail();
    const inviteCode = await createTestInviteCode();
    const ctx = await browser.newContext();
    const request = ctx.request;

    const res = await request.post(`${baseURL}/api/auth/register`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ email, password: testPassword, inviteCode }),
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.user).toBeDefined();
    expect(data.user.email).toBe(email);
    expect(data.user.id).toBeTruthy();

    const cookies = await ctx.cookies();
    const authCookie = cookies.find((c) => c.name === "auth-token");
    expect(authCookie).toBeDefined();
    expect(authCookie!.value.length).toBeGreaterThan(10);
  });

  test("register with duplicate email returns 409", async ({ browser }) => {
    const email = makeEmail();
    const inviteCode = await createTestInviteCode();
    const ctx = await browser.newContext();
    const request = ctx.request;

    // First registration
    await request.post(`${baseURL}/api/auth/register`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ email, password: testPassword, inviteCode }),
    });

    // Second registration with same email (reuse same code — it has 100 uses)
    const res = await request.post(`${baseURL}/api/auth/register`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ email, password: testPassword, inviteCode }),
    });

    expect(res.status()).toBe(409);
    const data = await res.json();
    expect(data.error).toContain("已注册");
  });

  test("register with short password returns 400", async ({ browser }) => {
    const email = makeEmail();
    const inviteCode = await createTestInviteCode();
    const ctx = await browser.newContext();
    const request = ctx.request;

    const res = await request.post(`${baseURL}/api/auth/register`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ email, password: "123", inviteCode }),
    });

    expect(res.status()).toBe(400);
  });

  test("login with correct credentials returns user", async ({ browser }) => {
    const email = makeEmail();
    const inviteCode = await createTestInviteCode();
    const ctx = await browser.newContext();
    const request = ctx.request;

    // Register first
    await request.post(`${baseURL}/api/auth/register`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ email, password: testPassword, inviteCode }),
    });

    // Login with a fresh context (no existing auth cookie)
    const ctx2 = await browser.newContext();
    const request2 = ctx2.request;

    const res = await request2.post(`${baseURL}/api/auth/login`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ email, password: testPassword }),
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.user.email).toBe(email);

    const cookies = await ctx2.cookies();
    const authCookie = cookies.find((c) => c.name === "auth-token");
    expect(authCookie).toBeDefined();
  });

  test("login with wrong password returns 401", async ({ browser }) => {
    const email = makeEmail();
    const inviteCode = await createTestInviteCode();
    const ctx = await browser.newContext();
    const request = ctx.request;

    // Register first
    await request.post(`${baseURL}/api/auth/register`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ email, password: testPassword, inviteCode }),
    });

    // Login with wrong password (fresh context)
    const ctx2 = await browser.newContext();
    const request2 = ctx2.request;

    const res = await request2.post(`${baseURL}/api/auth/login`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ email, password: "wrongpassword" }),
    });

    expect(res.status()).toBe(401);
  });

  test("GET /api/auth/me returns user when authenticated", async ({ browser }) => {
    const email = makeEmail();
    const inviteCode = await createTestInviteCode();
    const ctx = await browser.newContext();
    const request = ctx.request;

    // Register
    await request.post(`${baseURL}/api/auth/register`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ email, password: testPassword, inviteCode }),
    });

    // Check me
    const res = await request.get(`${baseURL}/api/auth/me`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.user).toBeDefined();
    expect(data.user.email).toBe(email);
  });

  test("GET /api/auth/me returns null when not authenticated", async ({ browser }) => {
    const ctx = await browser.newContext();
    const request = ctx.request;

    const res = await request.get(`${baseURL}/api/auth/me`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.user).toBeNull();
  });

  test("logout clears auth cookie", async ({ browser }) => {
    const email = makeEmail();
    const inviteCode = await createTestInviteCode();
    const ctx = await browser.newContext();
    const request = ctx.request;

    // Register
    await request.post(`${baseURL}/api/auth/register`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ email, password: testPassword, inviteCode }),
    });

    // Verify logged in
    const meBefore = await request.get(`${baseURL}/api/auth/me`);
    const meDataBefore = await meBefore.json();
    expect(meDataBefore.user).toBeDefined();

    // Logout
    const logoutRes = await request.post(`${baseURL}/api/auth/logout`);
    expect(logoutRes.status()).toBe(200);

    // Verify logged out
    const meAfter = await request.get(`${baseURL}/api/auth/me`);
    const meDataAfter = await meAfter.json();
    expect(meDataAfter.user).toBeNull();
  });

  test("register binds existing guest session to user", async ({ browser }) => {
    const email = makeEmail();
    const inviteCode = await createTestInviteCode();
    const ctx = await browser.newContext();
    const request = ctx.request;

    // Create guest session first
    await request.get(`${baseURL}/api/session`);

    // Register
    const res = await request.post(`${baseURL}/api/auth/register`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ email, password: testPassword, inviteCode }),
    });
    expect(res.status()).toBe(200);

    // Verify guest session is now bound to user
    const guestCookie = (await ctx.cookies()).find((c) => c.name === "guest-token");
    if (guestCookie) {
      const session = await prisma.session.findUnique({
        where: { token: guestCookie.value },
      });
      expect(session?.userId).toBeTruthy();
    }
  });

  test("register with invalid invite code returns 403", async ({ browser }) => {
    const email = makeEmail();
    const ctx = await browser.newContext();
    const request = ctx.request;

    const res = await request.post(`${baseURL}/api/auth/register`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ email, password: testPassword, inviteCode: "INVALID1" }),
    });

    expect(res.status()).toBe(403);
  });

  test("register without invite code returns 400", async ({ browser }) => {
    const email = makeEmail();
    const ctx = await browser.newContext();
    const request = ctx.request;

    const res = await request.post(`${baseURL}/api/auth/register`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ email, password: testPassword }),
    });

    expect(res.status()).toBe(400);
  });

  test("invite code with maxUses=1 is exhausted after one use", async ({ browser }) => {
    const email1 = makeEmail();
    const email2 = makeEmail();
    const { randomBytes } = await import("node:crypto");
    const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code: string;
    do {
      code = Array.from(randomBytes(8)).map((b) => CHARSET[b % CHARSET.length]).join("");
    } while (await prisma.inviteCode.findUnique({ where: { code } }));
    await prisma.inviteCode.create({ data: { code, maxUses: 1, note: "test" } });

    // First registration — should succeed
    const ctx1 = await browser.newContext();
    const res1 = await ctx1.request.post(`${baseURL}/api/auth/register`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ email: email1, password: testPassword, inviteCode: code }),
    });
    expect(res1.status()).toBe(200);

    // Second registration with same code — should fail (exhausted)
    const ctx2 = await browser.newContext();
    const res2 = await ctx2.request.post(`${baseURL}/api/auth/register`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ email: email2, password: testPassword, inviteCode: code }),
    });
    expect(res2.status()).toBe(403);

    // Verify code is marked exhausted in DB
    const dbCode = await prisma.inviteCode.findUnique({ where: { code } });
    expect(dbCode?.usedCount).toBe(1);
    expect(dbCode?.exhausted).toBe(true);
  });
});
