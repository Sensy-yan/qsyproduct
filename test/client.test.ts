import { describe, it, expect, vi } from "vitest";
import { DianpingClient } from "../src/scrape/client";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}

describe("DianpingClient", () => {
  it("分页拉取直到空页", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { dealList: [{ dealId: "a" }, { dealId: "b" }] } }))
      .mockResolvedValueOnce(jsonResponse({ data: { dealList: [] } }));
    const client = new DianpingClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      headers: { Cookie: "x=1" },
      minIntervalMs: 0,
      sleep: async () => {},
    });
    const pages = await client.fetchAllDealListPages("shop1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(pages).toHaveLength(1); // 只返回非空页
  });

  it("每次请求之间调用 sleep(限速)", async () => {
    const sleep = vi.fn(async () => {});
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { dealList: [{ dealId: "a" }] } }))
      .mockResolvedValueOnce(jsonResponse({ data: { dealList: [] } }));
    const client = new DianpingClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      headers: {}, minIntervalMs: 500, sleep,
    });
    await client.fetchAllDealListPages("shop1");
    expect(sleep).toHaveBeenCalledWith(500);
  });

  it("403/验证码响应抛 CaptchaError", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("verify", { status: 403 }));
    const client = new DianpingClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
      headers: {}, minIntervalMs: 0, sleep: async () => {},
    });
    await expect(client.fetchDealDetail("d1")).rejects.toThrow("CAPTCHA");
  });
});
