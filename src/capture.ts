/**
 * 侦察抓取助手:在本机有头打开商家页,你手动过验证后,自动把渲染后的 HTML + 整页截图存到 data/captured/。
 * 用法: npm run capture -- "https://www.dianping.com/shop/xxxx"
 * 把生成的 .html(或其中团购区域)发回,据此编写 DOM 解析。
 *
 * 必须在你自己的电脑(住宅 IP)上运行——机房 IP 会被点评风控重定向到验证页。
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const url = process.argv[2];
if (!url) {
  console.error('用法: npm run capture -- "<商家页面URL>"');
  process.exit(1);
}

function isBlocked(u: string): boolean {
  return /verify\.meituan|verify\.dianping|\/captcha|spiderindefence/.test(u);
}
function looksReady(html: string): boolean {
  return /团购|套餐|团单|门市价|套餐详情|代金券/.test(html);
}

async function main(): Promise<void> {
  mkdirSync("./data/captured", { recursive: true });
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ locale: "zh-CN" });
  const page = await ctx.newPage();

  console.log("正在打开页面…如出现验证(滑块/点选),请在弹出的浏览器里手动完成。");
  await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});

  console.log("等待页面就绪(过验证后自动继续,最多 3 分钟)…");
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000);
    if (isBlocked(page.url())) continue;
    if (looksReady(await page.content())) break;
  }

  // 给懒加载/团购区域一点渲染时间
  await page.waitForTimeout(2000);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const htmlPath = `./data/captured/shop-${stamp}.html`;
  const shotPath = `./data/captured/shop-${stamp}.png`;
  writeFileSync(htmlPath, await page.content(), "utf8");
  await page.screenshot({ path: shotPath, fullPage: true });

  console.log("\n完成:");
  console.log("  渲染后 HTML →", htmlPath);
  console.log("  整页截图   →", shotPath);
  console.log("当前页面 URL:", page.url());
  console.log("\n把上面的 HTML 文件(或其中团购/套餐区域的 outerHTML)发回,我据此写解析。");

  await browser.close();
}

main().catch((e) => {
  console.error("capture 失败:", e);
  process.exit(1);
});
