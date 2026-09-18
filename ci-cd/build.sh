#!/usr/bin/env bash
# Build NeuraSync.
#
#   ./ci-cd/build.sh              package the extension (.vsix)
#   ./ci-cd/build.sh --check      tests and a production compile, package nothing
#   ./ci-cd/build.sh --all        check, then package
#   ./ci-cd/build.sh --install    package, then install into this machine's VS Code
#
# The version is bumped before every package — patch by default, so 1.16.4
# becomes 1.16.5. Change what kind with BUMP, or hold it still with --no-bump:
#
#   BUMP=minor ./ci-cd/build.sh
#   BUMP=1.2.3 ./ci-cd/build.sh
#   ./ci-cd/build.sh --no-bump    rebuild the version already in package.json
#
# The .vsix is written to the project root and copied to the Downloads folder.
# Publish it with ci-cd/publish.sh.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

bar()  { echo "============================================"; }
note() { echo "[note]  $*"; }
err()  { echo "[error] $*" >&2; }

RUN_CHECKS=false
RUN_BUILD=true
INSTALL=false
BUMP="${BUMP:-patch}"
for arg in "$@"; do
    case "$arg" in
        --check)   RUN_CHECKS=true; RUN_BUILD=false ;;
        --all)     RUN_CHECKS=true ;;
        --no-bump) BUMP="" ;;
        --install) INSTALL=true ;;
        *)         err "Unknown option: $arg"; exit 1 ;;
    esac
done

# A global vsce if there is one; otherwise npx. --yes matters: without it npx
# stops at "Ok to proceed?" on a first run and the build looks hung.
vsce() {
    if type -P vsce >/dev/null; then
        command vsce "$@"
    else
        npx --yes @vscode/vsce "$@"
    fi
}

version() { node -p "require('./package.json').version"; }

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
check_prerequisites() {
    command -v node >/dev/null 2>&1 || { err "Missing node (https://nodejs.org)"; exit 1; }

    if [ ! -d node_modules ]; then
        note "Installing npm dependencies"
        npm ci
    fi
}

# ---------------------------------------------------------------------------
# Checks
#
# There is no separate typecheck: plain `tsc` trips over third-party .d.ts files
# newer than this project's TypeScript, while webpack's ts-loader checks our own
# sources — so the production compile is the typecheck.
# ---------------------------------------------------------------------------
run_checks() {
    bar; echo "  Tests"; bar
    # --forceExit: the transfer tests leave a memfs timer running, and jest
    # otherwise waits on it after reporting.
    npx jest --forceExit

    bar; echo "  Production compile"; bar
    npm run compile
}

# ---------------------------------------------------------------------------
# Package
# ---------------------------------------------------------------------------
package_extension() {
    bar; echo "  Packaging the extension"; bar

    # Before packaging, so the .vsix carries the new number. The Marketplace
    # rejects a version it already has, so reusing one only fails later.
    if [ -n "$BUMP" ]; then
        npm version "$BUMP" --no-git-tag-version >/dev/null
        note "Version is now $(version)"
        note "That is an uncommitted change — commit it before ci-cd/publish.sh."
    else
        note "Packaging version $(version), unchanged."
    fi

    local vsix="neurasync-$(version).vsix"
    # vsce runs `vscode:prepublish` (the production compile) itself.
    vsce package --out "$vsix"

    # Where to drop the package, per platform.
    local downloads=""
    case "$(uname -s)" in
        MINGW*|MSYS*|CYGWIN*) downloads="$(cygpath -u "$USERPROFILE")/Downloads" ;;
        Linux*)
            if grep -qi microsoft /proc/version 2>/dev/null; then
                win_user="$(cmd.exe /c 'echo %USERNAME%' 2>/dev/null | tr -d '\r')"
                downloads="/mnt/c/Users/$win_user/Downloads"
            else
                downloads="$HOME/Downloads"
            fi
            ;;
        Darwin*) downloads="$HOME/Downloads" ;;
    esac

    echo
    bar; echo "  Artifact"; bar
    echo "  $PROJECT_ROOT/$vsix"
    if [ -n "$downloads" ] && [ -d "$downloads" ]; then
        cp -f "$vsix" "$downloads/" && echo "    -> copied to $downloads"
    fi

    if $INSTALL; then
        if command -v code >/dev/null 2>&1; then
            echo
            note "Installing into VS Code — reload the window to pick it up."
            code --install-extension "$vsix" --force
        else
            err "'code' is not on PATH; install $vsix from the Extensions view instead."
        fi
    fi
}

bar
echo "  NeuraSync — build"
bar

check_prerequisites
$RUN_CHECKS && run_checks
$RUN_BUILD && package_extension

echo
bar
echo "  DONE"
bar
