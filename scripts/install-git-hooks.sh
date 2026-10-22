#!/bin/sh
# Reinstall local hooks that strip/block Cursor git attribution.
set -e
root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
hooks="$root/.git/hooks"
mkdir -p "$hooks"

cat > "$hooks/commit-msg" <<'EOF'
#!/bin/sh
msg="$1"
tmp="${msg}.tmp.$$"
grep -viE '^(Co-authored-by:[[:space:]]*Cursor\b|Made-with:[[:space:]]*Cursor\b|Co-authored-by:.*cursoragent@cursor\.com)' "$msg" > "$tmp" && mv "$tmp" "$msg"
exit 0
EOF

cat > "$hooks/pre-push" <<'EOF'
#!/bin/sh
z40=0000000000000000000000000000000000000000
while read local_ref local_sha remote_ref remote_sha
do
  if [ "$local_sha" = "$z40" ]; then
    continue
  fi
  if [ "$remote_sha" = "$z40" ]; then
    range="$local_sha"
  else
    range="$remote_sha..$local_sha"
  fi
  if git log --format='%B' "$range" 2>/dev/null | grep -qiE '^(Co-authored-by:[[:space:]]*Cursor|Made-with:[[:space:]]*Cursor|Co-authored-by:.*cursoragent@cursor\.com)'; then
    echo "ERROR: push blocked — commit message contains Cursor attribution." >&2
    exit 1
  fi
done
exit 0
EOF

chmod +x "$hooks/commit-msg" "$hooks/pre-push"
echo "Installed commit-msg + pre-push hooks (strip/block Cursor attribution)."
