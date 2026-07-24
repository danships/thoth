# Releasing Thoth

This document describes how releases and production Docker images are
produced for Thoth. It replaces any previous manual "draft a new release" or
"docker push" steps — those are deprecated in favor of the automated flow
below.

## Tagging convention

Releases are triggered by pushing a git tag to the repository. Two tag
formats are supported:

- **Stable release**: `vX.Y.Z` (e.g. `v1.4.0`) — a normal semver release.
- **Pre-release / beta**: `vX.Y.Z-betaN` (e.g. `v1.4.0-beta1`) — marked as a
  GitHub pre-release so it does not show up as "Latest release" and its
  Docker image does not receive the `:latest` tag.

Any other tag format (`v1.2`, `1.2.3`, `release-v1.2.3`, ...) is rejected by
the workflow and will not produce a release or image.

Tags can be pushed from **any branch**, including `main` or a `hotfix/*`
branch — hotfix releases are a valid, expected flow and are not restricted to
a particular branch.

## What happens when you push a tag

Pushing a `vX.Y.Z` or `vX.Y.Z-betaN` tag triggers the
[`.github/workflows/release.yml`](../.github/workflows/release.yml) workflow,
which runs three jobs in sequence:

1. **`validate-tag`** — verifies the tag matches the expected format. If it
   doesn't, the workflow fails immediately with a clear `::error::` message
   and no release or image is produced.
2. **`build-and-push-image`** — builds the production image from the root
   [`Dockerfile`](../Dockerfile) and pushes it to GitHub Container Registry
   (`ghcr.io/<owner>/<repo>`) tagged with the pushed tag name. **Only
   non-beta (stable) releases additionally receive the `:latest` tag.**
3. **`create-release`** — creates a GitHub Release for the tag with
   auto-generated release notes (`gh release create --generate-notes`),
   categorized using [`.github/release.yml`](../.github/release.yml). This
   job only runs if the image build succeeded.

```
push tag vX.Y.Z(-betaN)
        │
        ▼
  validate-tag  ──fails──▶ ❌ no release, no image
        │ passes
        ▼
build-and-push-image ──fails──▶ ❌ no release (create-release skipped)
        │ succeeds
        ▼
  create-release ──▶ ✅ GitHub Release published (pre-release flag set for betas)
```

Because `create-release` depends on `build-and-push-image`, **a release is
only ever created if the production Docker image builds and pushes
successfully.** A broken `Dockerfile` blocks the release entirely — the
`build-and-push-image` job fails (visible as a red X) and `create-release`
shows as "skipped" in the Actions UI.

## Release notes categorization

Auto-generated release notes are grouped into sections based on PR labels,
configured in [`.github/release.yml`](../.github/release.yml) (e.g.
`feature`/`enhancement` → "🚀 Features", `fix`/`bug` → "🐛 Bug Fixes",
`hotfix` → "🔥 Hotfixes", etc.). PRs merged without a matching label fall
into the catch-all "Other Changes" section. Labeling PRs appropriately is a
team responsibility — it is not enforced by the workflow.

## How to cut a release

1. Make sure `main` (or your hotfix branch) is in the state you want to
   release.
2. Create and push a tag:
   ```bash
   git tag v1.4.0
   git push origin v1.4.0
   ```
   For a beta/pre-release:
   ```bash
   git tag v1.4.0-beta1
   git push origin v1.4.0-beta1
   ```
   For a hotfix, tag the hotfix branch/commit the same way — no special
   handling is required.
3. Watch the **Release** workflow run in the Actions tab. Once it completes,
   the GitHub Release and the Docker image (`ghcr.io/<owner>/<repo>:v1.4.0`,
   plus `:latest` for stable releases) are available.

## Redoing a release (idempotency)

`gh release create` fails with a non-zero exit code if a release already
exists for that tag name — re-pushing or force-pushing the same tag will
**not** silently duplicate or overwrite an existing release. If you need to
redo a release:

1. Delete the existing GitHub Release for that tag.
2. Delete the tag itself, locally and on the remote:
   ```bash
   git tag -d v1.4.0
   git push origin :refs/tags/v1.4.0
   ```
3. Re-create and push the tag to re-trigger the workflow.

## Security notes

- The workflow's `GITHUB_TOKEN` permissions are scoped to `contents: write`
  (release creation) and `packages: write` (`ghcr.io` push) only.
- `docker/login-action` authenticates using the ephemeral, auto-scoped
  `GITHUB_TOKEN` — no long-lived PAT or additional secrets are required.
- Restricting who can push `v*` tags (e.g. via a tag-protection ruleset) is
  out of scope for this workflow and tracked separately.
