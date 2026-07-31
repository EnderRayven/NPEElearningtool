#!/bin/bash
set -e
cd "$(dirname "$0")"

export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:$PATH"

pause_on_error() {
  echo
  echo "环境配置失败。请复制上方错误信息后反馈。"
  read -r -p "按回车键退出..."
}
trap pause_on_error ERR

echo "[1/4] 检查运行环境..."
if ! command -v brew >/dev/null 2>&1; then
  echo "未检测到 Homebrew，正在自动安装..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
fi

if ! command -v node >/dev/null 2>&1 || ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 13) ? 0 : 1)' >/dev/null 2>&1; then
  echo "正在安装或升级 Node.js 22.13+..."
  if brew list --versions node >/dev/null 2>&1; then
    brew upgrade node
  else
    brew install node
  fi
  hash -r
fi

if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 13) ? 0 : 1)' >/dev/null 2>&1; then
  echo "Node.js 版本仍低于 22.13，请更新 PATH 后重试。"
  exit 1
fi

echo "[2/4] 检查包管理器..."
if ! command -v pnpm >/dev/null 2>&1; then
  echo "正在安装 pnpm..."
  npm install --global pnpm
fi

echo "[3/4] 安装或更新项目依赖..."
pnpm install

echo "[4/4] 启动考研学习空间..."
(sleep 2; open "http://127.0.0.1:5173/") &
exec pnpm start
