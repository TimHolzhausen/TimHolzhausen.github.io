// Baut fragebogen/data.js: Fragebogen-Inhalt und Auswertungsschlüssel, beides verschlüsselt.
//
//   node fragebogen/build.mjs
//
// Passwörter werden abgefragt (oder per FB_ZUGANG / FB_AUSWERTUNG übergeben).
// Klartext und Schlüsselpaar liegen in fragebogen/_privat/ (steht in .gitignore, nie pushen).
// Das Schlüsselpaar bleibt beim Neubauen erhalten: Passwörter lassen sich ändern,
// ohne dass bereits verschickte Antwortcodes unlesbar werden.
import { webcrypto as C } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PRIV = path.join(DIR, "_privat");
const ITER = 600000;
const b64 = (u8) => Buffer.from(u8).toString("base64");

async function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a.trim()); }));
}
async function seal(text, password) {
  const salt = C.getRandomValues(new Uint8Array(16)), iv = C.getRandomValues(new Uint8Array(12));
  const base = await C.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await C.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const ct = new Uint8Array(await C.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text)));
  return { s: b64(salt), i: b64(iv), c: b64(ct) };
}

const inhalt = JSON.parse(fs.readFileSync(path.join(PRIV, "inhalt.json"), "utf8"));
const zugang = process.env.FB_ZUGANG || await ask("Zugangspasswort (zum Ausfüllen): ");
const auswertung = process.env.FB_AUSWERTUNG || await ask("Auswertungspasswort: ");
if (zugang.length < 8 || auswertung.length < 8) { console.error("Bitte mindestens 8 Zeichen pro Passwort."); process.exit(1); }
if (zugang === auswertung) { console.error("Zugangs- und Auswertungspasswort müssen verschieden sein."); process.exit(1); }

const keyFile = path.join(PRIV, "schluessel.json");
let keys;
if (fs.existsSync(keyFile)) keys = JSON.parse(fs.readFileSync(keyFile, "utf8"));
else {
  const kp = await C.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
  keys = { pub: await C.subtle.exportKey("jwk", kp.publicKey), priv: await C.subtle.exportKey("jwk", kp.privateKey) };
  fs.writeFileSync(keyFile, JSON.stringify(keys, null, 2));
  console.log("Neues Schlüsselpaar erzeugt:", keyFile);
}

const vault = {
  v: 1, iter: ITER,
  content: await seal(JSON.stringify({ ...inhalt, pub: keys.pub }), zugang),
  priv: await seal(JSON.stringify(keys.priv), auswertung),
};
fs.writeFileSync(path.join(DIR, "data.js"), "// Verschlüsselt erzeugt von build.mjs. Nicht von Hand ändern.\nwindow.VAULT = " + JSON.stringify(vault) + ";\n");
console.log("fragebogen/data.js geschrieben.");
