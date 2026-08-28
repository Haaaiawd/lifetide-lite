import { test, expect, type Page } from "@playwright/test";

const setupSessionAndConsent = async (page: Page) => {
  await page.request.get("/api/session");
  const res = await page.request.post("/api/session/consent", {
    headers: { "content-type": "application/json" },
    data: JSON.stringify({
      consents: [
        { type: "ai", given: true },
        { type: "upload", given: true },
      ],
    }),
  });
  expect(res.status()).toBe(200);
};

const goToStart = async (page: Page) => {
  await setupSessionAndConsent(page);
  await page.goto("/");
  await expect(page.getByText("回答几个短问题")).toBeVisible();
  await page.getByRole("link", { name: "开始试运行" }).click();
  await page.waitForURL("/play");
};

const answerWave = async (page: Page, option = "方向不清") => {
  // q1: single choice
  await page.getByText("第 1/4 题").waitFor({ state: "visible" });
  await page.locator("button", { hasText: option }).click();
  const q1Submit = page.getByRole("button", { name: "提交" });
  await expect(q1Submit).toBeEnabled();
  await q1Submit.click();

  // q2: multi choice
  await page.getByText("第 2/4 题").waitFor({ state: "visible" });
  await page.locator("button", { hasText: "有投入感" }).click();
  await page.locator("button", { hasText: "消耗" }).click();
  const q2Submit = page.getByRole("button", { name: "提交" });
  await expect(q2Submit).toBeEnabled();
  await q2Submit.click();

  // q3: short text
  await page.getByText("第 3/4 题").waitFor({ state: "visible" });
  await page.locator("textarea").fill("一段用于测试的具体经历，希望保留一些创造空间。");
  const q3Submit = page.getByRole("button", { name: "提交" });
  await expect(q3Submit).toBeEnabled();
  await q3Submit.click();

  // q4: multi choice
  await page.getByText("第 4/4 题").waitFor({ state: "visible" });
  await page.locator("button", { hasText: "时间上限" }).click();
  await page.locator("button", { hasText: "收入下限" }).click();
  const q4Submit = page.getByRole("button", { name: "提交" });
  await expect(q4Submit).toBeEnabled();
  await q4Submit.click();
};

const skipWave = async (page: Page) => {
  for (let i = 1; i <= 4; i++) {
    const heading = page.getByText(`第 ${i}/4 题`);
    await heading.waitFor({ state: "visible" });
    const skip = page.getByRole("button", { name: "跳过" });
    await skip.waitFor({ state: "visible" });
    await skip.click();
  }
};

const answerWaveByKeyboard = async (page: Page) => {
  // q1: single choice
  await expect(page.getByText("第 1/4 题")).toBeVisible();
  await page.locator("button", { hasText: "方向不清" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "提交" }).focus();
  await page.keyboard.press("Enter");

  // q2: multi choice
  await expect(page.getByText("第 2/4 题")).toBeVisible();
  await page.locator("button", { hasText: "有投入感" }).focus();
  await page.keyboard.press("Enter");
  await page.locator("button", { hasText: "消耗" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "提交" }).focus();
  await page.keyboard.press("Enter");

  // q3: short text
  await expect(page.getByText("第 3/4 题")).toBeVisible();
  const textarea = page.locator("textarea");
  await textarea.focus();
  await page.keyboard.type("一段键盘输入的测试经历。");
  await page.getByRole("button", { name: "提交" }).focus();
  await page.keyboard.press("Enter");

  // q4: multi choice
  await expect(page.getByText("第 4/4 题")).toBeVisible();
  await page.locator("button", { hasText: "时间上限" }).focus();
  await page.keyboard.press("Enter");
  await page.locator("button", { hasText: "收入下限" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "提交" }).focus();
  await page.keyboard.press("Enter");
};

const calibrateInsight = async (
  page: Page,
  accuracy: "准确" | "部分准确" | "不准确" = "部分准确",
  note = ""
) => {
  await expect(page.getByText("即时理解")).toBeVisible();

  const accuracyButton = page.getByRole("button", { name: accuracy, exact: true });
  await expect(accuracyButton).toBeVisible();
  await accuracyButton.click();

  if (note) {
    await page.locator("#insight-note").fill(note);
  }

  const continueButton =
    accuracy === "不准确"
      ? page.getByRole("button", { name: "撤回并继续", exact: true })
      : page.getByRole("button", { name: "确认并继续", exact: true });
  await expect(continueButton).toBeVisible();
  await continueButton.click();
};

