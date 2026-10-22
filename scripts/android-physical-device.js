#!/usr/bin/env node

const { existsSync } = require("node:fs");
const { homedir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const RELEASE_PACKAGE = "com.anonymous.quranappmobile";
const DEV_PACKAGE = `${RELEASE_PACKAGE}.dev`;
const MAIN_ACTIVITY = "com.anonymous.quranappmobile.MainActivity";
const METRO_PORT = 8081;

function executable(name) {
  return process.platform === "win32" ? `${name}.exe` : name;
}

function findAdb() {
  const adbName = executable("adb");
  const candidates = [
    process.env.ADB,
    process.env.ANDROID_HOME
      ? join(process.env.ANDROID_HOME, "platform-tools", adbName)
      : "",
    process.env.ANDROID_SDK_ROOT
      ? join(process.env.ANDROID_SDK_ROOT, "platform-tools", adbName)
      : "",
    process.platform === "win32" && process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, "Android", "Sdk", "platform-tools", adbName)
      : "",
    process.platform === "darwin"
      ? join(homedir(), "Library", "Android", "sdk", "platform-tools", adbName)
      : "",
  ].filter(Boolean);
  return candidates.find(existsSync) || adbName;
}

const adb = findAdb();

function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.error || result.status !== 0) {
    const detail = result.error?.message || result.stderr || result.stdout;
    throw new Error(detail?.trim() || `${command} exited with ${result.status}`);
  }
  return result.stdout.trim();
}

function connectedPhysicalDevices() {
  return capture(adb, ["devices", "-l"])
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const match = line.match(/^(\S+)\s+device\b(.*)$/);
      if (!match || match[1].startsWith("emulator-")) return null;
      const model = match[2].match(/\bmodel:(\S+)/)?.[1] || "Android_device";
      const serial = match[1];
      return {
        serial,
        model,
        transport: serial.includes(":") ? "wifi" : "usb",
      };
    })
    .filter(Boolean);
}

function hardwareSerial(device) {
  try {
    return capture(adb, ["-s", device.serial, "shell", "getprop", "ro.serialno"]);
  } catch {
    return device.serial;
  }
}

function uniquePhones(devices) {
  const phones = new Map();
  for (const device of devices) {
    const identity = hardwareSerial(device) || device.serial;
    const current = phones.get(identity);
    // The same phone can be listed once by USB and once by Wi-Fi. Prefer USB
    // by default; ANDROID_SERIAL can still explicitly select either transport.
    if (!current || (current.transport === "wifi" && device.transport === "usb")) {
      phones.set(identity, { ...device, hardwareSerial: identity });
    }
  }
  return [...phones.values()];
}

function selectDevice() {
  const connected = connectedPhysicalDevices();
  const requested = process.env.ANDROID_SERIAL;
  if (requested) {
    const selected = connected.find(({ serial }) => serial === requested);
    if (!selected) {
      throw new Error(`ANDROID_SERIAL=${requested} is not an authorized physical device.`);
    }
    return { ...selected, hardwareSerial: hardwareSerial(selected) };
  }
  const devices = uniquePhones(connected);
  if (devices.length === 0) {
    throw new Error(
      "No authorized physical phone found. Connect with USB or pair and connect wireless ADB.",
    );
  }
  if (devices.length > 1) {
    throw new Error(
      `More than one physical phone is connected. Set ANDROID_SERIAL to one of: ${connected
        .map(({ serial, model, transport }) => `${serial} (${model}, ${transport})`)
        .join(", ")}`,
    );
  }
  return devices[0];
}

function adbArgs(device, ...args) {
  return ["-s", device.serial, ...args];
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message || `${command} exited with ${result.status}`);
  }
}

function deviceValue(device, ...args) {
  return capture(adb, adbArgs(device, ...args));
}

function prepareMetro(device) {
  run(adb, adbArgs(device, "reverse", `tcp:${METRO_PORT}`, `tcp:${METRO_PORT}`));
}

function gradleTask(device, task) {
  const wrapper = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
  const primaryAbi = deviceValue(
    device,
    "shell",
    "getprop",
    "ro.product.cpu.abilist",
  ).split(",")[0];
  run(wrapper, [task, `-PreactNativeArchitectures=${primaryAbi}`], {
    cwd: resolve(process.cwd(), "android"),
  });
}

