#!/usr/bin/env node

const { existsSync, mkdirSync, writeFileSync } = require("node:fs");
const { homedir } = require("node:os");
const { dirname, join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const PACKAGE_NAME = "com.anonymous.quranappmobile";
const OUTPUT_DIR = resolve(process.cwd(), "scratch/android-debug");

function usage() {
  console.log(`
Android debug helper

Usage:
  npm run debug:android -- [--device SERIAL] <command> [...args]

Commands:
  devices                         List connected Android devices/emulators
  logs                            Stream React Native / Expo / crash logs
  clear-logs                      Clear device logcat buffer
  screenshot [path]               Save a PNG screenshot
  ui [path]                       Dump the current Android UI tree XML
  launch                          Launch the installed app package
  tap <x> <y>                     Tap screen coordinates
  text <value>                    Type text into the focused input
  back                            Press Android back
  home                            Press Android home
  key <KEYCODE|number>            Send an Android keyevent
  swipe <x1> <y1> <x2> <y2> [ms]  Swipe between coordinates

Environment:
  ADB=/path/to/adb                Override adb binary
  ANDROID_SERIAL=SERIAL           Select a device/emulator
`);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function pathExists(path) {
  return path && existsSync(path);
}

function commandPath(command) {
  const locator = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(locator, [command], {
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.split(/\r?\n/)[0].trim() : "";
}

function findAdb() {
  const executable = process.platform === "win32" ? "adb.exe" : "adb";
  const candidates = [
    process.env.ADB,
    commandPath(executable),
    process.env.ANDROID_HOME
      ? join(process.env.ANDROID_HOME, "platform-tools", executable)
      : "",
    process.env.ANDROID_SDK_ROOT
      ? join(process.env.ANDROID_SDK_ROOT, "platform-tools", executable)
      : "",
    process.platform === "win32" && process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, "Android", "Sdk", "platform-tools", executable)
      : "",
    join(homedir(), "Library", "Android", "sdk", "platform-tools", executable),
    "/opt/homebrew/bin/adb",
    "/usr/local/bin/adb",
  ];

  return candidates.find(pathExists);
}

function missingAdb() {
  console.error(`Could not find adb.

Install Android platform-tools, then retry:
  - Windows/macOS: install "Android SDK Platform-Tools" from Android Studio
  - macOS with Homebrew: brew install android-platform-tools

Or point this helper at adb explicitly:
  ADB=/path/to/adb npm run debug:android -- devices
`);
  process.exit(127);
}

function run(adb, serial, args, options = {}) {
  const adbArgs = serial ? ["-s", serial, ...args] : args;
  const result = spawnSync(adb, adbArgs, {
    encoding: options.encoding || "utf8",
    stdio: options.stdio || "inherit",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }

  return result;
}

function runCapture(adb, serial, args, encoding = "buffer") {
  const adbArgs = serial ? ["-s", serial, ...args] : args;
  const result = spawnSync(adb, adbArgs, {
    encoding,
    maxBuffer: 50 * 1024 * 1024,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (typeof result.status === "number" && result.status !== 0) {
    if (result.stderr) {
      console.error(result.stderr.toString());
    }
    process.exit(result.status);
  }

  return result.stdout;
}

function extractPng(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const offset = buffer.indexOf(signature);

  if (offset === -1) {
    console.error("ADB screenshot output did not contain a PNG image.");
    process.exit(1);
  }

  return buffer.subarray(offset);
}

function ensureOutputPath(customPath, fallbackName) {
  const outputPath = resolve(process.cwd(), customPath || `${OUTPUT_DIR}/${fallbackName}`);
  mkdirSync(dirname(outputPath), { recursive: true });
  return outputPath;
}

function parseArgs(argv) {
  const args = [...argv];
  let serial = process.env.ANDROID_SERIAL || "";

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--device") {
      serial = args[index + 1] || "";
      args.splice(index, 2);
      index -= 1;
    }
  }

  return { serial, command: args[0], args: args.slice(1) };
}

function requireArgs(command, args, count) {
  if (args.length < count) {
    console.error(`Missing arguments for "${command}".`);
    usage();
    process.exit(1);
  }
}

function inputText(value) {
  return value
    .replace(/%/g, "%25")
    .replace(/\s/g, "%s")
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'");
}

function main() {
  const { serial, command, args } = parseArgs(process.argv.slice(2));

  if (!command || command === "--help" || command === "-h") {
    usage();
    return;
  }

  const adb = findAdb();
  if (!adb) {
    missingAdb();
  }

  switch (command) {
    case "devices":
      run(adb, "", ["devices", "-l"]);
      break;

    case "logs":
      run(adb, serial, [
        "logcat",
        "*:S",
        "ReactNative:V",
        "ReactNativeJS:V",
        "Expo:V",
        "AndroidRuntime:E",
      ]);
      break;

    case "clear-logs":
      run(adb, serial, ["logcat", "-c"]);
      break;

    case "screenshot": {
      const outputPath = ensureOutputPath(args[0], `screen-${timestamp()}.png`);
      // Newer foldable emulators may write a multiple-display warning before
      // the PNG bytes. Strip any diagnostic prefix so the saved image remains valid.
      const image = extractPng(runCapture(adb, serial, ["exec-out", "screencap", "-p"]));
      writeFileSync(outputPath, image);
      console.log(outputPath);
      break;
    }

    case "ui": {
      const outputPath = ensureOutputPath(args[0], `window-${timestamp()}.xml`);
      run(adb, serial, ["shell", "uiautomator", "dump", "/sdcard/window.xml"]);
      const xml = runCapture(adb, serial, ["exec-out", "cat", "/sdcard/window.xml"], "utf8");
      writeFileSync(outputPath, xml);
      run(adb, serial, ["shell", "rm", "-f", "/sdcard/window.xml"], { stdio: "ignore" });
      console.log(outputPath);
      break;
    }

    case "launch":
      run(adb, serial, [
        "shell",
        "monkey",
        "-p",
        PACKAGE_NAME,
        "-c",
        "android.intent.category.LAUNCHER",
        "1",
      ]);
      break;

    case "tap":
      requireArgs(command, args, 2);
      run(adb, serial, ["shell", "input", "tap", args[0], args[1]]);
      break;

    case "text":
      requireArgs(command, args, 1);
      run(adb, serial, ["shell", "input", "text", inputText(args.join(" "))]);
      break;

    case "back":
      run(adb, serial, ["shell", "input", "keyevent", "KEYCODE_BACK"]);
      break;

    case "home":
      run(adb, serial, ["shell", "input", "keyevent", "KEYCODE_HOME"]);
      break;

    case "key":
      requireArgs(command, args, 1);
      run(adb, serial, ["shell", "input", "keyevent", args[0]]);
      break;

    case "swipe":
      requireArgs(command, args, 4);
      run(adb, serial, ["shell", "input", "swipe", ...args.slice(0, 5)]);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      usage();
      process.exit(1);
  }
}

main();
