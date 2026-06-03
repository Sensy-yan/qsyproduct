# 大众点评接口侦察记录

> 抓包后把每项填成真实值,再按「→ 改哪里」回填代码。完成后用真实响应替换 `test/fixtures/*.json` 并 `npm test`。
> 标记:`【待填】` = 还没抓到;填完请删掉这个标记。

---

## 0. 商家 URL 形态 → `src/session/bootstrap.ts` `parseShopUuid`

- 你用的商家页面 URL 样例:`【待填】`
- shopUuid 在 URL 里的位置(路径段 / query 参数名):`【待填】`
- → 改 `parseShopUuid` 的正则(当前假设 `/shop/<id>` 或 `?shopId=<id>`)。

## 1. 团单列表接口 → `src/scrape/endpoints.ts` `dealListUrl` + `src/parse/normalize.ts` `normalizeDealList`

| 项 | 真实值 |
|---|---|
| 请求方法 | `【待填】 GET/POST` |
| 完整 URL(去掉 query) | `【待填】` |
| 分页参数名 + 起始页(0 还是 1) | `【待填】` |
| 其它必需 query/body 参数(标出哪些像 token/签名) | `【待填】` |
| 必需请求头(Cookie/Referer/User-Agent/X-*) | `【待填】` |
| 响应里「团单数组」的 JSON 路径 | `【待填】 如 data.shopGroupList` |
| 数组元素里的字段名:团单ID / 标题 / 现价 / 原价 / 已售 / 品类 / 有效期 | `【待填】` |
| 现价/已售是否为加密字符(乱码) | `【待填】 是/否` |

→ 改 `endpoints.ts` 的 `BASE` 和 `dealListUrl`;改 `normalizeDealList` 里 `data.dealList` 路径和各 `d.xxx` 字段名。

## 2. 团单详情接口 → `endpoints.ts` `dealDetailUrl` + `normalizeDealDetail`

| 项 | 真实值 |
|---|---|
| 方法 + URL | `【待填】` |
| 入参(dealId 叫什么、放路径还是 query) | `【待填】` |
| 「套餐明细/服务步骤」数组路径 | `【待填】 如 data.contents / data.menu` |
| 明细元素字段:名称 / 数量 / 规格 / 步骤序 / 时长 | `【待填】` |
| 规则文本字段:预约 / 退款 / 使用时间 / 适用门店 / 购买须知 | `【待填】 各自的 key` |

→ 改 `dealDetailUrl`;改 `normalizeDealDetail` 里 `data.contents` 路径、`it.xxx` 字段、`ruleSources` 五个 key。

## 3. 评价接口 → `endpoints.ts` `reviewsUrl` + `normalizeReviews`

| 项 | 真实值 |
|---|---|
| 方法 + URL | `【待填】` |
| 分页参数 | `【待填】` |
| 评价数组路径 | `【待填】 如 data.reviewList` |
| 字段:关联团单ID / 评分 / 文本 / 用户名 / 时间 | `【待填】` |

→ 改 `reviewsUrl`;改 `normalizeReviews` 里 `data.reviews` 路径和 `r.xxx` 字段。

## 4. 字体加密 → `src/parse/font.ts` + `src/parse/font-internal.ts`

| 项 | 真实值 |
|---|---|
| 哪些字段是加密字符(price/sales/评分…) | `【待填】` |
| 字体文件来源(CSS @font-face 的 url / 接口字段) | `【待填】 .woff 地址` |
| 加密类型(码点→字形轮廓匹配 / 固定映射表 / 偏移) | `【待填】` |

→ 落地 `font-internal.ts`(parseFont/privateUseCodepoints/glyphContourHash);在 `normalizeDealList` 加密字段处先 `decodeWithMap` 再 `Number`。把字体存为 `test/fixtures/shop.woff`。

## 5. 验证码 → `bootstrap.ts` `isCaptchaPage`

| 项 | 真实值 |
|---|---|
| 触发条件(频率/IP/行为) | `【待填】` |
| 验证页 URL 特征 / 页面提示文案 | `【待填】` |
| 滑块类型(网易易盾/腾讯/自研) | `【待填】` |

→ 按真实文案/域名校准 `isCaptchaPage` 的正则。

---

## 录制 fixture(填完字段后)

把三个接口各一份**真实响应**保存,替换合成数据:
- `test/fixtures/deal-list.json`
- `test/fixtures/deal-detail.json`
- `test/fixtures/reviews.json`

然后把 `test/normalize.test.ts` 里的断言改成这份真实数据的真值,`npm test` 跑通即说明归一化对上了真实结构。
