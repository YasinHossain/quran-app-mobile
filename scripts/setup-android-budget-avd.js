const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const AVD_NAME = process.env.ANDROID_BUDGET_AVD || "quran_budget_api34";
const SYSTEM_IMAGE =
  process.env.ANDROID_BUDGET_SYSTEM_IMAGE ||
  "system-images;android-34;google_apis;arm64-v8a";

function sdkRoot() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Android", "sdk")
      : null,
    process.platform === "win32" && process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Android", "Sdk")
      : null,
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function executable(root, segments) {
  const suffix = process.platform === "win32" ? ".exe" : "";
  return path.join(root, ...segments) + suffix;
}

function findCommandLineTool(root, name) {
  const directCandidates = [
    executable(root, ["cmdline-tools", "latest", "bin", name]),
    executable(root, ["tools", "bin", name]),
  ];
  const direct = directCandidates.find((candidate) => fs.existsSync(candidate));
  if (direct) return direct;

  const commandLineTools = path.join(root, "cmdline-tools");
  if (!fs.existsSync(commandLineTools)) return "";

  return (
    fs
      .readdirSync(commandLineTools)
      .map((version) =>
        executable(root, ["cmdline-tools", version, "bin", name]),
      )
      .find((candidate) => fs.existsSync(candidate)) || ""
  );
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
    ...options,
  });

  if (result.error || result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    console.error(result.error?.message || `${command} exited with ${result.status}`);
    process.exit(1);
  }

  return result.stdout || "";
}

function updateIni(content, key, value) {
  const entry = `${key}=${value}`;
  const expression = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=.*$`, "m");
  return expression.test(content)
    ? content.replace(expression, entry)
    : `${content.trimEnd()}\n${entry}\n`;
}

const root = sdkRoot();
if (!root) {
  console.error("Android SDK not found. Set ANDROID_HOME or ANDROID_SDK_ROOT.");
  process.exit(1);
}

const emulator = executable(root, ["emulator", "emulator"]);
const avdManager = findCommandLineTool(root, "avdmanager");
const sdkManager = findCommandLineTool(root, "sdkmanager");
if (!fs.existsSync(emulator) || !avdManager || !sdkManager) {
  console.error(
    "Android Emulator, avdmanager, or sdkmanager was not found in the Android SDK.",
  );
  process.exit(1);
}

const installedPackages = run(sdkManager, ["--list_installed"]);
if (!installedPackages.includes(SYSTEM_IMAGE)) {
  console.log(`Installing Android system image: ${SYSTEM_IMAGE}`);
  run(sdkManager, ["--install", SYSTEM_IMAGE], { stdio: "inherit" });
}

const installedAvds = run(emulator, ["-list-avds"])
  .split(/\r?\n/)
  .map((value) => value.trim())
  .filter(Boolean);

if (!installedAvds.includes(AVD_NAME)) {
  console.log(`Creating Android budget-check AVD: ${AVD_NAME}`);
  run(
    avdManager,
    [
      "create",
      "avd",
      "--name",
      AVD_NAME,
      "--package",
      SYSTEM_IMAGE,
      "--device",
      "pixel_2",
    ],
    { input: "no\n" },
  );
}

const avdHome =
  process.env.ANDROID_AVD_HOME || path.join(os.homedir(), ".android", "avd");
const pointerPath = path.join(avdHome, `${AVD_NAME}.ini`);
let avdDirectory = path.join(avdHome, `${AVD_NAME}.avd`);

if (fs.existsSync(pointerPath)) {
  const pointer = fs.readFileSync(pointerPath, "utf8");
  const configuredPath = pointer.match(/^path=(.+)$/m)?.[1]?.trim();
  if (configuredPath) avdDirectory = configuredPath;
}

const configPath = path.join(avdDirectory, "config.ini");
if (!fs.existsSync(configPath)) {
  console.error(`AVD configuration was not found: ${configPath}`);
  process.exit(1);
}

let config = fs.readFileSync(configPath, "utf8");
const settings = {
  "disk.dataPartition.size": "4G",
  "hw.cpu.ncore": "2",
  "hw.gpu.enabled": "yes",
  "hw.gpu.mode": "host",
  "hw.lcd.density": "320",
  "hw.lcd.height": "1600",
  "hw.lcd.width": "720",
  "hw.ramSize": "2048",
  showDeviceFrame: "no",
  "vm.heapSize": "256M",
};

for (const [key, value] of Object.entries(settings)) {
  config = updateIni(config, key, value);
}
fs.writeFileSync(configPath, config);

console.log(`Budget-check AVD ready: ${AVD_NAME}`);
console.log("  Android 14 / API 34, 2 cores, 2 GB RAM, 720x1600 @ 320 dpi");
console.log("  Use it for regression screening, not final device-performance claims.");
