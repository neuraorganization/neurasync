#!/usr/bin/env bash
# Publish a packaged NeuraSync to the VS Code Marketplace.
#
#   ./ci-cd/publish.sh               publish neurasync-<package.json version>.vsix
#   ./ci-cd/publish.sh --dry-run     run every check, publish nothing
#
# Build first with ci-cd/build.sh. This script uploads that exact .vsix rather
# than repackaging, so what was tested is what ships.
#
# Needs a Marketplace token: either `vsce login neuraorganization` once, or
# VSCE_PAT in the environment for a single run:
#
#   VSCE_PAT=... ./ci-cd/publish.sh

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

bar()  { echo "============================================"; }
note() { echo "[note]  $*"; }
err()  { echo "[error] $*" >&2; }

DRY_RUN=false
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        *)         err "Unknown option: $arg"; exit 1 ;;
    esac
done

vsce() {
    if type -P vsce >/dev/null; then
        command vsce "$@"
    else
        npx --yes @vscode/vsce "$@"
    fi
}

VERSION="$(node -p "require('./package.json').version")"
PUBLISHER="$(node -p "require('./package.json').publisher")"
NAME="$(node -p "require('./package.json').name")"
VSIX="neurasync-$VERSION.vsix"
TAG="v$VERSION"

bar
echo "  NeuraSync — publish $VERSION"
bar
$DRY_RUN && note "Dry run: nothing will be published or tagged."

if [ ! -f "$VSIX" ]; then
    err "No $VSIX. Build it first:  ./ci-cd/build.sh"
    exit 1
fi

# The published build should be a commit anyone can check out again. build.sh
# leaves the version bump uncommitted on purpose; this is where that is caught.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    err "Uncommitted changes. Commit the release (including the version bump) first:"
    git status --short --untracked-files=no >&2
    exit 1
fi

# The Marketplace refuses a version it already has, but only after the upload.
# Asking first gives a clearer error and catches a forgotten bump.
published="$(vsce show "$PUBLISHER.$NAME" --json 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).versions.map(v=>v.version).join(" "))}catch{}})' \
    || true)"
if [[ " $published " == *" $VERSION "* ]]; then
    err "$VERSION is already on the Marketplace. Bump it:  ./ci-cd/build.sh"
    exit 1
fi
note "Marketplace has: ${published:-(could not check)}"

if $DRY_RUN; then
    note "Would publish $VSIX as $PUBLISHER.$NAME and tag $TAG."
    exit 0
fi

vsce publish --packagePath "$VSIX"

# npm version tags on its own; build.sh bumps without tagging, so tag here.
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
    note "Tag $TAG already exists."
else
    git tag "$TAG"
    note "Tagged $TAG — push it with:  git push origin main --tags"
fi

echo
bar
echo "  Published $PUBLISHER.$NAME $VERSION"
echo "  https://marketplace.visualstudio.com/items?itemName=$PUBLISHER.$NAME"
bar
