#!/usr/bin/env bash
# Launches the Chrome DevTools MCP server with a Chrome this machine actually has.
#
# The server is happy to find its own Chrome on a laptop, and cannot on a cloud
# container, where the only browser is the one Playwright unpacked into
# /opt/pw-browsers and nothing is on PATH. Rather than pin a path that is right
# in one place and wrong in the other, this looks for each in turn and passes
# --executablePath only when it found something. The version directory is
# globbed, so a Playwright update does not silently break the browser.
set -euo pipefail

args=(--isolated --viewport 1280x800)

# Google collects usage statistics by default. This is a private CRM; opt out.
args+=(--usageStatistics false)

find_chrome() {
  # An explicit choice always wins.
  if [[ -n "${CHROME_PATH:-}" && -x "${CHROME_PATH}" ]]; then
    printf '%s' "${CHROME_PATH}"
    return 0
  fi

  local candidate
  for candidate in \
    "${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"/chromium-*/chrome-linux/chrome \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/usr/bin/google-chrome" \
    "/usr/bin/chromium" \
    "/usr/bin/chromium-browser"
  do
    if [[ -x "${candidate}" ]]; then
      printf '%s' "${candidate}"
      return 0
    fi
  done

  return 1
}

if chrome="$(find_chrome)"; then
  args+=(--executablePath "${chrome}")
fi

# No display means no window to put a browser in, so headless is the only thing
# that can work. On a laptop the visible browser is the point.
if [[ -z "${DISPLAY:-}" ]]; then
  args+=(--headless)
  # A container has no user namespaces for Chrome's own sandbox to use, and its
  # /dev/shm is typically 64MB, which Chrome exhausts on a real page.
  args+=(--chromeArg=--no-sandbox --chromeArg=--disable-dev-shm-usage)
fi

exec npx -y chrome-devtools-mcp@latest "${args[@]}" "$@"
