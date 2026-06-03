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
  table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
  th, td { border: 1px solid #ddd; padding: .4rem .6rem; text-align: left; font-size: 14px; }
  th { background: #f5f5f5; }
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
  <a id="csv" class="hidden" download>下载 CSV</a>
  <table id="t" class="hidden"><thead><tr>
    <th>团单</th><th>现价</th><th>原价</th><th>已售</th><th>品类</th>
  </tr></thead><tbody></tbody></table>
<script>
const f = document.getElementById('f');
const statusEl = document.getElementById('status');
const table = document.getElementById('t');
const tbody = table.querySelector('tbody');
const csv = document.getElementById('csv');

f.addEventListener('submit', async (e) => {
  e.preventDefault();
  table.classList.add('hidden'); csv.classList.add('hidden'); tbody.innerHTML = '';
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
  statusEl.textContent = '完成,共 ' + deals.length + ' 个团单';
  for (const d of deals) {
    const tr = document.createElement('tr');
    for (const v of [d.title, d.price, d.market_price, d.sales_count, d.category]) {
      const td = document.createElement('td'); td.textContent = v == null ? '' : v; tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.classList.remove('hidden');
  csv.href = '/export/' + encodeURIComponent(shopUuid) + '.csv';
  csv.classList.remove('hidden');
}
</script>
</body>
</html>`;
