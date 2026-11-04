#!/usr/bin/env bash
# Install (or update) the Markdown Editor web server as a systemd service.
#
#   sudo ./deploy/install-service.sh --root /home/you/notes [--port 36660] [--token <str>] [--user you]
#
# Re-running the script updates the binary and unit and restarts the service.
# The token in /etc/markdown-editor.env is kept unless --token is given.
set -euo pipefail

ROOT=""
PORT="36660"
TOKEN=""
USER_NAME="${SUDO_USER:-$(id -un)}"
ENV_FILE=/etc/markdown-editor.env
UNIT=/etc/systemd/system/markdown-editor.service
BIN=/usr/local/bin/markdown-editor-server
HERE="$(cd "$(dirname "$0")/.." && pwd)"

while [ $# -gt 0 ]; do
  case "$1" in
    --root) ROOT="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    --user) USER_NAME="$2"; shift 2 ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then echo "sudo で実行してください" >&2; exit 1; fi
if [ -z "$ROOT" ]; then echo "--root <公開するフォルダ> を指定してください" >&2; exit 1; fi
ROOT="$(readlink -f "$ROOT")"
if [ ! -d "$ROOT" ]; then
  echo "フォルダを作成します: $ROOT"
  install -d -o "$USER_NAME" -g "$(id -gn "$USER_NAME")" "$ROOT"
fi

SRC_BIN="$HERE/target/release/markdown-editor-server"
if [ ! -x "$SRC_BIN" ]; then
  echo "先にビルドしてください: pnpm server:build  ($SRC_BIN がありません)" >&2
  exit 1
fi

# Keep an existing token so the URL and cookies stay valid across updates.
if [ -z "$TOKEN" ] && [ -f "$ENV_FILE" ]; then
  TOKEN="$(sed -n 's/^MDE_TOKEN=//p' "$ENV_FILE" | head -1)"
fi
if [ -z "$TOKEN" ]; then
  TOKEN="$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
fi

install -m 755 "$SRC_BIN" "$BIN"
umask 077
printf 'MDE_TOKEN=%s\nMDE_ROOT=%s\nMDE_PORT=%s\n' "$TOKEN" "$ROOT" "$PORT" > "$ENV_FILE"
chmod 600 "$ENV_FILE"
sed -e "s|__USER__|$USER_NAME|g" -e "s|__ROOT__|$ROOT|g" "$HERE/deploy/markdown-editor.service" > "$UNIT"

systemctl daemon-reload
systemctl enable --now markdown-editor.service
systemctl restart markdown-editor.service
sleep 1
systemctl --no-pager --lines=0 status markdown-editor.service || true

IP="$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^100\.' | head -1)"
IP="${IP:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
echo
echo "起動しました。ブラウザで開く URL:"
echo "  http://${IP:-<このマシンのアドレス>}:${PORT}/?token=${TOKEN}"
echo "設定: $ENV_FILE (トークン / フォルダ / ポート)   ログ: journalctl -u markdown-editor -f"
