#!/usr/bin/env bash
# Sets one key in an env file, or lists which keys differ between two env files.
# Module 13 (2026-11-03). deploy/README.md section 13 is the procedure.
#
#   bash env-set.sh FILE KEY          asks for the value twice, hidden
#   bash env-set.sh --diff OLD NEW    prints the names of the keys that differ
#
# NOTHING HERE PRINTS A VALUE OR ITS LENGTH. The value is typed at a hidden
# prompt, so it is in no command line and no shell history. It reaches awk
# through awk's own environment, never its arguments, so `ps` cannot show it.
#
# ONE WHOLE LINE IS REPLACED, and every other line stays as it was. An append
# with sed would land after a Windows line's \r, and dotenv reads that \r as a
# line break (dotenv/lib/main.js), so the end of the value would be lost with
# no error. The repo must hold this file as LF, for the VPS's bash:
#   git ls-files --eol deploy/env-set.sh     shows i/lf
# Git Bash on the laptop also ran a CRLF copy correctly, byte for byte.

set -u
umask 077

stop() {
  printf 'STOP: %s\n' "$1"
  exit 1
}

usage() {
  printf 'usage: bash env-set.sh FILE KEY | --diff OLD NEW\n'
  exit 2
}

# Tracing would print the value.
case "$-" in
  *x*) stop 'do not trace this script.' ;;
esac

KEY_LINE='^[A-Za-z_][A-Za-z0-9_]*='

if [ "${1:-}" = '--diff' ]; then
  [ "$#" -eq 3 ] || usage
  [ -s "$2" ] || stop 'the first file is missing or empty.'
  [ -s "$3" ] || stop 'the second file is missing or empty.'
  # The line's \r goes first, so a line ending alone is not a difference. A key
  # that only one file holds is a difference too. Names only.
  awk -F= -v key_line="$KEY_LINE" '
    { sub(/\r$/, "") }
    $0 !~ key_line { next }
    NR == FNR { old[$1] = $0; next }
    { seen[$1] = 1; if (!($1 in old) || old[$1] != $0) print $1 }
    END { for (name in old) if (!(name in seen)) print name }
  ' "$2" "$3" | sort -u
  exit 0
fi

[ "$#" -eq 2 ] || usage
file=$1
key=$2

case "$key" in
  [A-Za-z_]*) ;;
  *) stop 'the key name is not valid.' ;;
esac
case "$key" in
  *[!A-Za-z0-9_]*) stop 'the key name is not valid.' ;;
esac

[ -f "$file" ] || stop 'the file is missing.'

lines=$(grep -c "^$key=" "$file")
[ "$lines" = '1' ] || stop "$key is on $lines lines, not one. Nothing was written."

IFS= read -rs -p "$key (hidden): " first || stop 'no value was read. Nothing was written.'
printf '\n'
IFS= read -rs -p 'again: ' second || stop 'no second value was read. Nothing was written.'
printf '\n'

[ "$first" = "$second" ] || stop 'the two entries differ. Nothing was written.'
[ -n "$first" ] || stop 'the value is empty. Nothing was written.'

# Each of these changes what dotenv reads: # starts a comment, a leading quote
# starts a quoted value, and spaces are trimmed.
case "$first" in
  *[[:space:]]* | *'#'* | *"'"* | *'"'* | *'`'* | *'\'*)
    stop 'the value holds a space, #, quote, backtick or backslash. Nothing was written.'
    ;;
esac

if [ "$key" = 'SMS_ENCRYPTION_PASSPHRASE' ] && [ "${#first}" -lt 24 ]; then
  stop 'the passphrase is under 24 characters. Nothing was written.'
fi

tmp=$(mktemp "$file.XXXXXX") || stop 'no temporary file. Nothing was written.'
trap 'rm -f "$tmp"' EXIT

# BINMODE stops Git Bash's gawk dropping the \r of the other lines; mawk on the
# VPS has no such step and treats it as an unused variable.
ENV_SET_VALUE=$first awk -v BINMODE=3 -v key="$key" '
  index($0, key "=") == 1 { print key "=" ENVIRON["ENV_SET_VALUE"]; next }
  { print }
' "$file" > "$tmp" || stop 'the copy failed. Nothing was written.'

# The same number of lines, and the line now holds exactly what was typed.
before=$(awk 'END { print NR }' "$file")
after=$(awk 'END { print NR }' "$tmp")
[ "$before" = "$after" ] || stop 'the line count moved. Nothing was written.'

ENV_SET_VALUE=$first awk -v key="$key" '
  index($0, key "=") == 1 && substr($0, length(key) + 2) "" == ENVIRON["ENV_SET_VALUE"] "" { found = 1 }
  END { exit !found }
' "$tmp" || stop 'the new line does not match what was typed. Nothing was written.'

chmod 600 "$tmp" || stop 'the file mode could not be set. Nothing was written.'
mv -f "$tmp" "$file" || stop 'the file could not be replaced. Nothing was written.'
printf '%s: set\n' "$key"
