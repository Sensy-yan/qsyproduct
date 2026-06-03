import { describe, it, expect } from "vitest";
import { toCsv } from "../src/export/csv";

describe("toCsv", () => {
  it("生成带表头的 CSV", () => {
    const rows = [
      { dealId: "d1", title: "双人餐", price: 99 },
      { dealId: "d2", title: "单人,套餐", price: 49 },
    ];
    const csv = toCsv(rows, ["dealId", "title", "price"]);
    expect(csv).toBe(
      'dealId,title,price\r\nd1,双人餐,99\r\nd2,"单人,套餐",49',
    );
  });

  it("转义引号与换行", () => {
    const rows = [{ text: 'he said "hi"\nbye' }];
    expect(toCsv(rows, ["text"])).toBe('text\r\n"he said ""hi""\nbye"');
  });

  it("空值输出空字符串", () => {
    const rows = [{ a: null, b: undefined as unknown as string }];
    expect(toCsv(rows, ["a", "b"])).toBe("a,b\r\n,");
  });
});
