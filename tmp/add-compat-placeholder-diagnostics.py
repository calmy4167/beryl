from pathlib import Path
p=Path('tmp/recapture-one.mjs')
s=p.read_text(encoding='utf-8')
needle="const selectors=['.flow-page'"
replacement="const selectors=['.simple-page','.compatibility-placeholder-card','.beryl-card.empty-state','.flow-page'"
if needle not in s: raise SystemExit('diagnostic selector list marker not found')
s=s.replace(needle,replacement,1)
p.write_text(s, encoding='utf-8')
