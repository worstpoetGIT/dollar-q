#!/usr/bin/env bash
# signs the Android file of a draft release with my own key and (only when asked) publishes it.
# the key never goes to GitHub: CI builds unsigned files into a draft release, and this runs on my own machine.
#
#   tools/sign-and-release.sh v0.3.1             sign and upload, the release stays a draft
#   tools/sign-and-release.sh v0.3.1 --publish   the same, then make it public
#
# needs: gh (logged in), apksigner (or APKSIGNER=...), KEYSTORE=/path/key.p12, KEYSTORE_PASS_FILE=/path/password.txt
set -euo pipefail

tag="${1:?usage: $0 vX.Y.Z [--publish]}"
publish="${2:-}"
repo="${REPO:-worstpoetGIT/dollar-q}"
apksigner="${APKSIGNER:-apksigner}"
: "${KEYSTORE:?set KEYSTORE to the .p12 file}" "${KEYSTORE_PASS_FILE:?set KEYSTORE_PASS_FILE to a file with the password}"
expected="$(tr -d ' \n' < "$(dirname "$0")/signing-cert.sha256")"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

gh release view "$tag" --repo "$repo" --json isDraft -q '.isDraft' | grep -qx true \
  || { echo "$tag is not a draft release. Nothing to sign." >&2; exit 1; }

gh release download "$tag" --repo "$repo" --dir "$work" --pattern 'DollarQ-unsigned.apk' --pattern 'DollarQ-unsigned.ipa'
"$apksigner" sign --ks "$KEYSTORE" --ks-pass "file:$KEYSTORE_PASS_FILE" --out "$work/DollarQ.apk" "$work/DollarQ-unsigned.apk"

# the signature has to verify, and has to be the same certificate as every earlier release, or phones refuse the update
"$apksigner" verify "$work/DollarQ.apk"
got="$("$apksigner" verify --print-certs "$work/DollarQ.apk" | sed -n 's/.*certificate SHA-256 digest: //p' | head -1)"
[ "$got" = "$expected" ] || { echo "wrong signing certificate: $got" >&2; exit 1; }
echo "signed with the usual key ($got)"

gh release upload "$tag" --repo "$repo" --clobber "$work/DollarQ.apk"
gh release delete-asset "$tag" DollarQ-unsigned.apk --repo "$repo" --yes

if [ "$publish" = "--publish" ]; then
  gh release edit "$tag" --repo "$repo" --draft=false --latest
  echo "published $tag"
else
  echo "still a draft. Look at it, then run again with --publish."
fi
