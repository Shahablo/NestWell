#!/usr/bin/env bash
# Build and publish dist/ to the gh-pages branch (GitHub Pages, branch source).
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
rm -rf .gh-pages-tmp && mkdir .gh-pages-tmp && cp -r dist/. .gh-pages-tmp/ && touch .gh-pages-tmp/.nojekyll
cd .gh-pages-tmp && git init -q -b gh-pages && git add -A && git -c user.name="$(git -C .. config user.name)" -c user.email="$(git -C .. config user.email)" commit -q -m "Publish $(git -C .. rev-parse --short HEAD)" && git -c credential.helper= -c "credential.helper=!gh auth git-credential" push -f "$(git -C .. remote get-url origin)" gh-pages:gh-pages
cd .. && rm -rf .gh-pages-tmp
