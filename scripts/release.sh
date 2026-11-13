#!/bin/zsh
# Publishes a Corner Cinema release on GitHub, from this Mac: builds the app, VMP-signs it with
# your castLabs EVS account (that's why it doesn't run on GitHub Actions: the account stays here),
# makes CornerCinema.dmg, tags the commit and attaches the disk image to a GitHub release.
#
# Usage: set the new version in package.json, commit, then `npm run release`.
#        DRY_RUN=1 npm run release  only builds CornerCinema.dmg, to check it.
# Needs: the EVS tool signed in (see the README's Build section), and the GitHub CLI (gh).
set -e
cd "$(dirname "$0")/.."
VERSION=$(node -p 'require("./package.json").version')
TAG="v$VERSION"
DMG=CornerCinema.dmg
APP="dist/mac-arm64/Corner Cinema.app"

if [[ -z "$DRY_RUN" ]]; then
    [[ -z "$(git status --porcelain)" ]] || { echo "Commit your changes first." >&2; exit 1; }
    if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
        echo "$TAG already exists: set a new version in package.json." >&2; exit 1
    fi
fi

# dmgbuild, in its own Python environment next to the project (ignored by git).
if [[ ! -x .dmgbuild/bin/dmgbuild ]]; then
    python3 -m venv .dmgbuild
    .dmgbuild/bin/pip install --quiet dmgbuild
fi

# The app, VMP-signed then signed ad hoc by scripts/evs.js; its build number is the commit count.
npx electron-builder --mac --dir -c.buildVersion="$(git rev-list --count HEAD)"
NAME="Corner Cinema" COLORS="3A3D66 262949 15172B" PATH="$PWD/.dmgbuild/bin:$PATH" \
    tools/make-dmg.sh "$APP" "$DMG"
hdiutil verify "$DMG" >/dev/null
echo "✓ $DMG ($VERSION, $(du -h "$DMG" | cut -f1))"
[[ -z "$DRY_RUN" ]] || exit 0

git tag -a "$TAG" -m "Corner Cinema $VERSION"
git push origin "$TAG"
gh release create "$TAG" "$DMG" --title "Corner Cinema $VERSION" --generate-notes
