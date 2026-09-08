import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** Chromium-based browsers that honour `--app=<url>`, in preference order. */
const CHROMIUM_APPS = ['Google Chrome', 'Vivaldi', 'Brave Browser', 'Microsoft Edge', 'Chromium', 'Arc']

export type OpenMode = 'window' | 'tab' | 'none'

/** The first installed Chromium app, or null. macOS only; other platforms fall back to a tab. */
export function findChromiumApp(): string | null {
  if (process.platform !== 'darwin') return null
  return CHROMIUM_APPS.find((name) => existsSync(`/Applications/${name}.app`)) ?? null
}

/**
 * Open the UI. `window` = a standalone app window (Chromium `--app`, its own profile under the
 * cache dir so it gets its own Dock icon and never merges into your browsing session);
 * falls back to the default browser when no Chromium app is installed. `tab` = default browser.
 */
export function openUi(url: string, mode: OpenMode, cacheDir: string, log: (line: string) => void = () => {}): void {
  if (mode === 'none') return
  const app = mode === 'window' ? findChromiumApp() : null
  if (!app) {
    if (mode === 'window') log('no Chromium-based browser found for an app window; opening a tab')
    execFile(process.platform === 'darwin' ? 'open' : 'xdg-open', [url])
    return
  }
  const profile = join(cacheDir, 'app-window-profile')
  execFile('open', ['-na', app, '--args', `--app=${url}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check'])
}
