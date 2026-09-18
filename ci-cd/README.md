# ci-cd

NeuraSync is a VS Code extension, so there is no server to deploy: a release is
a `.vsix` package uploaded to the Marketplace.

| Script | What it does |
| --- | --- |
| `build.sh` | Bump the version, compile and package `neurasync-<version>.vsix` |
| `publish.sh` | Upload that `.vsix` to the Marketplace and tag the release |
| `make-icon.mjs` | Regenerate `resources/icon.png` and `resources/remote-explorer.svg` |

## Releasing

```bash
./ci-cd/build.sh --all                  # tests + compile, bump patch, package
git commit -am "Release 1.16.5"         # the bump is left uncommitted on purpose
./ci-cd/publish.sh --dry-run            # checks only
./ci-cd/publish.sh                      # upload and tag v1.16.5
git push origin main --tags
```

`build.sh` bumps the patch version by default. Choose another bump with `BUMP`,
or keep the current number with `--no-bump`:

```bash
BUMP=minor ./ci-cd/build.sh
BUMP=2.0.0 ./ci-cd/build.sh
./ci-cd/build.sh --no-bump
```

The package is written to the project root (gitignored) and copied to the
Downloads folder. On WSL that is the Windows user's Downloads.

## Trying a build locally

```bash
./ci-cd/build.sh --no-bump --install    # package and install into VS Code
./ci-cd/build.sh --check                # tests and compile only
```

Reload the VS Code window after `--install`. While working on the code,
`npm run dev` rebuilds on save, and F5 opens an Extension Development Host.

## The Marketplace token

`publish.sh` needs a Personal Access Token for the `neuraorganization`
publisher. Save it once:

```bash
npx @vscode/vsce login neuraorganization
```

or pass it for one run with `VSCE_PAT=... ./ci-cd/publish.sh`. To create one,
go to dev.azure.com, then User settings, then Personal access tokens. Choose
**All accessible organizations** and the **Marketplace → Manage** scope.
Tokens expire, so a publish that suddenly fails with 401 needs a new token.

`publish.sh` refuses to run with uncommitted changes, and refuses a version the
Marketplace already has. It uploads the exact `.vsix` that `build.sh` made,
with no repackaging.

## Tests

`npx jest` runs the unit tests. The `sync --update with time offset` test is
skipped. The in-memory filesystem used by the tests (memfs) closes the upload's
file descriptor early, so that test's upload never lands. Real `fs` does not
do this. See the comment on the test.
