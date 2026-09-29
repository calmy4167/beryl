from pathlib import Path
p=Path('src/styles/controls.css')
s=p.read_text(encoding='utf-8')
needle='/* Task board\'s native selectors inherit the same tactile field treatment in React. */'
block='''/* The task form's native matter selector follows the same tactile treatment as React. */
html.tactile-ui #app .page-container .tasks-page select {
  min-height: 40px;
  padding: 9px 11px;
  border: 1px solid #dce3ed;
  border-radius: var(--t-radius-sm);
  color: var(--t-text);
  background: #f8fafc;
  background-image: none;
  box-shadow: inset 0 1px 2px rgba(31, 44, 71, .025);
  appearance: auto;
}

'''
if block not in s: s=s.replace(needle,block+needle)
p.write_text(s, encoding='utf-8')
