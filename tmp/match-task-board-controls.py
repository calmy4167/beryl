from pathlib import Path
p=Path('src/styles/controls.css')
s=p.read_text(encoding='utf-8')
old='''/* The React task board uses compact native selectors, with different sizes in its toolbar and cards. */
html.tactile-ui #app .page-container .task-board-page .task-board-toolbar select {
  min-height: 38px;
  padding: 8px 10px;
  border-radius: 8px;
  background-color: var(--c-bg);
  background-image: none;
  appearance: auto;
}
html.tactile-ui #app .page-container .task-board-page .task-board-card-footer select {
  min-height: 0;
  padding: 5px 18px 5px 6px;
  border-radius: 6px;
  background-color: var(--c-bg);
  background-image: none;
  appearance: auto;
  color: var(--c-text-2);
  max-width: 88px;
}

'''
new='''/* Task board's native selectors inherit the same tactile field treatment in React. */
html.tactile-ui #app .page-container .task-board-page select {
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
if old not in s: raise SystemExit('old task-board control block not found')
s=s.replace(old,new)
p.write_text(s, encoding='utf-8')
