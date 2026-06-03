export const PAGE_HTML = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>大众点评团单抓取</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 960px; margin: 2rem auto; padding: 0 1rem; }
  form { display: flex; gap: .5rem; }
  input[type=url] { flex: 1; padding: .5rem; }
  button { padding: .5rem 1rem; cursor: pointer; }
  #status { margin: 1rem 0; color: #555; }
  #dl a { margin-right: 1rem; }
  table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
  th, td { border: 1px solid #ddd; padding: .4rem .6rem; text-align: left; font-size: 14px; vertical-align: top; }
  th { background: #f5f5f5; }
  tr.deal-row { cursor: pointer; }
  tr.deal-row:hover { background: #fafafa; }
  .detail { background: #fcfcfc; }
  .detail ul, .detail ol { margin: .3rem 0 .6rem 1.2rem; }
  .hidden { display: none; }
</style>
</head>
<body>
  <h1>大众点评单商家团单抓取</h1>
  <form id="f">
    <input type="url" id="url" placeholder="粘贴商家页面 URL" required>
    <button type="submit">抓取</button>
  </form>
  <div id="status"></div>
  <div id="dl" class="hidden"></div>
  <table id="t" class="hidden"><thead><tr>
    <th>团单</th><th>现价</th><th>原价</th><th>已售</th><th>品类</th>
  </tr></thead><tbody></tbody></table>
<script>
const f = document.getElementById('f');
const statusEl = document.getElementById('status');
const table = document.getElementById('t');
const tbody = table.querySelector('tbody');
const dl = document.getElementById('dl');

const RULE_LABEL = { booking:'预约方式', refund:'退款规则', usable_time:'使用时间', applicable_shop:'适用门店', notice:'购买须知' };

function esc(s){ const d=document.createElement('div'); d.textContent = s==null?'':String(s); return d.innerHTML; }

function renderProcess(items, rules) {
  let html = '';
  if (rules && rules.length) {
    html += '<strong>履约流程</strong><ul>';
    for (const r of rules) html += '<li>' + esc(RULE_LABEL[r.rule_type] || r.rule_type) + ':' + esc(r.text) + '</li>';
    html += '</ul>';
  }
  if (items && items.length) {
    html += '<strong>服务步骤</strong><ol>';
    for (const it of items) {
      const parts = [it.name];
      if (it.spec) parts.push(it.spec);
      if (it.qty) parts.push('x' + it.qty);
      if (it.duration) parts.push(it.duration);
      html += '<li>' + esc(parts.filter(Boolean).join(' · ')) + '</li>';
    }
    html += '</ol>';
  }
  return html || '<em>无服务流程数据</em>';
}

f.addEventListener('submit', async (e) => {
  e.preventDefault();
  table.classList.add('hidden'); dl.classList.add('hidden'); dl.innerHTML = ''; tbody.innerHTML = '';
  statusEl.textContent = '创建任务…';
  const r = await fetch('/jobs', { method: 'POST', headers: {'content-type':'application/json'},
    body: JSON.stringify({ url: document.getElementById('url').value }) });
  if (!r.ok) { statusEl.textContent = '创建失败:' + (await r.text()); return; }
  const { jobId } = await r.json();
  poll(jobId);
});

async function poll(jobId) {
  const r = await fetch('/jobs/' + jobId);
  const job = await r.json();
  statusEl.textContent = '状态:' + job.status;
  if (job.status === 'done') {
    const stats = job.stats_json ? JSON.parse(job.stats_json) : {};
    if (stats.shopUuid) await render(stats.shopUuid);
    return;
  }
  if (job.status === 'failed' || job.status === 'awaiting_human') {
    statusEl.textContent = '状态:' + job.status + (job.error ? '(' + job.error + ')' : '');
    return;
  }
  setTimeout(() => poll(jobId), 2000);
}

async function render(shopUuid) {
  const r = await fetch('/merchants/' + encodeURIComponent(shopUuid) + '/deals');
  const { deals } = await r.json();
  statusEl.textContent = '完成,共 ' + deals.length + ' 个团单(点击行展开服务流程)';
  for (const d of deals) {
    const tr = document.createElement('tr');
    tr.className = 'deal-row';
    for (const v of [d.title, d.price, d.market_price, d.sales_count, d.category]) {
      const td = document.createElement('td'); td.textContent = v == null ? '' : v; tr.appendChild(td);
    }
    const detail = document.createElement('tr');
    detail.className = 'detail hidden';
    const cell = document.createElement('td'); cell.colSpan = 5; detail.appendChild(cell);
    let loaded = false;
    tr.addEventListener('click', async () => {
      detail.classList.toggle('hidden');
      if (!loaded && !detail.classList.contains('hidden')) {
        loaded = true;
        cell.textContent = '加载中…';
        const pr = await fetch('/deals/' + encodeURIComponent(d.deal_id) + '/process');
        const { items, rules } = await pr.json();
        cell.innerHTML = renderProcess(items, rules);
      }
    });
    tbody.appendChild(tr); tbody.appendChild(detail);
  }
  table.classList.remove('hidden');
  for (const [label, path] of [
    ['团单 CSV', '/export/' + encodeURIComponent(shopUuid) + '.csv'],
    ['服务步骤 CSV', '/export/' + encodeURIComponent(shopUuid) + '/items.csv'],
    ['履约规则 CSV', '/export/' + encodeURIComponent(shopUuid) + '/rules.csv'],
  ]) {
    const a = document.createElement('a'); a.href = path; a.setAttribute('download',''); a.textContent = label;
    dl.appendChild(a);
  }
  dl.classList.remove('hidden');
}
</script>
</body>
</html>`;
