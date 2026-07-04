const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function findEmulator() {
  const executable = process.platform === "win32" ? "emulator.exe" : "emulator";
  const sdkRoots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.platform === "win32" && process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Android", "Sdk")
      : null,
    process.platform === "darwin" && process.env.HOME
      ? path.join(process.env.HOME, "Library", "Android", "sdk")
      : null,
  ].filter(Boolean);

  for (const sdkRoot of sdkRoots) {
    const candidate = path.join(sdkRoot, "emulator", executable);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return "emulator";
}

const emulator = findEmulator();
const avdResult = spawnSync(emulator, ["-list-avds"], {
  encoding: "utf8",
});

if (avdResult.error) {
  console.error(
    "Android emulator not found. Configure ANDROID_HOME and add the SDK emulator directory to PATH.",
  );
  process.exit(1);
}

const avds = avdResult.stdout
  .split(/\r?\n/)
  .map((value) => value.trim())
  .filter(Boolean);
const requestedAvd = process.argv[2] || process.env.ANDROID_AVD;
const avd = requestedAvd || avds[0];

if (!avd) {
  console.error("No Android Virtual Device found. Create one in Android Studio.");
  process.exit(1);
}

if (!avds.includes(avd)) {
  console.error(`Android Virtual Device "${avd}" was not found.`);
  console.error(`Available devices: ${avds.join(", ") || "none"}`);
  process.exit(1);
}

console.log(`Starting Android Virtual Device: ${avd}`);

const child = spawn(emulator, ["-avd", avd], { stdio: "inherit" });
child.on("error", (error) => {
  console.error(`Failed to start Android emulator: ${error.message}`);
  process.exit(1);
});
child.on("exit", (code) => {
  process.exit(code ?? 0);
});
