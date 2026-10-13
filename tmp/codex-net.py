"""读 Codex 配置里与网络/模型相关的键（严格脱敏），并量出失败线程的历史体量。只读。"""
import os, re, sqlite3

home = os.path.expanduser('~')
codex = os.path.join(home, '.codex')
cfg = os.path.join(codex, 'config.toml')

SECRET = re.compile(r'(sk-[A-Za-z0-9_\-]{6,}|Bearer\s+\S+|[A-Za-z0-9_\-]{32,})')

def redact(s: str) -> str:
    return SECRET.sub(lambda m: m.group(0)[:6] + '…<%d chars>' % len(m.group(0)), s)

print('=== config.toml（只显示与网络/模型相关的行，其余打码）===')
keep = ('model', 'base_url', 'wire_api', 'provider', 'reasoning', 'stream', 'timeout', 'retry',
        'env_key', 'env_http', 'query_params', 'http_headers', 'disable_response_storage',
        'model_reasoning_effort', 'model_verbosity', 'compact', 'history', 'mcp_servers', 'notify')
with open(cfg, 'r', encoding='utf-8', errors='replace') as f:
    for i, line in enumerate(f, 1):
        low = line.lower()
        if any(k in low for k in keep):
            print(f'  {i:>4}: {redact(line.rstrip())[:180]}')
        elif line.strip().startswith('['):
            print(f'  {i:>4}: {line.rstrip()[:120]}')

print('\n=== 失败线程的历史体量 ===')
tid = '01a12b3f-81a7-7a81-a6a1-6c8bfee12023'
con = sqlite3.connect(f'file:{os.path.join(codex, "thread_history_1.sqlite")}?mode=ro', uri=True)
cols = [r[1] for r in con.execute('pragma table_info(thread_items)')]
print('  thread_items 列:', cols)
idc = 'thread_id' if 'thread_id' in cols else cols[0]
jc = next((c for c in cols if 'json' in c.lower() or 'payload' in c.lower() or 'content' in c.lower()), cols[-1])
row = con.execute(f'select count(*), sum(length("{jc}")), max(length("{jc}")) from thread_items where "{idc}"=?', (tid,)).fetchone()
print(f'  失败线程 items={row[0]:,}  合计={row[1] or 0:,} B  最大单条={row[2] or 0:,} B')

print('\n  -- 各线程体量前 8（item_json 字节）--')
for rid, sz, n in con.execute(f'select "{idc}", sum(length("{jc}")) s, count(*) c from thread_items group by "{idc}" order by s desc limit 8'):
    mark = '  <== 失败线程' if rid == tid else ''
    print(f'     {rid}  {sz:>13,} B  items={n:>6,}{mark}')

print('\n=== thread_turns 里最近的错误 ===')
tcols = [r[1] for r in con.execute('pragma table_info(thread_turns)')]
print('  thread_turns 列:', tcols)
if 'error_json' in tcols:
    for r in con.execute(f'select thread_id, error_json from thread_turns where "{idc}"=? and error_json is not null order by rowid desc limit 4', (tid,)):
        print('   ', str(r)[:400].replace('\n', ' '))
con.close()
