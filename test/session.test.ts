import { describe, it, expect } from "vitest";
import { buildHeaders, isCaptchaPage } from "../src/session/bootstrap";

describe("session helpers", () => {
  it("把 cookies 数组拼成 Cookie 头", () => {
    const headers = buildHeaders(
      [{ name: "a", value: "1" }, { name: "b", value: "2" }],
      "UA-String",
      "https://m.dianping.com/shop1",
    );
    expect(headers.Cookie).toBe("a=1; b=2");
    expect(headers["User-Agent"]).toBe("UA-String");
    expect(headers.Referer).toBe("https://m.dianping.com/shop1");
  });

  it("根据页面 URL/内容识别验证码", () => {
    expect(isCaptchaPage("https://verify.dianping.com/...", "")).toBe(true);
    expect(isCaptchaPage("https://m.dianping.com/shop1", "请完成安全验证")).toBe(true);
    expect(isCaptchaPage("https://m.dianping.com/shop1", "团购")).toBe(false);
  });
});
