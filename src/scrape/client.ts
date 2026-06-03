import { dealListUrl, dealDetailUrl, reviewsUrl } from "./endpoints";

export class CaptchaError extends Error {
  constructor() { super("CAPTCHA"); this.name = "CaptchaError"; }
}

export interface ClientOpts {
  fetchImpl: typeof fetch;
  headers: Record<string, string>; // 来自会话引导:Cookie/token/UA/Referer
  minIntervalMs: number;
  sleep: (ms: number) => Promise<void>;
}

export class DianpingClient {
  constructor(private opts: ClientOpts) {}

  private async get(url: string): Promise<any> {
    await this.opts.sleep(this.opts.minIntervalMs); // 限速:每请求前等待
    const res = await this.opts.fetchImpl(url, { headers: this.opts.headers });
    if (res.status === 403 || res.status === 429) throw new CaptchaError();
    return res.json();
  }

  /** 翻页拉团单列表,遇空页停止,返回每页原始响应(非空)。 */
  async fetchAllDealListPages(shopUuid: string): Promise<any[]> {
    const pages: any[] = [];
    for (let page = 1; page <= 100; page++) {
      const body = await this.get(dealListUrl(shopUuid, page));
      const list = body?.data?.dealList ?? []; // RECON: 与 normalize 同源路径
      if (list.length === 0) break;
      pages.push(body);
    }
    return pages;
  }

  async fetchDealDetail(dealId: string): Promise<any> {
    return this.get(dealDetailUrl(dealId));
  }

  async fetchAllReviewPages(shopUuid: string): Promise<any[]> {
    const pages: any[] = [];
    for (let page = 1; page <= 100; page++) {
      const body = await this.get(reviewsUrl(shopUuid, page));
      const list = body?.data?.reviews ?? []; // RECON
      if (list.length === 0) break;
      pages.push(body);
    }
    return pages;
  }
}
