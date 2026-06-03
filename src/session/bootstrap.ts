import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import type { Session } from "../types";

export function buildHeaders(
  cookies: Array<{ name: string; value: string }>,
  userAgent: string,
  referer: string,
): Record<string, string> {
  return {
    Cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
    "User-Agent": userAgent,
    Referer: referer,
  };
}

export function isCaptchaPage(url: string, bodyText: string): boolean {
  // RECON: 用侦察确认的验证域名/提示文案校准
  if (/verify\.|\/captcha|\/verify/.test(url)) return true;
  return /安全验证|滑动验证|请完成/.test(bodyText);
}

/** 从 URL 解析 shopUuid。RECON: 按真实 URL 形态校准正则。 */
export function parseShopUuid(url: string): string {
  const m = url.match(/\/shop\/([A-Za-z0-9]+)/) ?? url.match(/shopId=([A-Za-z0-9]+)/);
  if (!m) throw new Error(`无法从 URL 解析 shopUuid: ${url}`);
  return m[1];
}

export class CaptchaInterrupt extends Error {
  constructor(public screenshotPath: string) {
    super("CAPTCHA_INTERRUPT");
    this.name = "CaptchaInterrupt";
  }
}

export interface BootstrapOptions {
  headless?: boolean;
  proxyUrl?: string;
  captchaTimeoutMs?: number;
}

/**
 * 用真实浏览器打开商家页,建立会话(cookie/UA)。
 * 有头模式下若检测到验证码:截图存本地,并轮询等待用户在可见浏览器里手动完成;
 * 超时仍未通过则抛 CaptchaInterrupt(编排层据此置 awaiting_human)。
 * proxyUrl 可选(设计:先裸跑,被风控再上代理)。
 */
export async function bootstrapSession(
  merchantUrl: string,
  jobId: string,
  opts: BootstrapOptions = {},
): Promise<Session> {
  const browser = await chromium.launch({
    headless: opts.headless ?? false,
    proxy: opts.proxyUrl ? { server: opts.proxyUrl } : undefined,
  });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(merchantUrl, { waitUntil: "networkidle" });

    const bodyText = async () => page.evaluate(() => document.body.innerText);
    if (isCaptchaPage(page.url(), await bodyText())) {
      await mkdir("./data/screenshots", { recursive: true });
      const shotPath = `./data/screenshots/${jobId}.png`;
      await page.screenshot({ path: shotPath });
      console.log(`[captcha] 请在弹出的浏览器中完成验证(任务 ${jobId})。截图: ${shotPath}`);
      const deadline = Date.now() + (opts.captchaTimeoutMs ?? 120000);
      while (Date.now() < deadline) {
        await page.waitForTimeout(2000);
        if (!isCaptchaPage(page.url(), await bodyText())) break;
      }
      if (isCaptchaPage(page.url(), await bodyText())) {
        throw new CaptchaInterrupt(shotPath);
      }
    }

    const cookies = await context.cookies();
    const ua = await page.evaluate(() => navigator.userAgent);
    return {
      headers: buildHeaders(cookies, ua, merchantUrl),
      shopUuid: parseShopUuid(merchantUrl),
    };
  } finally {
    await browser.close();
  }
}
