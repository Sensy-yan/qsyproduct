import puppeteer from "@cloudflare/puppeteer";
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
  constructor(public screenshotKey: string) { super("CAPTCHA_INTERRUPT"); }
}

/**
 * 打开商家页,建立会话。遇验证码:截图存 R2,抛 CaptchaInterrupt(编排层据此置 awaiting_human)。
 * proxyUrl 为可选——裸跑时不传;被风控后传入代理(设计:先裸跑触发再上)。
 */
export async function bootstrapSession(
  browserBinding: Fetcher,
  r2: R2Bucket,
  merchantUrl: string,
  jobId: string,
  proxyUrl?: string,
): Promise<Session> {
  const browser = await puppeteer.launch(browserBinding);
  try {
    const page = await browser.newPage();
    await page.goto(merchantUrl, { waitUntil: "networkidle0" });
    // RECON: page.evaluate runs in browser context; @ts-ignore needed because lib:dom is excluded from tsconfig
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (isCaptchaPage(page.url(), bodyText)) {
      const shot = await page.screenshot();
      const key = `captcha/${jobId}.png`;
      await r2.put(key, shot);
      throw new CaptchaInterrupt(key);
    }
    const cookies = await page.cookies();
    const ua = await browser.userAgent();
    return {
      headers: buildHeaders(cookies, ua, merchantUrl),
      shopUuid: parseShopUuid(merchantUrl),
    };
  } finally {
    await browser.close();
  }
}
