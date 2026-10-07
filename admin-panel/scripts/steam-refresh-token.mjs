// Creates STEAM_GC_REFRESH_TOKEN for the Premier demo resolver.
// Use a separate Steam account: the API stays logged in as "playing CS2".
//
//   node scripts/steam-refresh-token.mjs
//
// STEAM_ACCOUNT, STEAM_PASSWORD and STEAM_GUARD_CODE may be provided as
// environment variables; anything missing is asked for interactively.
// Neither the password nor the token is written to disk.
import { createRequire } from "node:module";
import { createInterface } from "node:readline";

const require = createRequire(import.meta.url);
const SteamUser = require("steam-user");

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: !!process.stdin.isTTY });
    if (hidden) rl._writeToOutput = (text) => { if (text.startsWith(question)) rl.output.write(text); };
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stderr.write("\n");
      resolve(answer.trim());
    });
  });
}

const accountName = process.env.STEAM_ACCOUNT || (await ask("Steam-Benutzername: "));
const password = process.env.STEAM_PASSWORD || (await ask("Passwort: ", true));
let guardCode = process.env.STEAM_GUARD_CODE || "";

const user = new SteamUser({ dataDirectory: null, renewRefreshTokens: false });
const timer = setTimeout(() => {
  console.error("Keine Antwort von Steam innerhalb von 10 Minuten.");
  process.exit(1);
}, 600_000);

user.on("steamGuard", async (domain, callback, lastCodeWrong) => {
  if (lastCodeWrong) console.error("Der Steam-Guard-Code war falsch.");
  const code = !lastCodeWrong && guardCode
    ? guardCode
    : await ask(domain ? `Steam-Guard-Code aus der E-Mail an ${domain}: ` : "Code aus der Steam-App: ");
  guardCode = "";
  callback(code);
});
user.on("refreshToken", (token) => {
  clearTimeout(timer);
  console.error(`Angemeldet als ${accountName}. In .env.development eintragen:`);
  console.log(`STEAM_GC_REFRESH_TOKEN=${token}`);
  user.logOff();
  setTimeout(() => process.exit(0), 500);
});
user.on("error", (error) => {
  clearTimeout(timer);
  console.error(`Anmeldung fehlgeschlagen: ${error.message}`);
  process.exit(1);
});
user.logOn({ accountName, password, machineName: "Playbook" });
