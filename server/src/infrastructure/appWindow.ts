import { execFile } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
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
 * The app bundle Chrome/Vivaldi create when the user picks "Install Review" (a PWA shim under
 * `~/Applications/<Browser> Apps.localized/Review.app`). Its windows carry the Review icon in the Dock.
 */
export function findInstalledPwa(): string | null {
  if (process.platform !== 'darwin') return null
  const root = join(homedir(), 'Applications')
  if (!existsSync(root)) return null
  for (const dir of readdirSync(root)) {
    if (!/Apps(\.localized)?$/.test(dir)) continue
    const bundle = join(root, dir, 'Review.app')
    if (existsSync(bundle)) return bundle
  }
  return null
}

/**
 * Open the UI. `window` = the installed PWA when there is one (own Dock icon), else a Chromium
 * `--app` window with its own profile under the cache dir (a Chrome-branded window, never merged
 * into your browsing session); falls back to the default browser when neither exists. `tab` = default browser.
 */
export function openUi(url: string, mode: OpenMode, cacheDir: string, log: (line: string) => void = () => {}): void {
  if (mode === 'none') return
  if (mode === 'window') {
    const pwa = findInstalledPwa()
    if (pwa) {
      execFile('open', ['-a', pwa, url])
      return
    }
  }
  const app = mode === 'window' ? findChromiumApp() : null
  if (!app) {
    if (mode === 'window') log('no Chromium-based browser found for an app window; opening a tab')
    execFile(process.platform === 'darwin' ? 'open' : 'xdg-open', [url])
    return
  }
  const profile = join(cacheDir, 'app-window-profile')
  execFile('open', ['-na', app, '--args', `--app=${url}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check'])
  log(`tip: for a Review icon in the Dock, open ${url} in ${app} once and pick "Install Review" (address-bar install icon); \`review\` uses it from then on`)
}