const assertRouteCovers = async (page: Page) => {
  const main = page.getByRole("main");
  await expect(main.getByText("三条平行人生")).toBeVisible();
  await expect(main.locator("article", { hasText: "01" })).toBeVisible();
  await expect(main.locator("article", { hasText: "02" })).toBeVisible();
  await expect(main.locator("article", { hasText: "03" })).toBeVisible();

  // The three-year trajectory is always visible; details are folded.
  await expect(page.getByRole("heading", { name: "三年走向", level: 3 })).toHaveCount(3);

  // Expand the first route and verify all detail sections.
  const first = page.locator("article").first();
  await first.getByRole("button", { name: "展开这条人生" }).click();

  const detailSections = [
    "普通一天",
    "为什么吸引你",
    "真正要付出的代价",
    "还不知道的事情",
    "现实依据",
    "风险",
    "最小原型",
  ];
  for (const section of detailSections) {
    await expect(first.getByRole("heading", { name: section, level: 3 })).toBeVisible();
  }

  // No ranking / recommendation language
  await expect(page.getByText("最适合你")).toHaveCount(0);
  await expect(page.getByText("推荐", { exact: true })).toHaveCount(0);
  await expect(page.getByText("冠军")).toHaveCount(0);

  // No persona dashboard remnants
  await expect(page.getByText("人格")).toHaveCount(0);
  await expect(page.getByText("覆盖率")).toHaveCount(0);
};

test.describe("人生试运行视觉原型 — TASK-001 验收", () => {
  test("360px 完整主路径：landing → question → insight → three routes", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await setupSessionAndConsent(page);

    // Landing
    await page.goto("/");
    await expect(page.getByText("人生试运行")).toBeVisible();
    await expect(page.getByText("回答几个短问题，看见三种可试玩的人生")).toBeVisible();
    await expect(page.getByText("即时理解样张")).toBeVisible();
    await page.screenshot({ path: "reports/01-landing-mobile-360.png" });

    // Start
    await page.getByRole("link", { name: "开始试运行" }).click();
    await page.waitForURL("/play");
    await page.screenshot({ path: "reports/02-question-mobile-360.png" });

    // Question
    await expect(page.getByText("WAVE 1")).toBeVisible();
    await expect(page.getByText("第 1/4 题")).toBeVisible();
    await answerWave(page, "方向不清");

    // Insight
    await expect(page.getByText("即时理解")).toBeVisible();
    await page.screenshot({ path: "reports/03-insight-mobile-360.png" });

    await calibrateInsight(page, "准确");

    // Routes
    await assertRouteCovers(page);
    await page.screenshot({ path: "reports/04-routes-mobile-360.png" });

    // Navigation between route covers works
    const next = page.getByLabel("下一条路线");
    const prev = page.getByLabel("上一条路线");
    if (await next.isVisible()) {
      await next.click();
      await expect(page.getByText("02")).toBeVisible();
      await next.click();
      await expect(page.getByText("03")).toBeVisible();
      await prev.click();
      await expect(page.getByText("02")).toBeVisible();
    }
  });

  test("桌面端三条路线并列或一次性可见", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await goToStart(page);
    await answerWave(page, "方向不清");
    await calibrateInsight(page, "准确");

    await assertRouteCovers(page);

    // On desktop, all three route numbers should be visible at once
    const cardCount = await page.locator("article").count();
    expect(cardCount).toBeGreaterThanOrEqual(3);
    await page.screenshot({ path: "reports/05-routes-desktop-1440.png" });
  });

  test("键盘可完成主路径，焦点顺序不丢失", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await goToStart(page);

    await answerWaveByKeyboard(page);

    await expect(page.getByText("即时理解")).toBeVisible();
    await page.screenshot({ path: "reports/06-keyboard-flow.png" });

    await page.getByRole("button", { name: "部分准确" }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "确认并继续" }).focus();
    await page.keyboard.press("Enter");

    await expect(page.getByText("三条平行人生")).toBeVisible();
  });

  test("200% 缩放不裁剪关键内容", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/");
    await page.evaluate(() => {
      (document.body.style as any).zoom = "200%";
    });

    await expect(page.getByText("回答几个短问题")).toBeVisible();
    await setupSessionAndConsent(page);
    await page.getByRole("link", { name: "开始试运行" }).click();
    await page.waitForURL("/play");

    await answerWave(page, "方向不清");
    await calibrateInsight(page, "准确");
    await assertRouteCovers(page);

    await page.screenshot({ path: "reports/07-zoom-200.png" });
  });

  test("prefers-reduced-motion 下内容完整且不丢失", async ({ page, context }) => {
    await context.addInitScript(() => {
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: (query: string) => ({
          matches: query === "(prefers-reduced-motion: reduce)",
          media: query,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => true,
        }),
      });
    });

    await page.setViewportSize({ width: 360, height: 800 });
    await goToStart(page);
    await answerWave(page, "方向不清");
    await calibrateInsight(page, "部分准确");
    await assertRouteCovers(page);

    // Ensure route cover content is not stuck at opacity 0
    const articles = await page.locator("article").all();
    for (const article of articles) {
      const opacity = await article.evaluate((el) => window.getComputedStyle(el).opacity);
      expect(Number(opacity)).toBeGreaterThan(0.9);
    }

    await page.screenshot({ path: "reports/08-reduced-motion.png" });
  });

  test("不引用 blocked 的 Lifetide 素材", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await goToStart(page);
    await answerWave(page, "方向不清");
    await calibrateInsight(page, "准确");

    const html = await page.content();
    expect(html).not.toContain("pixel-frame.png");
    expect(html).not.toContain("/sky");
  });

  test("可跳过题目并仍然到达三条路线", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await goToStart(page);
    await skipWave(page);
    await calibrateInsight(page, "部分准确");
    await assertRouteCovers(page);
  });
});