function install(device, variant) {
  const isDebug = variant === "debug";
  gradleTask(device, `:app:assemble${isDebug ? "Debug" : "Release"}`);
  const apk = resolve(
    process.cwd(),
    `android/app/build/outputs/apk/${variant}/app-${variant}.apk`,
  );
  if (!existsSync(apk)) throw new Error(`Expected APK was not created: ${apk}`);
  run(adb, adbArgs(device, "install", "-r", "-d", apk));
  if (isDebug) prepareMetro(device);
  console.log(`Installed ${isDebug ? DEV_PACKAGE : RELEASE_PACKAGE} on ${device.model}.`);
}

async function startDevelopment(device) {
  const installed = deviceValue(device, "shell", "pm", "list", "packages", DEV_PACKAGE);
  if (!installed.split(/\r?\n/).includes(`package:${DEV_PACKAGE}`)) {
    install(device, "debug");
  }
  prepareMetro(device);

  const expo = process.platform === "win32" ? "npx.cmd" : "npx";
  const metro = spawn(
    expo,
    ["expo", "start", "--dev-client", "--localhost", "--port", String(METRO_PORT)],
    {
      stdio: ["inherit", "pipe", "pipe"],
      env: { ...process.env, ANDROID_SERIAL: device.serial },
    },
  );
  const manifestUrl = encodeURIComponent(`http://127.0.0.1:${METRO_PORT}`);
  const devUrl = `quranappmobile://expo-development-client/?url=${manifestUrl}`;
  let launched = false;
  function launchClient() {
    if (launched) return;
    launched = true;
    run(adb, adbArgs(device, "shell", "input", "keyevent", "KEYCODE_WAKEUP"));
    run(
      adb,
      adbArgs(
        device,
        "shell",
        "am",
        "start",
        "-f",
        "0x20000000",
        "-n",
        `${DEV_PACKAGE}/${MAIN_ACTIVITY}`,
        "-d",
        devUrl,
      ),
    );
    console.log(`Development client opened on ${device.model} over ${device.transport}.`);
  }

  function forward(stream, destination) {
    stream.on("data", (chunk) => {
      destination.write(chunk);
      const output = chunk.toString();
      if (output.includes("Metro:") || output.includes("Logs for your project")) {
        launchClient();
      }
    });
  }
  forward(metro.stdout, process.stdout);
  forward(metro.stderr, process.stderr);

  // The text cue above is stable in Expo's interactive output. This fallback
  // also covers non-interactive/CI output formats that omit it.
  const fallback = setTimeout(launchClient, 5_000);
  await new Promise((resolveExit, reject) => {
    metro.on("error", reject);
    metro.on("exit", (code, signal) => {
      clearTimeout(fallback);
      if (signal === "SIGINT" || code === 0 || code === 130) resolveExit();
      else reject(new Error(`Expo exited with ${signal || `code ${code}`}.`));
    });
  });
}

function showInfo(device) {
  const getprop = (name) => deviceValue(device, "shell", "getprop", name);
  const memoryKb = Number(
    deviceValue(device, "shell", "cat", "/proc/meminfo").match(/^MemTotal:\s+(\d+)/m)?.[1],
  );
  console.log(`serial=${device.serial}`);
  console.log(`hardware_serial=${device.hardwareSerial}`);
  console.log(`transport=${device.transport}`);
  console.log(`manufacturer=${getprop("ro.product.manufacturer")}`);
  console.log(`model=${getprop("ro.product.model")}`);
  console.log(`android=${getprop("ro.build.version.release")} (API ${getprop("ro.build.version.sdk")})`);
  console.log(`abi=${getprop("ro.product.cpu.abilist")}`);
  console.log(`memory_gib=${(memoryKb / 1024 / 1024).toFixed(2)}`);
  console.log(deviceValue(device, "shell", "wm", "size"));
  console.log(deviceValue(device, "shell", "wm", "density"));
}

function usage() {
  console.log(`Usage: node scripts/android-physical-device.js <command>

Commands:
  info             Show the selected physical phone
  install-debug    Install the side-by-side development client
  dev              Start Metro and open the development client
  install-release  Build and install the release APK without clearing app data

Set ANDROID_SERIAL when more than one physical phone is connected or to choose
USB versus Wi-Fi when both transports are active for the same phone.`);
}

async function main() {
  const command = process.argv[2];
  if (!command || command === "--help" || command === "-h") {
    usage();
    return;
  }
  const device = selectDevice();
  if (command === "info") showInfo(device);
  else if (command === "install-debug") install(device, "debug");
  else if (command === "install-release") install(device, "release");
  else if (command === "dev") await startDevelopment(device);
  else throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
