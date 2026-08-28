import { test, expect, type Page } from "@playwright/test";
import fs from "fs";
import path from "path";

const outDir = path.join(process.cwd(), "tmp", "ui-screenshots");

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const screenshot = async (page: Page, name: string) => {
  await page.screenshot({
    path: path.join(outDir, `${name}.png`),
    fullPage: false,
  });
};

const setupSessionAndConsent = async (page: Page) => {
  const sessionRes = await page.request.get("/api/session");
  expect(sessionRes.status()).toBe(200);
  const consentRes = await page.request.post("/api/session/consent", {
    headers: { "content-type": "application/json" },
    data: JSON.stringify({
      consents: [
        { type: "ai", given: true },
        { type: "upload", given: true },
      ],
    }),
  });
  expect(consentRes.status()).toBe(200);
};

test.describe("UI screenshot flow", () => {
  test("desktop full flow", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setupSessionAndConsent(page);

    await page.goto("/");
    await expect(page.getByText("回答几个短问题")).toBeVisible();
    await screenshot(page, "01-landing-desktop");
    await page.getByRole("link", { name: "开始试运行" }).click();
    await page.waitForURL("/play");

    await expect(page.getByText("第 1/4 题")).toBeVisible({ timeout: 30000 });
    await screenshot(page, "02-question-1-choice-desktop");

    await page.locator("button", { hasText: "方向不清" }).click();
    await page.getByRole("button", { name: "提交" }).click();

    await expect(page.getByText("第 2/4 题")).toBeVisible({ timeout: 30000 });
    await screenshot(page, "03-question-2-choice-desktop");
    await page.locator("button", { hasText: "有投入感" }).click();
    await page.locator("button", { hasText: "消耗" }).click();
    await page.getByRole("button", { name: "提交" }).click();

    await expect(page.getByText("第 3/4 题")).toBeVisible({ timeout: 30000 });
    await screenshot(page, "04-question-3-text-desktop");
    await page.locator("textarea").fill("上周独自整理了一份流程文档，发现写完很有秩序感。");
    await page.getByRole("button", { name: "提交" }).click();

    await expect(page.getByText("第 4/4 题")).toBeVisible({ timeout: 30000 });
    await screenshot(page, "05-question-4-choice-desktop");
    await page.locator("button", { hasText: "时间上限" }).click();
    await page.locator("button", { hasText: "收入下限" }).click();
    await page.getByRole("button", { name: "提交" }).click();

    await expect(page.getByText("即时理解")).toBeVisible({ timeout: 30000 });
    await screenshot(page, "06-insight-desktop");

    await page.getByRole("button", { name: "部分准确" }).click();
    await page.locator("#insight-note").fill("方向大致对，但希望能看到更多生活场景。");
    await page.getByRole("button", { name: "确认并继续" }).click();

    await expect(page.getByText("三条平行人生")).toBeVisible({ timeout: 30000 });
    await screenshot(page, "07-three-routes-desktop");

    const first = page.locator("article").first();
    await first.getByRole("button", { name: "展开这条人生" }).click();
    await expect(first.getByRole("heading", { name: "普通一天", level: 3 })).toBeVisible();
    await screenshot(page, "08-route-1-expanded-desktop");

    await first.getByRole("heading", { name: "最小原型", level: 3 }).scrollIntoViewIfNeeded();
    await screenshot(page, "09-prototype-card-desktop");

    const startBtn = first.getByRole("button", { name: "开始试玩" });
    if (await startBtn.isVisible().catch(() => false)) {
      await startBtn.click();
      await expect(first.getByText("进行中")).toBeVisible();
      await screenshot(page, "10-prototype-active-desktop");
    }
  });

  test("mobile full flow", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await setupSessionAndConsent(page);

    await page.goto("/");
    await expect(page.getByText("回答几个短问题")).toBeVisible();
    await screenshot(page, "11-landing-mobile");
    await page.getByRole("link", { name: "开始试运行" }).click();
    await page.waitForURL("/play");

    await expect(page.getByText("第 1/4 题")).toBeVisible({ timeout: 30000 });
    await screenshot(page, "12-question-1-choice-mobile");

    await page.locator("button", { hasText: "方向不清" }).click();
    await page.getByRole("button", { name: "提交" }).click();

    await expect(page.getByText("第 2/4 题")).toBeVisible({ timeout: 30000 });
    await screenshot(page, "13-question-2-choice-mobile");
    await page.locator("button", { hasText: "有投入感" }).click();
    await page.locator("button", { hasText: "消耗" }).click();
    await page.getByRole("button", { name: "提交" }).click();

    await expect(page.getByText("第 3/4 题")).toBeVisible({ timeout: 30000 });
    await screenshot(page, "14-question-3-text-mobile");
    await page.locator("textarea").fill("上周独自整理了一份流程文档，发现写完很有秩序感。");
    await page.getByRole("button", { name: "提交" }).click();

    await expect(page.getByText("第 4/4 题")).toBeVisible({ timeout: 30000 });
    await screenshot(page, "15-question-4-choice-mobile");
    await page.locator("button", { hasText: "时间上限" }).click();
    await page.locator("button", { hasText: "收入下限" }).click();
    await page.getByRole("button", { name: "提交" }).click();

    await expect(page.getByText("即时理解")).toBeVisible({ timeout: 30000 });
    await screenshot(page, "16-insight-mobile");

    await page.getByRole("button", { name: "部分准确" }).click();
    await page.locator("#insight-note").fill("方向大致对，但希望能看到更多生活场景。");
    await page.getByRole("button", { name: "确认并继续" }).click();

    await expect(page.getByText("三条平行人生")).toBeVisible({ timeout: 30000 });
    await screenshot(page, "17-three-routes-mobile");

    const second = page.locator("article").nth(1);
    await second.scrollIntoViewIfNeeded();
    await second.getByRole("button", { name: "展开这条人生" }).click();
    await expect(second.getByRole("heading", { name: "普通一天", level: 3 })).toBeVisible();
    await screenshot(page, "18-route-2-expanded-mobile");

    await second.getByRole("heading", { name: "最小原型", level: 3 }).scrollIntoViewIfNeeded();
    await screenshot(page, "19-prototype-card-mobile");

    const startBtn = second.getByRole("button", { name: "开始试玩" });
    if (await startBtn.isVisible().catch(() => false)) {
      await startBtn.click();
      await expect(second.getByText("进行中")).toBeVisible();
      await screenshot(page, "20-prototype-active-mobile");
    }
  });
});
