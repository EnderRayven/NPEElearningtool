#!/bin/bash
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_PATH="${1:-}"

if [[ -z "$APP_PATH" && -d "/Applications/NPEE Study Space.app" ]]; then
  APP_PATH="/Applications/NPEE Study Space.app"
fi

if [[ -z "$APP_PATH" ]]; then
  APP_PATH="$(find "$SCRIPT_DIR" -type d -name '*.app' -prune -print -quit 2>/dev/null)"
fi

if [[ -z "$APP_PATH" ]]; then
  APP_PATH="$(/usr/bin/osascript <<'APPLESCRIPT'
try
  set selectedItem to choose file with prompt "请选择要打开的 NPEE Study Space.app"
  return POSIX path of selectedItem
on error number -128
  return ""
end try
APPLESCRIPT
  )"
fi

if [[ -z "$APP_PATH" || ! -d "$APP_PATH" || "$APP_PATH" != *.app ]]; then
  echo "没有选择有效的 .app 应用。"
  echo "请把此命令文件放在应用旁边，或重新双击后选择 NPEE Study Space.app。"
  read -r -p "按回车键退出..."
  exit 1
fi

APP_PATH="$(cd "$APP_PATH" && pwd)"
echo "正在解除下载隔离：$APP_PATH"
if /usr/bin/xattr -p com.apple.quarantine "$APP_PATH" >/dev/null 2>&1; then
  if ! /usr/bin/xattr -dr com.apple.quarantine "$APP_PATH"; then
    echo "解除隔离失败，请确认你对该应用有读写权限。"
    read -r -p "按回车键退出..."
    exit 1
  fi
else
  echo "未检测到下载隔离属性，继续启动。"
fi

echo "正在启动应用..."
/usr/bin/open "$APP_PATH"
