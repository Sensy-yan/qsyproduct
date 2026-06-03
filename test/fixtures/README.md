# 合成 fixture(待侦察替换)

这些 JSON 是按 `src/parse/normalize.ts` 中 `// RECON:` 假设的结构手工编造的,**不是真实大众点评响应**。
侦察(抓包)完成后,用真实录制响应替换 deal-list/deal-detail/reviews.json,并把 normalize 里的 RECON 路径与本测试的断言改为真值。
