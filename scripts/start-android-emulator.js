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

function findAdb() {
  const executable = process.platform === "win32" ? "adb.exe" : "adb";
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
    const candidate = path.join(sdkRoot, "platform-tools", executable);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return "adb";
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function connectedEmulator(adb) {
  const result = spawnSync(adb, ["devices"], { encoding: "utf8" });
  if (result.status !== 0) {
    return "";
  }

  return (
    result.stdout
      .split(/\r?\n/)
      .map((line) => line.match(/^(emulator-\d+)\s+device$/)?.[1])
      .find(Boolean) || ""
  );
}

function waitUntilReady(adb, timeoutMilliseconds = 180_000) {
  const deadline = Date.now() + timeoutMilliseconds;

  while (Date.now() < deadline) {
    const serial = connectedEmulator(adb);
    if (serial) {
      const bootResult = spawnSync(
        adb,
        ["-s", serial, "shell", "getprop", "sys.boot_completed"],
        { encoding: "utf8" },
      );
      if (bootResult.status === 0 && bootResult.stdout.trim() === "1") {
        return serial;
      }
    }
    sleep(2_000);
  }

  return "";
}

const emulator = findEmulator();
const adb = findAdb();
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

const existingSerial = connectedEmulator(adb);
if (existingSerial) {
  console.log(`Android emulator already ready: ${existingSerial}`);
  process.exit(0);
}

console.log(`Starting Android Virtual Device: ${avd}`);

if (process.platform === "win32") {
  const windowsLauncher = path.join(__dirname, "start-android-emulator-windows.cmd");
  const result = spawnSync(
    "cmd.exe",
    ["/d", "/c", windowsLauncher, emulator, avd],
    {
      stdio: "ignore",
      windowsHide: true,
    },
  );

  if (result.error || result.status !== 0) {
    console.error(
      `Failed to start Android emulator: ${result.error?.message || `exit code ${result.status}`}`,
    );
    process.exit(1);
  }

  const serial = waitUntilReady(adb);
  if (!serial) {
    console.error("Android emulator did not become ready within 3 minutes.");
    process.exit(1);
  }

  console.log(`Android emulator ready: ${serial}`);
  process.exit(0);
}

const launchOptions = {
  detached: true,
  stdio: "ignore",
};

const child = spawn(emulator, ["-avd", avd], launchOptions);

child.on("error", (error) => {
  console.error(`Failed to start Android emulator: ${error.message}`);
  process.exit(1);
});
child.on("spawn", () => {
  child.unref();

  const serial = waitUntilReady(adb);
  if (!serial) {
    console.error("Android emulator did not become ready within 3 minutes.");
    process.exitCode = 1;
    return;
  }

  console.log(`Android emulator ready: ${serial}`);
});
