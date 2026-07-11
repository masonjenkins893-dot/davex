#!/usr/bin/env bash
set -e

# ============================================================
#  DaveX Installer
#  Made by Inyang David @ Sixpert
#  https://github.com/masonjenkins893-dot/davex
# ============================================================

DAVEX_VERSION="1.0.0"
REPO_URL="https://github.com/masonjenkins893-dot/davex.git"
INSTALL_DIR="$HOME/.davex/app"
MIN_NODE_VERSION=20

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

print_logo() {
  echo ""
  echo -e "${CYAN}${BOLD}"
  echo '    ██████╗  █████╗ ██╗   ██╗███████╗██╗  ██╗'
  echo '    ██╔══██╗██╔══██╗██║   ██║██╔════╝╚██╗██╔╝'
  echo '    ██║  ██║███████║██║   ██║█████╗   ╚███╔╝ '
  echo '    ██║  ██║██╔══██║╚██╗ ██╔╝██╔══╝   ██╔██╗ '
  echo '    ██████╔╝██║  ██║ ╚████╔╝ ███████╗██╔╝ ██╗'
  echo '    ╚═════╝ ╚═╝  ╚═╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝'
  echo -e "${NC}"
  echo -e "    ${BOLD}AI Coding Agent v${DAVEX_VERSION}${NC}"
  echo -e "    ${BLUE}By Inyang David @ Sixpert${NC}"
  echo ""
}

log_info()    { echo -e "  ${BLUE}ℹ${NC}  $1"; }
log_success() { echo -e "  ${GREEN}✓${NC}  $1"; }
log_warn()    { echo -e "  ${YELLOW}⚠${NC}  $1"; }
log_error()   { echo -e "  ${RED}✗${NC}  $1"; }
log_step()    { echo -e "\n  ${CYAN}${BOLD}→${NC}  ${BOLD}$1${NC}"; }

print_logo

echo -e "  ${BOLD}Installing DaveX...${NC}"
echo ""

# ── Check OS ────────────────────────────────────────────────
log_step "Checking system"

OS="$(uname -s)"
ARCH="$(uname -m)"
log_info "OS: $OS ($ARCH)"

# ── Check git ───────────────────────────────────────────────
log_step "Checking git"

if ! command -v git &>/dev/null; then
  log_error "git is required but not found. Please install git first."
  exit 1
fi
log_success "git found"

# ── Check / Install Node.js ─────────────────────────────────
log_step "Checking Node.js"

install_node() {
  log_warn "Node.js not found. Installing via nvm..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1090
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  nvm install --lts
  nvm use --lts
  log_success "Node.js installed via nvm"
}

if command -v node &>/dev/null; then
  NODE_VER=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
  if [ "$NODE_VER" -lt "$MIN_NODE_VERSION" ]; then
    log_warn "Node.js v$NODE_VER found but v${MIN_NODE_VERSION}+ required"
    install_node
  else
    log_success "Node.js v$(node --version) found"
  fi
else
  install_node
fi

# ── Check npm ───────────────────────────────────────────────
log_step "Checking npm"
if ! command -v npm &>/dev/null; then
  log_error "npm not found. Please install Node.js from https://nodejs.org"
  exit 1
fi
log_success "npm $(npm --version) found"

# ── Download DaveX source from GitHub ───────────────────────
log_step "Downloading DaveX from GitHub"

if [ -d "$INSTALL_DIR" ]; then
  log_info "Existing install found. Updating..."
  cd "$INSTALL_DIR"
  git fetch origin
  git reset --hard origin/master
else
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi
log_success "Source downloaded to $INSTALL_DIR"

# ── Install requirements ────────────────────────────────────
log_step "Installing requirements (npm install)"

npm install || {
  log_error "npm install failed. Check your internet connection and try again."
  exit 1
}
log_success "Requirements installed"

# ── Build ────────────────────────────────────────────────────
log_step "Building DaveX"

npm run build || {
  log_error "Build failed."
  exit 1
}
log_success "Build complete"

# ── Link globally ────────────────────────────────────────────
log_step "Linking davex command globally"

npm link 2>/dev/null || {
  log_warn "npm link needs elevated permissions, retrying with sudo..."
  sudo npm link || {
    log_error "Failed to link davex globally."
    exit 1
  }
}
log_success "davex linked globally"

# ── Verify install ──────────────────────────────────────────
log_step "Verifying installation"

if command -v davex &>/dev/null; then
  log_success "DaveX installed at $(which davex)"
else
  log_warn "davex not in PATH. Adding to shell profile..."
  SHELL_RC=""
  if [ -f "$HOME/.zshrc" ]; then
    SHELL_RC="$HOME/.zshrc"
  elif [ -f "$HOME/.bashrc" ]; then
    SHELL_RC="$HOME/.bashrc"
  fi
  if [ -n "$SHELL_RC" ]; then
    NPM_BIN=$(npm bin -g 2>/dev/null || npm root -g | sed 's|lib/node_modules|bin|')
    echo "export PATH=\"$NPM_BIN:\$PATH\"" >> "$SHELL_RC"
    log_success "Added to $SHELL_RC"
    log_info "Run: source $SHELL_RC"
  fi
fi

# ── Done ────────────────────────────────────────────────────
echo ""
echo -e "  ${GREEN}${BOLD}✓ DaveX is ready!${NC}"
echo ""
echo -e "  Run ${CYAN}${BOLD}davex${NC} to get started"
echo ""
echo -e "  ${BLUE}Docs:${NC}    https://github.com/masonjenkins893-dot/davex"
echo -e "  ${BLUE}Support:${NC} https://github.com/masonjenkins893-dot/davex/issues"
echo ""
