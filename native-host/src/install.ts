#!/usr/bin/env node
/**
 * BrowserAgent Native Messaging Host — instalador (Windows).
 *
 * O que faz:
 *  1. Resolve o path absoluto de dist/run-host.bat (o launcher que o Chrome invoca).
 *  2. Escreve o manifest com.pi.browseragent.json com `path` e `allowed_origins`
 *     apontando para o ID da extensão informado ou auto-detectado.
 *  3. Registra o manifest no registry do Windows em
 *     HKCU\Software\Google\Chrome\NativeMessagingHosts\com.pi.browseragent
 *     (também registra em Edge e Brave, se presentes).
 *
 * Uso:
 *   node dist/install.js <extension-id>
 *   node dist/install.js            # tenta auto-detectar o ID nos Preferences do Chrome
 *
 * O ID da extensão aparece em chrome://extensions (com modo desenvolvedor ativo).
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST_NAME = "com.pi.browseragent";
const DIST_DIR = __dirname; // dist/install.js lives next to run-host.bat
const RUN_HOST_BAT = path.join(DIST_DIR, "run-host.bat");
const MANIFEST_PATH = path.join(DIST_DIR, "..", "manifests", `${HOST_NAME}.json`);

console.log('[install] Starting native messaging host installation...');

/** Tenta auto-detectar o ID da extensão BrowserAgent nos Preferences do Chrome. */
function autoDetectExtensionId(): string | null {
  console.log('[install] Attempting to auto-detect extension ID from Chrome preferences...');
  const userDataDirs = [
    path.join(os.homedir(), "AppData/Local/Google/Chrome/User Data"),
    path.join(os.homedir(), "AppData/Local/Microsoft/Edge/User Data"),
    path.join(os.homedir(), "AppData/Local/BraveSoftware/Brave-Browser/User Data"),
  ];
  for (const userData of userDataDirs) {
    if (!fs.existsSync(userData)) {
      console.log(`[install] User data directory not found: ${userData}`);
      continue;
    }
    console.log(`[install] Checking user data directory: ${userData}`);
    let profiles: string[] = [];
    try { profiles = fs.readdirSync(userData).filter((n) => /^Default$|^Profile\b/.test(n)); } catch { /* ignore */ }
    profiles.push("Default");
    for (const prof of profiles) {
      const prefs = path.join(userData, prof, "Preferences");
      if (!fs.existsSync(prefs)) {
        console.log(`[install] Preferences file not found: ${prefs}`);
        continue;
      }
      try {
        console.log(`[install] Reading preferences from: ${prefs}`);
        const raw = fs.readFileSync(prefs, "utf-8");
        const j = JSON.parse(raw);
        const settings = j?.extensions?.settings || {};
        for (const id in settings) {
          const e = settings[id];
          const p: string = e.path || "";
          const man = e.manifest ? JSON.stringify(e.manifest) : "";
          // Caminho do projeto ou nome da extensão
          if (/browser-agent/i.test(p) || /BrowserAgent|browser.agent/i.test(man)) {
            console.log(`[install] Found extension ID in Preferences: ${id}`);
            return id;
          }
        }
      } catch (err) {
        console.log(`[install] Failed to read preferences: ${err}`);
        /* ignore corrupt prefs */
      }
    }
  }
  console.log('[install] No extension ID found in preferences');
  return null;
}

function main() {
  const argId = process.argv[2];
  let extId = (argId || "").trim();
  console.log(`[install] Command line argument ID: ${argId || 'none'}`);
  
  if (!extId) {
    console.log('[install] No ID provided, attempting auto-detection...');
    const detected = autoDetectExtensionId();
    if (detected) {
      console.log(`[install] Extension auto-detected: ${detected}`);
      extId = detected;
    } else {
      // Se não detectar, usar um placeholder que será atualizado depois
      console.log("[install] No ID detected - using placeholder");
      extId = "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
    }
  } else {
    console.log(`[install] Using provided ID: ${extId}`);
  }
  
  if (!/^[a-z0-9]{32}$/.test(extId) && extId !== "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX") {
    console.warn(`[install] Warning: ID "${extId}" doesn't match expected format (32 chars a-z0-9).`);
  }

  if (!fs.existsSync(RUN_HOST_BAT)) {
    console.error(`[install] run-host.bat not found at ${RUN_HOST_BAT}. Run "npm run build" first.`);
    process.exit(1);
  }
  console.log(`[install] Found run-host.bat at: ${RUN_HOST_BAT}`);

  // 1. Escreve o manifest
  const manifest = {
    name: HOST_NAME,
    description: "Pi SDK Bridge for BrowserAgent (reads ~/.pi/agent/models.json)",
    path: RUN_HOST_BAT,
    type: "stdio",
    allowed_origins: [`chrome-extension://${extId}/`],
  };
  const manifestDir = path.dirname(MANIFEST_PATH);
  if (!fs.existsSync(manifestDir)) {
    console.log(`[install] Creating manifest directory: ${manifestDir}`);
    fs.mkdirSync(manifestDir, { recursive: true });
  }
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`[install] Manifest written: ${MANIFEST_PATH}`);
  console.log(`[install]   path: ${RUN_HOST_BAT}`);
  console.log(`[install]   allowed_origins: ${manifest.allowed_origins[0]}`);

  // 2. Registra no registry (Windows). Chrome, Edge e Brave leem a mesma chave.
  if (process.platform === "win32") {
    console.log('[install] Registering in Windows registry (Windows only)...');
    const regTargets = [
      "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\" + HOST_NAME,
      "HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\" + HOST_NAME,
      "HKCU\\Software\\BraveSoftware\\Brave\\NativeMessagingHosts\\" + HOST_NAME,
    ];
    for (const key of regTargets) {
      try {
        console.log(`[install] Registering: ${key}`);
        execSync(`reg add "${key}" /ve /t REG_SZ /d "${MANIFEST_PATH}" /f`, { stdio: "pipe" });
        console.log(`[install] Registry: ${key.split("\\")[2] || key} -> ${MANIFEST_PATH}`);
      } catch (e) {
        console.log(`[install] Failed to register ${key}: ${e}`);
        // Provavelmente o browser não está instalado; ignora silenciosamente.
      }
    }
  } else {
    console.log('[install] Registry registration is Windows-only. Register manually:');
    console.log(`          ${MANIFEST_PATH}`);
  }

  console.log("\n[install] ✅ Native messaging host installed successfully.");
  console.log("[install]   Models will come from ~/.pi/agent/models.json via native host.");
}

main();