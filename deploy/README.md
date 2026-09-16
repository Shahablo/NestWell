# Deploying

The site is published to GitHub Pages from the `gh-pages` branch: `npm run build`, then push the
contents of `dist/` to `gh-pages` (see `scripts/deploy-gh-pages.sh`).

`github-actions-pages.yml` is the equivalent GitHub Actions workflow. It lives here instead of
`.github/workflows/` only because the token used for the first push lacked the `workflow` scope;
move it back to `.github/workflows/deploy.yml` (and switch the Pages source to "GitHub Actions")
once a token with that scope is available.
