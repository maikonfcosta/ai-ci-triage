#!/usr/bin/env bash
# Creates one branch per case on playwright-reference-suite and runs its CI there.
# Usage: bash eval/make-branches.sh ../playwright-reference-suite
set -euo pipefail

suite=${1:?path to playwright-reference-suite}
cases=$(cd "$(dirname "$0")/cases" && pwd)

cd "$suite"
git switch -q main
git pull -q --ff-only

for patch in "$cases"/*.patch; do
  name=$(basename "$patch" .patch)
  branch="eval/$name"
  git switch -q -C "$branch" main
  # --cached: the patches are LF and a Windows checkout may be CRLF; the index is what gets committed.
  git apply --cached "$patch"
  git commit -q -m "eval: ${name#*-}"
  git checkout -q -- .
  git push -q -f -u origin "$branch"
  gh workflow run ci.yml --ref "$branch"
  echo "$branch pushed, CI started"
done

git switch -q main
