#!/usr/bin/env bash
# Rebuilds one case branch from its patch and runs its CI again.
# Usage: bash eval/rerun-case.sh ../playwright-reference-suite 10-expect-timeout-too-low
set -euo pipefail

suite=${1:?path to playwright-reference-suite}
name=${2:?case name, e.g. 10-expect-timeout-too-low}
patch="$(cd "$(dirname "$0")/cases" && pwd)/$name.patch"

cd "$suite"
git switch -q main
git pull -q --ff-only
git switch -q -C "eval/$name" main
git apply --cached "$patch"
git commit -q -m "eval: ${name#*-}"
git checkout -q -- .
git push -q -f -u origin "eval/$name"
gh workflow run ci.yml --ref "eval/$name"
git switch -q main
