// 所有 URL/参数模板来自 docs/recon/dianping-endpoints.md(侦察任务)。
// 占位常量在侦察后回填为真实值。
export const BASE = "https://m.dianping.com"; // RECON
export function dealListUrl(shopUuid: string, page: number): string {
  // RECON: 真实路径与分页参数名
  return `${BASE}/api/shop/${shopUuid}/deals?page=${page}`;
}
export function dealDetailUrl(dealId: string): string {
  return `${BASE}/api/deal/${dealId}`; // RECON
}
export function reviewsUrl(shopUuid: string, page: number): string {
  return `${BASE}/api/shop/${shopUuid}/reviews?page=${page}`; // RECON
}
