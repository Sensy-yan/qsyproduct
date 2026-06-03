/**
 * woff 解析底层实现。真实实现待侦察(Task 1)确认加密类型并提供 test/fixtures/shop.woff 后落地。
 * 当前为类型化占位:被调用即抛错,避免静默返回错误结果。
 */
export interface Font {
  readonly _raw: ArrayBuffer;
}

export function parseFont(woff: ArrayBuffer): Font {
  throw new Error("font-internal.parseFont 未实现:待侦察确认字体加密类型后落地");
}

export function privateUseCodepoints(font: Font): number[] {
  throw new Error("font-internal.privateUseCodepoints 未实现:待侦察后落地");
}

export function glyphContourHash(font: Font, codepoint: number): string {
  throw new Error("font-internal.glyphContourHash 未实现:待侦察后落地");
}
