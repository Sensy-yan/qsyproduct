import { describe, it, expect } from "vitest";
import { decodeWithMap } from "../src/parse/font";

describe("decodeWithMap", () => {
  it("用 glyph 映射还原加密串", () => {
    const cp1 = String.fromCodePoint(0xe001);
    const cp2 = String.fromCodePoint(0xe002);
    const cp3 = String.fromCodePoint(0xe003);
    const map = new Map<string, string>([
      [cp1, "1"],
      [cp2, "9"],
      [cp3, "."],
    ]);
    // encrypted input: cp1 cp2 cp3 cp2  => "19.9"
    expect(decodeWithMap(cp1 + cp2 + cp3 + cp2, map)).toBe("19.9");
  });

  it("非加密字符原样保留", () => {
    const cp1 = String.fromCodePoint(0xe001);
    const map = new Map<string, string>([[cp1, "5"]]);
    // "¥" + cp1 + "元" => "¥5元"
    expect(decodeWithMap("¥" + cp1 + "元", map)).toBe("¥5元");
  });
});
