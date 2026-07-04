const { existsSync } = require("node:fs");
const { homedir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const PACKAGE_NAME = "com.anonymous.quranappmobile";

function findAdb() {
  const executable = process.platform === "win32" ? "adb.exe" : "adb";
  const candidates = [
    process.env.ADB,
    process.env.ANDROID_HOME
      ? join(process.env.ANDROID_HOME, "platform-tools", executable)
      : "",
    process.env.ANDROID_SDK_ROOT
      ? join(process.env.ANDROID_SDK_ROOT, "platform-tools", executable)
      : "",
    process.platform === "win32" && process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, "Android", "Sdk", "platform-tools", executable)
      : "",
    process.platform === "darwin"
      ? join(homedir(), "Library", "Android", "sdk", "platform-tools", executable)
      : "",
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate));
}

const adb = findAdb();

// Starting Metro should continue to work for iOS/web and before an Android
// emulator is running, so a missing or unavailable ADB is not an error here.
if (!adb) {
  process.exit(0);
}

const devicesResult = spawnSync(adb, ["devices"], { encoding: "utf8" });
if (devicesResult.status !== 0) {
  process.exit(0);
}

const devices = devicesResult.stdout
  .split(/\r?\n/)
  .map((line) => line.match(/^(\S+)\s+device$/)?.[1])
  .filter(Boolean);

for (const serial of devices) {
  const result = spawnSync(
    adb,
    ["-s", serial, "shell", "am", "force-stop", PACKAGE_NAME],
    { stdio: "ignore" },
  );

  if (result.status === 0) {
    console.log(`Reset Android development client on ${serial}.`);
  }
}
