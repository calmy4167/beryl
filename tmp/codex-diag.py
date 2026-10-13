"""只读诊断 Codex 本地状态：日志里的报错 + 线程体量。
绝不写入任何文件；sqlite 一律用 mode=ro 打开。"""
import sqlite3, json, os, glob, re, sys

home = os.path.expanduser('~')
codex = os.path.join(home, '.codex')

def ro(path):
    return sqlite3.connect(f'file:{path}?mode=ro', uri=True)

def tables(con):
    return [r[0] for r in con.execute("select name from sqlite_master where type='table'")]

print('=== 目录 ===')
print(codex)
for f in sorted(glob.glob(os.path.join(codex, '*'))):
    if os.path.isfile(f):
        print(f'  {os.path.basename(f):<38} {os.path.getsize(f):>14,} B')

for name in ('logs_2.sqlite', 'thread_history_1.sqlite', 'state_5.sqlite'):
    path = os.path.join(codex, name)
    if not os.path.exists(path):
        continue
    print(f'\n=== {name} ===')
    try:
        con = ro(path)
        tl = tables(con)
        print('  tables:', ', '.join(tl))
        for t in tl:
            try:
                n = con.execute(f'select count(*) from "{t}"').fetchone()[0]
                print(f'    {t:<34} rows={n:,}')
            except Exception as e:
                print(f'    {t:<34} count failed: {e}')
        con.close()
    except Exception as e:
        print('  open failed:', e)

# 日志里找最近的报错
print('\n=== logs: 含 disconnected / stream / error 的最近记录 ===')
try:
    con = ro(os.path.join(codex, 'logs_2.sqlite'))
    tl = tables(con)
    text_cols = {}
    for t in tl:
        cols = [r[1] for r in con.execute(f'pragma table_info("{t}")')]
        cand = [c for c in cols if any(k in c.lower() for k in ('message', 'msg', 'text', 'body', 'payload', 'event', 'data', 'log'))]
        if cand:
            text_cols[t] = (cols, cand)
    print('  候选日志表:', {t: v[1] for t, v in text_cols.items()})
    for t, (cols, cand) in list(text_cols.items())[:4]:
        order = 'rowid'
        for c in cols:
            if c.lower() in ('ts', 'timestamp', 'time', 'created_at', 'at'):
                order = c
                break
        where = ' or '.join([f'"{c}" like ?' for c in cand])
        params = ['%disconnect%'] * len(cand)
        try:
            rows = con.execute(f'select rowid, * from "{t}" where {where} order by {order} desc limit 6', params).fetchall()
            print(f'\n  -- {t}: {len(rows)} 行含 disconnect（列: {", ".join(cols)[:180]}）')
            for r in rows:
                s = str(r)
                print('   ', s[:600].replace('\n', ' '))
        except Exception as e:
            print(f'  {t} query failed: {e}')
        # 也找 request id
        for rid in ('8cbb3e9f',):
            params2 = [f'%{rid}%'] * len(cand)
            try:
                rows = con.execute(f'select rowid, * from "{t}" where {where} order by {order} desc limit 3', params2).fetchall()
                if rows:
                    print(f'\n  -- {t}: {len(rows)} 行含 request id {rid}')
                    for r in rows:
                        print('   ', str(r)[:600].replace('\n', ' '))
            except Exception as e:
                pass
    con.close()
except Exception as e:
    print('  logs 诊断失败:', e)

# 线程体量
print('\n=== 线程体量（thread_history）===')
try:
    con = ro(os.path.join(codex, 'thread_history_1.sqlite'))
    tl = tables(con)
    print('  tables:', tl)
    for t in tl:
        cols = [r[1] for r in con.execute(f'pragma table_info("{t}")')]
        if not any(c.lower() in ('thread_id', 'conversation_id', 'id') for c in cols):
            continue
        idc = next(c for c in cols if c.lower() in ('thread_id', 'conversation_id', 'id'))
        size_col = next((c for c in cols if any(k in c.lower() for k in ('payload', 'content', 'body', 'text', 'json', 'data'))), None)
        if size_col:
            try:
                rows = con.execute(
                    f'select "{idc}", sum(length("{size_col}")) as sz, count(*) as n from "{t}" group by "{idc}" order by sz desc limit 6'
                ).fetchall()
                print(f'  -- {t} 最大线程（按 {size_col} 字节）:')
                for rid, sz, n in rows:
                    print(f'     {rid}  {sz:>14,} B  rows={n:,}')
            except Exception as e:
                print(f'  {t} size query failed: {e}')
        else:
            try:
                rows = con.execute(f'select "{idc}", count(*) n from "{t}" group by "{idc}" order by n desc limit 6').fetchall()
                print(f'  -- {t} 行数最多的线程:', rows)
            except Exception as e:
                print(f'  {t} count query failed: {e}')
    con.close()
except Exception as e:
    print('  线程体量诊断失败:', e)
