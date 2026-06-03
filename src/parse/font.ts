/**
 * 字体解密:大众点评把数字/部分文字渲染为自定义字体的私有区码点。
 * 解密分两步:
 *  1. buildGlyphMap: 解析 woff 字体,建立 "私有区码点 -> 真实字符" 映射。
 *  2. decodeWithMap: 用映射替换字符串中的加密码点。
 *
 * 注意:字体文件每次抓取动态下载,映射不可硬编码。
 */

/** 用已知映射替换加密码点(纯函数,易测)。 */
export function decodeWithMap(input: string, map: Map<string, string>): string {
  let out = "";
  for (const ch of input) {
    out += map.get(ch) ?? ch;
  }
  return out;
}

/**
 * 解析 woff 字体二进制,建立 glyph 映射。
 * 实现思路(侦察确认具体加密类型后定稿):
 *  - 若为「码点->字形」型:解析 cmap + glyph 轮廓,将每个私有区码点的字形
 *    与一组「已知字符的标准字形」做轮廓匹配。
 *  - 已知字符基准来自一份对照字体(随仓库提供的 baseline)。
 */
export async function buildGlyphMap(
  woff: ArrayBuffer,
  baseline: Array<{ char: string; contourHash: string }>,
): Promise<Map<string, string>> {
  const { parseFont, glyphContourHash, privateUseCodepoints } = await import(
    "./font-internal"
  );
  const font = parseFont(woff);
  const map = new Map<string, string>();
  for (const cp of privateUseCodepoints(font)) {
    const hash = glyphContourHash(font, cp);
    const match = baseline.find((b) => b.contourHash === hash);
    if (match) map.set(String.fromCodePoint(cp), match.char);
  }
  return map;
}
