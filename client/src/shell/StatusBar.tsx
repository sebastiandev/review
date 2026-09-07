type StatusBarProps = {
  /** Left text: `diff mode · {scope}`, `PR mode · worktree ready · {branch}`, or a transient message. */
  text: string
}

/** 26px status bar: the mode line on the left, `press ? for shortcuts` pushed right. */
export function StatusBar({ text }: StatusBarProps) {
  return (
    <footer className="statusbar">
      <span>{text}</span>
      <span className="statusbar-hint">press ? for shortcuts</span>
    </footer>
  )
}
