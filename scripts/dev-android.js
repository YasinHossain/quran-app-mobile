const { spawnSync } = require("node:child_process");

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const emulatorArgs = process.argv.slice(2).filter((arg) => arg !== "android");

run("node", ["scripts/start-android-emulator.js", ...emulatorArgs]);
run("node", ["scripts/prepare-expo-start.js"]);
run("expo", ["start", "--android"]);
