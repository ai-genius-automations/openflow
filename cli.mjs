#!/usr/bin/env node
// OctoAlly CLI — thin npm wrapper
// Auto-installs on first run, checks for updates, and launches the app.

import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const INSTALL_DIR = process.env.OCTOALLY_INSTALL_DIR || join(homedir(), "octoally");
const GITHUB_REPO = "ai-genius-automations/octoally";
const LOCAL_CLI = join(INSTALL_DIR, "bin", "octoally");

const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";
const NC = "\x1b[0m";

function log(color, msg) {
  console.log(`${color}[OctoAlly]${NC} ${msg}`);
}

function isInstalled() {
  return existsSync(LOCAL_CLI) && existsSync(join(INSTALL_DIR, "server", "dist"));
}

/** Read the npm package version (baked into this wrapper at publish time). */
function getPackageVersion() {
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    return pkg.version || null;
  } catch {
    return null;
  }
}

/** Read the locally installed version from ~/octoally/version.json. */
function getLocalVersion() {
  try {
    const versionFile = join(INSTALL_DIR, "version.json");
    const data = JSON.parse(readFileSync(versionFile, "utf8"));
    return data.version || null;
  } catch {
    return null;
  }
}

/** Compare two semver strings. Returns true if a > b. */
function isNewer(a, b) {
  if (!a || !b) return false;
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

async function promptYesNo(question) {
  // Non-interactive (piped input) — default to yes
  if (!process.stdin.isTTY) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => {
    rl.question(`${BOLD}${question} [Y/n]:${NC} `, resolve);
  });
  rl.close();
  return answer.toLowerCase() !== "n";
}

async function install() {
  log(CYAN, "Installing OctoAlly...");
  log(CYAN, `Install directory: ${INSTALL_DIR}`);

  try {
    execSync("node --version", { stdio: "pipe" });
  } catch {
    log(RED, "Node.js is required. Install it from https://nodejs.org");
    process.exit(1);
  }

  if (!existsSync(INSTALL_DIR)) {
    log(CYAN, "Cloning repository...");
    execSync(`git clone --depth 1 https://github.com/${GITHUB_REPO}.git "${INSTALL_DIR}"`, {
      stdio: "inherit",
    });
  } else {
    log(CYAN, "Updating existing installation...");
    execSync("git pull --ff-only", { cwd: INSTALL_DIR, stdio: "inherit" });
  }

  log(CYAN, "Installing dependencies...");
  execSync("npm install", { cwd: INSTALL_DIR, stdio: "inherit" });
  execSync("npm install", { cwd: join(INSTALL_DIR, "server"), stdio: "inherit" });
  execSync("npm install", { cwd: join(INSTALL_DIR, "dashboard"), stdio: "inherit" });

  log(CYAN, "Building...");
  execSync("npm run build", { cwd: INSTALL_DIR, stdio: "inherit" });

  // Symlink CLI to PATH
  const binDir = join(homedir(), ".local", "bin");
  mkdirSync(binDir, { recursive: true });
  const symlinkTarget = join(binDir, "octoally");
  try {
    execSync(`ln -sf "${LOCAL_CLI}" "${symlinkTarget}"`, { stdio: "pipe" });
    log(GREEN, `Symlinked to ${symlinkTarget}`);
  } catch {
    log(YELLOW, `Could not create symlink at ${symlinkTarget}`);
  }

  const version = getLocalVersion() || "unknown";
  log(GREEN, `OctoAlly v${version} installed successfully!`);
}

/** Delegate update to the installed bin/octoally update (handles stop/pull/build/restart). */
function runUpdate() {
  execSync(`"${LOCAL_CLI}" update`, { cwd: INSTALL_DIR, stdio: "inherit" });
}

function proxyCommand(args) {
  const child = spawn(LOCAL_CLI, args, {
    stdio: "inherit",
    cwd: INSTALL_DIR,
  });
  child.on("exit", (code) => process.exit(code ?? 0));
  child.on("error", (err) => {
    log(RED, `Failed to run: ${err.message}`);
    process.exit(1);
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0] || "";

// Explicit --install flag
if (command === "--install" || command === "install") {
  if (isInstalled()) {
    log(YELLOW, "OctoAlly is already installed. Use 'npx octoally --update' to update.");
    process.exit(0);
  }
  if (await promptYesNo(`Install OctoAlly to ${INSTALL_DIR}?`)) {
    try {
      await install();
    } catch (err) {
      log(RED, `Installation failed: ${err.message}`);
      process.exit(1);
    }
  }
  process.exit(0);
}

// Explicit --update flag
if (command === "--update") {
  if (!isInstalled()) {
    log(RED, "OctoAlly is not installed. Run: npx octoally --install");
    process.exit(1);
  }
  try {
    runUpdate();
  } catch (err) {
    log(RED, `Update failed: ${err.message}`);
    process.exit(1);
  }
  process.exit(0);
}

// ── Not installed → offer to install ─────────────────────────────────────────

if (!isInstalled()) {
  log(YELLOW, "OctoAlly is not installed yet.");
  if (await promptYesNo(`Install to ${INSTALL_DIR}?`)) {
    try {
      await install();
      log(CYAN, "Launching OctoAlly...\n");
      proxyCommand(args.length ? args : ["start"]);
    } catch (err) {
      log(RED, `Installation failed: ${err.message}`);
      process.exit(1);
    }
  } else {
    log(CYAN, "Installation cancelled.");
    process.exit(0);
  }
} else {
  // ── Installed → check for updates, then launch ───────────────────────────

  const packageVersion = getPackageVersion();
  const localVersion = getLocalVersion();

  if (packageVersion && localVersion && isNewer(packageVersion, localVersion)) {
    log(YELLOW, `Update available: v${localVersion} → v${packageVersion}`);
    if (await promptYesNo("Update before launching?")) {
      try {
        runUpdate();
      } catch (err) {
        log(RED, `Update failed: ${err.message}`);
        log(CYAN, "Launching existing version...");
      }
    }
  }

  // Default action: no args → launch the app (start)
  proxyCommand(args.length ? args : ["start"]);
}
