# Playbook

Playbook verwaltet CS2-Granaten-Lineups und einen Dedicated Server über ein geschütztes Web-Dashboard für Docker Compose oder Coolify. Servername, Steam-Registrierung, RCON, Spielmodus, Plugins, Versionen, Admins, Workshop-Maps, Nades und Wartung werden im Dashboard gepflegt.

## Lokal entwickeln

Voraussetzungen sind Node.js ab Version 22 und ein laufender Docker-Dienst mit Docker Compose ab Version 2.22. Auf macOS und Windows eignet sich Docker Desktop.

Im Repository starten:

```bash
./dev.sh
```

Unter Windows oder ohne Bash funktioniert `node dev.mjs`. Auch `cd admin-panel` und `pnpm dev` starten dieselbe Umgebung. Eine lokale Installation der npm-Abhängigkeiten ist dafür nicht nötig; sie werden im Docker-Image installiert.

Das Skript startet MongoDB, die API und Vite unter `http://localhost:5173`. Vite lädt Frontend-Änderungen direkt nach. Änderungen unter `admin-panel/src` bauen die API automatisch neu und starten sie wieder. Währenddessen können API-Anfragen kurz fehlschlagen. Strg+C beendet die Container. Datenbank, Uploads und Runtime-Dateien bleiben in eigenen Volumes des Compose-Projekts `cs2-matchzy-dev` erhalten.

Für den Zugriff über eine LAN- oder Tailscale-Adresse die tatsächliche Browser-Adresse angeben:

```bash
./dev.sh --url http://100.109.17.79:5173
```

Beim ersten Start legt das Skript `.env.development` mit dieser Adresse und einem zufälligen Session-Secret an. Die Datei wird von Git ignoriert. Für Admin-Rechte die eigene 17-stellige Steam64-ID in `ADMIN_PANEL_ADMIN_STEAM_ID` eintragen und die Entwicklungsumgebung neu starten. Alternativ beim Start `--admin DEINE_STEAM64_ID` übergeben. Die konfigurierte Steam-ID erhält in der Entwicklungsumgebung auch bei einem bestehenden Player-Konto Admin-Rechte. Name, Favoriten und andere Benutzer bleiben erhalten. Im Deployment bleibt die Variable auf das Anlegen eines neuen Admin-Kontos beschränkt.

Steam verwendet die konfigurierte Adresse für den Callback. Deshalb das Dashboard immer über diese Adresse öffnen. `--url` und `--admin` überschreiben die Dateieinstellungen für den aktuellen Start; dauerhafte Änderungen gehören in `.env.development`. Bereits gesetzte Umgebungsvariablen haben ebenfalls Vorrang vor der Datei. Für einen anderen Port beispielsweise `./dev.sh --url http://localhost:5174` verwenden.

Vite verwendet den gewählten Port auch im Container und zeigt die tatsächliche Browser-Adresse an. Die API läuft intern weiterhin auf Port 8080. Vite leitet `/api` dorthin weiter; der Browser verwendet ausschließlich die konfigurierte öffentliche Adresse.

Ein bisher separat gestartetes Vite zuerst beenden, falls Port 5173 belegt ist. `pnpm dev:client` startet weiterhin nur das Frontend und benötigt eine separat erreichbare API auf Port 8080. Genau diese fehlende API verursachte bisher HTTP 500 beim Steam-Login mit `pnpm dev`.

Die Entwicklungsumgebung startet keinen CS2-Gameserver und erhält keinen Docker-Socket. Anmeldung, Dashboard und gespeicherte Daten lassen sich lokal entwickeln; Gameserver-Steuerung und Live-Diagnosen benötigen den vollständigen Deployment-Stack.

## Deployment

Am Deployment werden die öffentliche Adresse und ein Session-Secret gesetzt. Bei einer neuen Installation kommt die Steam64-ID des ersten Admins hinzu:

```dotenv
ADMIN_PANEL_PUBLIC_URL=https://cs2.example.com
ADMIN_PANEL_ADMIN_STEAM_ID=
ADMIN_PANEL_SESSION_SECRET=
```

| Variable | Zweck |
| --- | --- |
| `ADMIN_PANEL_PUBLIC_URL` | Öffentliche HTTP(S)-Adresse ohne Pfad. In Produktion HTTPS verwenden. |
| `ADMIN_PANEL_ADMIN_STEAM_ID` | Steam64-ID des ersten Admins. Optional bei vorhandenen Ownern; legt nur einen noch nicht vorhandenen Benutzer an. |
| `ADMIN_PANEL_SESSION_SECRET` | Langer Zufallswert zum Hashen der zufälligen Sitzungstokens |

Für ein starkes Session-Secret eignet sich zum Beispiel:

```bash
openssl rand -hex 32
```

Danach:

```bash
docker compose up -d --build
```

### Testzugang als Spieler

Unter `https://playbook.schlossers.at/login/test` kannst du dich mit Benutzername und Passwort als zusätzlicher Spieler anmelden. Der Zugang zeigt die Plattform ohne Admin-Rechte und speichert eigene Favoriten. Auch wenn du bereits als Admin angemeldet bist, kannst du über diese Seite zum Testkonto wechseln. Zurück zum Admin-Konto kommst du über Abmelden und die Steam-Anmeldung.

Setze dafür in Coolify oder in der Compose-Umgebung:

```dotenv
ADMIN_PANEL_TEST_USERNAME=test
ADMIN_PANEL_TEST_PASSWORD=DEIN_LANGES_ZUFAELLIGES_PASSWORT
```

Deploye die Ressource anschließend neu. Der Benutzername ist standardmäßig `test`; das Passwort legst du selbst fest. Es gibt kein voreingestelltes Passwort. Ohne `ADMIN_PANEL_TEST_PASSWORD` bleibt der Testzugang deaktiviert und bestehende Test-Sitzungen verlieren ihren Zugriff. Lokal gelten dieselben Variablen in `.env.development`; starte die Entwicklungsumgebung danach neu.

Alle Anmeldungen über diesen Zugang verwenden dasselbe separate Testkonto mit der Rolle Spieler und der reservierten internen Identität `00000000000000001`. Das Konto besitzt keine echte Steam-ID und keinen Ingame-Zugang. Test-Sitzungen bleiben auf Spielerrechte beschränkt, auch wenn die Rolle des Kontos in der Benutzerverwaltung geändert wird. Die bestehenden Regeln für Favoriten und das Bearbeiten eigener Lineups gelten auch für dieses Konto.

In Coolify wird das Repository als Compose-Ressource verbunden. Diese Werte kommen in die Environment-Ansicht der Ressource. Fuer `admin-panel` wird eine Domain mit dem internen Zielport `8080` angelegt. Der Stack bindet diesen Port nicht an den Host; dadurch kollidiert er nicht mit anderen Coolify-Projekten, die intern ebenfalls Port 8080 verwenden.

Am Host werden nur die Spielports veroeffentlicht:

- `27015/tcp`
- `27015/udp`
- `27020/udp`

## Erster Start

Beim ersten Start geschieht Folgendes:

1. MongoDB und das Dashboard starten.
2. Das Dashboard legt ein neues, typisiertes Settings-Dokument mit sicheren Defaults an.
3. Der CS2-Container wartet und startet noch keinen Gameserver.
4. Du meldest dich über „Mit Steam anmelden“ mit dem konfigurierten Admin-Konto an.
5. Unter `Server` traegst du mindestens den Steam Game Server Login Token fuer App 730 und ein RCON-Passwort ein.
6. `Apply & restart` schreibt die Runtime-Dateien und startet CS2.

Der Steam-Token wird also weiterhin benoetigt. Er ist aber keine Deployment-Variable mehr, sondern eine geschuetzte Servereinstellung im Dashboard.

## Clean-Slate-Verhalten

Der Stack importiert keine frueheren Environment-Dateien und keine alten Settings-Felder. Findet das Dashboard in MongoDB kein Dokument mit der aktuellen Schema-Version, ersetzt es das Settings-Dokument durch neue Standardwerte. Steam-Token und RCON-Passwort sind danach leer und muessen im Dashboard neu eingegeben werden.

Admins und Nades liegen in eigenen MongoDB-Dokumenten und bleiben bei diesem Settings-Schemawechsel erhalten. Wenn auch diese Daten komplett neu beginnen sollen, muss fuer den neuen Stack ein neues MongoDB-Volume verwendet werden.

Alte Dateien in einem bestehenden Runtime-Volume werden nicht gelesen. Fuer einen garantiert vollstaendig frischen Aufbau sollten auch die bisherigen Runtime- und CS2-Datenvolumes nicht weiterverwendet werden.

## Konfigurationsfluss

```text
Coolify / Compose
  └─ öffentliche URL, Admin-Steam-ID und Session-Secret
       └─ Playbook
            ├─ MongoDB: settings, admins, nades
            └─ privates Runtime-Volume
                 ├─ settings.json
                 ├─ csharp-admins.json
                 ├─ matchzy-admins.json
                 └─ matchzy-savednades.json
                      └─ CS2-Container
```

`settings.json` ist der einzige Konfigurationseingang fuer den eigenen CS2-Bootstrap. Das Entry-Point-Skript uebersetzt nur die wenigen Startwerte, die das verwendete `cm2network/cs2`-Basisimage als Prozessvariablen erwartet. Diese Werte koennen nicht ueber Coolify oder Compose gesetzt werden; sie werden bei jedem Start aus der privaten JSON-Datei ueberschrieben.

## Dashboard

Die Website öffnet nach der Anmeldung **All Maps**. Die einklappbare shadcn-Sidebar basiert auf `sidebar-08` und gliedert sich in **Maps** und **Server**. Auf dem Handy öffnet sie sich als seitliches Menü.

- **Maps → All Maps**: durchsuchbare Kartenübersicht mit Active Duty, Reserve-Pool, inaktiven Maps, weiteren Spielmodi und Workshop-Maps. Auch nicht installierte Maps bleiben zum Durchstöbern verfügbar.
- **Map-Seiten**, etwa `/maps/mirage`: große Radarkarte mit gruppierten Start- oder Landepositionen. Ein Klick zeigt die zugehörigen Gegenpositionen; mehrere Würfe vom selben Punkt bleiben einzeln auswählbar. Rechts stehen Granatentyp, Sammlung und Suche, darunter eine kompakte Lineup-Liste. „Alle“ zeigt auch ungeprüfte Aufnahmen. Jede Active-Duty-Map ist direkt in der Sidebar verlinkt.
- **Lineup-Seiten** unter `/maps/:map/lineups/:id`: direkt verlinkbare Detailseiten mit Wurfweg, Wurfattributen, Flugzeit und Bildern und kopierbarem Ingame-Befehl. Die ID unterscheidet Owner, Map und internen Namen; ein neuer Anzeigename verändert den Link nicht.
- **Nade hinzufügen** auf der Map-Seite: Plattform-Admins erstellen Nades manuell über den vorhandenen Editor. Name, Granatentyp, Startkoordinaten und Blickwinkel sind erforderlich; Anleitung, Wurfattribute und Radarpositionen können ergänzt werden. Die Nade gehört dem angemeldeten Admin und wird als Entwurf gespeichert. Die Freigaben „Offiziell“ und „Must Know“ erfolgen anschließend auf der Lineup-Seite. Eine Aufnahme im Spiel ist dafür nicht nötig.
- **Favoriten**: über den Stern in der Liste oder auf der Detailseite merken. Website-Favoriten werden in MongoDB pro Steam-ID und vollständiger Lineup-Identität gespeichert. Sie sind unabhängig von den Favoriten des Ingame-Panels.
- **Bearbeiten und Review** direkt auf der Lineup-Seite: Nur Ersteller ändern ihre noch nicht offiziellen Wurfdaten und reichen sie zum Review ein. Anzeigename, Anleitung, Wurfattribute, Flugzeit, Seite (T, CT oder beide) und Spielkoordinaten sind dort bearbeitbar. Kartenpositionen dürfen Ersteller und Plattform-Admins auch nach der Freigabe korrigieren; beide können Review oder Freigabe zurücknehmen. Nur Plattform-Admins vergeben „Offiziell“ und „Must Know“ und dürfen alle Aufnahmen löschen. Ersteller dürfen ihre noch nicht offiziellen Aufnahmen löschen. Andere Nutzer sehen Wurfweg und Anleitung. Review-Fotos und Videos werden auf der eigenen Review-Seite ergänzt.
- **Server**: aufklappbarer Bereich mit den bisherigen Einträgen Übersicht, Einstellungen, Modi & Plugins, Konsole, Benutzer, Diagnose, Logs, Wartung und Dokumentation. Workshop-Maps und Startmap befinden sich in den Servereinstellungen. Die verfügbaren Werkzeuge richten sich nach der Rolle.

Granatentyp, Team, Sammlung und Suche stehen in der URL. Die Teamfilter T und CT zeigen jeweils auch Aufnahmen für beide Seiten. Ältere Aufnahmen ohne Zuordnung bleiben unter „Alle“ sichtbar. Beim Wechsel zur Detailseite und zurück bleiben sie erhalten. `/` und `/nades` öffnen `/maps`; bisherige Links wie `/nades?map=de_mirage` und `/maps?map=mirage` führen auf die passende Map-Seite. Auch `/nades?view=manage` führt jetzt zur Bibliothek. Die früheren schreibenden Sammel- und Import-Endpunkte sind stillgelegt; Änderungen laufen einzeln über die Eigentümer- und Revisionsprüfung.

„Entwurf speichern“ und „Übernehmen & neu starten“ stehen am Ende der jeweiligen Serverseite. Sie erscheinen nicht in der Nade-Bibliothek oder im Atlas. Der Entwurf wird in MongoDB gespeichert. Beim Übernehmen validiert das Panel Steam-Token und RCON-Passwort, aktualisiert die Runtime-Dateien und startet den CS2-Container neu. Ein manueller Neustart schreibt ebenfalls zuerst den zuletzt gespeicherten Stand in die Runtime; noch ungespeicherte Browser-Änderungen werden dabei nicht übernommen. Nades werden separat und ohne Serverneustart gespeichert. Das Aktualisieren oder Speichern eines Bereichs erhält ungespeicherte Änderungen im anderen Bereich.

### VAC und Zugang mit `-insecure`

Plattform-Admins steuern unter **Server → Einstellungen → VAC und Spielzugang** mit „VAC aktivieren“ den nächsten Serverstart:

- **Aktiviert** (Standard): Der Server startet mit VAC. CS2-Clients mit `-insecure` können nicht beitreten.
- **Deaktiviert**: Der Server startet mit `-insecure`, also ohne VAC-Schutz. Clients mit und ohne `-insecure` können beitreten. Damit können automatische Playbook-Reviews über die lokale Command-Pipe auf deinem Coolify-Trainingsserver stattfinden.

Die Änderung wird erst mit **Übernehmen & neu starten** wirksam und trennt dabei verbundene Spieler. „Entwurf speichern“ allein ändert den laufenden Server nicht. Der Schalter ändert keine Steam-Startoptionen der Spieler und verlangt nicht, dass normale Clients ebenfalls mit `-insecure` starten. Andere Zugangsvoraussetzungen wie das Serverpasswort gelten weiterhin. Die [Steam-Dokumentation](https://help.steampowered.com/en/faqs/view/42AB-9A00-E927-1B29) beschreibt `-insecure` als Abschaltung von VAC für den Dedicated Server.

Ältere gespeicherte `-insecure`-Argumente werden automatisch in „VAC deaktiviert“ übernommen. `-insecure` und `-secure` gehören künftig nicht mehr in die zusätzlichen Startargumente; diese Einstellung wird ausschließlich über den VAC-Schalter verwaltet. Match Admins dürfen den VAC-Modus nicht ändern.

Das Dashboard findet den CS2-Container ueber Docker-Compose-Labels. Dafuer ist `/var/run/docker.sock` eingebunden. Dieser Zugriff ist sicherheitsrelevant; das Panel sollte ueber HTTPS und nach Moeglichkeit zusaetzlich per VPN oder IP-Allowlist geschuetzt werden.

## Servermodi und Plugins

Es ist immer genau ein Modus aktiv:

- `MatchZy`: Competitive Matches
- `Nades`: eigenständiges Playbook-Training ohne MatchZy, mit unbegrenzten Granaten, Respawn, Lineups und Trainings-HUD
- `Warmup / Aim Botz`: startet die Workshop-Map `Aim Botz - Aim Training (CS2)` (`3070244462`) fuer Solo-Aim-Training mit Bots
- `Vanilla + framework`: Metamod und CounterStrikeSharp ohne Match-Plugin

Bei bestehenden Installationen wird ein gespeicherter Executes-Modus beim Update auf MatchZy umgestellt. Der naechste CS2-Start entfernt die alten Executes-Plugin-Dateien aus dem persistenten Volume.

Metamod und CounterStrikeSharp sind feste Kernkomponenten. Optional aktivierbar sind WeaponPaints, Fortnite Emotes und Workshop-Maps. Notwendige Abhängigkeiten werden automatisch installiert oder entfernt. SimpleAdmin und Fake RCON werden nicht mehr installiert; vorhandene Dateien entfernt der nächste CS2-Start. Das Playbook-Plugin bleibt in allen Modi für die Rollenprüfung aktiv. Im Nades-Modus entfernt der Bootstrap die MatchZy-DLL, erhält aber die gemeinsame Lineup-Bibliothek. Beim Wechsel zum MatchZy-Modus installiert er MatchZy wieder. [Funktionsumfang und Befehle](docs/playbook.md).

`METAMOD=latest` waehlt den neuesten verfuegbaren 2.0-Linux-Build ab `1467`. Aktuelle CounterStrikeSharp-Versionen benoetigen Metamod-Plugin-Schnittstelle 18. Fuer aeltere CounterStrikeSharp-Versionen mit Schnittstelle 17 kann `METAMOD=compatible` (Build `1411`) gesetzt werden. Beide Komponenten muessen zur gleichen Schnittstelle passen.

WeaponPaints benoetigt eine eigene Datenbankkonfiguration im erzeugten Plugin-Config-File und kann wegen der Server-Guideline-Einstellung ein Risiko fuer den Steam-Token darstellen. Das Dashboard zeigt deshalb eine Warnung an.

## Steam-Anmeldung und Rollen

Die Website verwendet [Steams OpenID-Anmeldung](https://steamcommunity.com/dev). Dafür ist kein Steam-Web-API-Key nötig. Steam bestätigt die Steam64-ID; Passwörter werden nur bei Steam eingegeben. Die feste Callback-Adresse lautet `ADMIN_PANEL_PUBLIC_URL/api/auth/steam/callback`. Hinter Coolify muss die konfigurierte öffentliche Adresse der Browser-Adresse entsprechen.

| Rolle | Website | Spielserver |
| --- | --- | --- |
| Admin | Alle Bereiche, Benutzerverwaltung, Nade-Freigaben und Server-Konsole | Alle Rechte |
| Match Admin | Alle Nades und Maps lesen, eigene noch nicht offizielle Aufnahmen bearbeiten und einreichen, Workshop-Maps hinzufügen, Servermodus, Plugins und Colored Smokes ändern, RCON senden | Panel und MatchZy-Befehle; keine Nade-Aufnahmen bearbeiten, importieren oder löschen |
| Trainingsspieler | Nur Maps und Lineups ansehen, persönliche Website-Favoriten speichern | `.nades` und Panel-Bedienung im Practice-Modus, Trainingswerkzeuge, persönliche Favoriten und Map-Abstimmungen; keine Serververwaltung oder Lineup-Bearbeitung |
| Player | Alle Nades und Maps ansehen, persönliche Website-Favoriten speichern, eigene noch nicht offizielle Aufnahmen bearbeiten und einreichen | Spielen; kein Panel und keine MatchZy-Befehle, auch kein `.ready` |

Neue Steam-Logins werden dauerhaft als Player gespeichert. Unter „Benutzer“ kann ein Admin Namen und Rollen ändern oder Steam64-IDs vorab anlegen. Trainingsspieler erhalten keine CounterStrikeSharp-Adminflags. Im MatchZy-Modus startet ein Admin oder Match Admin Practice mit `.prac`; der Servermodus Nades startet das eigenständige Playbook-Training. Trainingsspieler können weder den Modus ändern noch Maps direkt wechseln oder RCON verwenden. Eine Umstellung auf Player entzieht auch den Panel-Zugang. Die eigene Admin-Rolle kann nur ein anderer Admin ändern.

Für Trainingsspieler genügt `.nades` im Chat, sobald sie einem Team beigetreten und gespawnt sind. Das Panel ist mit der Maus bedienbar; nach dem Ausblenden öffnet `.nades` es erneut. Shortcuts werden nie automatisch installiert. Freiwillige Binds muss jeder Spieler in seiner eigenen Konsole setzen.

Vorhandene Owner und alte Einträge mit Root-Rechten werden als Admin übernommen. Match Operator wird Match Admin; Moderator und andere Custom-Rollen werden Player. Es gibt keine frei vergebbaren Flags mehr. Die Migration überschreibt keine bereits umgestellten Benutzer. Nach dem Update sind alte Passwort-Sitzungen ungültig; `ADMIN_PANEL_PASSWORD` kann aus Coolify entfernt werden.

Die Website liest die Rolle bei jeder Anfrage aus MongoDB. Zufällige Sitzungstokens werden nur gehasht gespeichert und laufen nach zwölf Stunden ab. Abmelden widerruft die Sitzung. Steam-Rückleitungen sind an eine einmalig verwendbare Browser-Anmeldung gebunden. Schreibende Browser-Anfragen müssen von der konfigurierten Website stammen.

Das Panel schreibt Rollen und feste CounterStrikeSharp-Rechte in das Runtime-Volume. Die gebündelte Server-Erweiterung prüft Rollen vor Konsolen- und Chatbefehlen und lädt geänderte CSS-Rechte innerhalb weniger Sekunden. MatchZys eigene `admins.json` bleibt leer, `matchzy_everyone_is_admin` ist beim Start deaktiviert. Das Ingame-Panel bleibt kompakt mit neun Listenplätzen.

## Server-Konsole

Admin und Match Admin können unter „Server-Konsole“ RCON-Befehle wie `status` senden. Der Chat zeigt die Serverantwort oder einen Verbindungsfehler. Er verwendet das RCON-Passwort der angewendeten Serverkonfiguration; ein Neustart ist zum Senden nicht nötig. Der Verlauf bleibt nur im geöffneten Browserfenster. Im Audit werden Steam-ID und Ergebnis gespeichert, keine Befehle mit möglichen Passwörtern.

RCON ist wie gewünscht uneingeschränkt. Ein Match Admin kann darüber auch administrative Serverbefehle ausführen. Die Schreibsperren für Nades und Map-Daten gelten für Website und direkte Ingame-Befehle, nicht als Isolation gegenüber uneingeschränktem RCON.


## Nades und Bilder

Das Playbook-Plugin wird unter dem kompatiblen Dateinamen `MatchZyNades.dll` in allen Modi für die Rollenprüfung installiert. Das Trainingspanel ist für Admin, Match Admin und Trainingsspieler im eigenständigen Nades-Training und in MatchZy Practice verfügbar. Aufnahmen dürfen nur Admins erstellen. Das feste Panorama-HUD bietet Mausbedienung, persönliche Hotkeys, Favoriten und pro Steam-ID gespeicherte Einstellungen. Granaten-Bibliothek, Aufnahme und Trainingswerkzeuge bleiben enthalten. **Vor Aktivierung müssen die HUD-Assets kompiliert und auf den Clients verfügbar sein**; der C#-Build allein reicht nicht. Unter **Server → Trainings-HUD** lassen sich das Panel und die Workshop-Auslieferung getrennt einschalten und die Workshop-ID hinterlegen. Für lokale Entwicklung das HUD aktivieren und die Workshop-Auslieferung ausschalten. Mit **Apply & restart** übernehmen. Anleitung, lokale Build-Befehle und aktueller Abnahmestand: [Training-HUD](training-hud/README.md). CounterStrikeSharp API 374+ ist erforderlich.

Unter Windows aktualisiert ein Doppelklick auf [hud.cmd](hud.cmd) den lokalen Review-Stand: Git-Pull, Panorama-Panel bauen und installieren, Electron-App testen und bauen, Playbook direkt öffnen. CS2 vorher vollständig beenden. Voraussetzungen: Git, PowerShell 7, Node.js 22+ einschließlich npm, .NET SDK 10 und CS2 Workshop Tools. In der geöffneten App **Server → Reviews** wählen, CS2 starten und das Spielbild freigeben. Der Server benötigt zusätzlich das aktuelle Playbook-Plugin. Ein Workshop-Release bleibt separat über `hud.cmd -Mode release` verfügbar.

Unter **Server → Modi & Plugins** zeigt eine Statuskarte, ob das Menü fehlt, nur installiert oder vom laufenden Plugin bestätigt ist. **Loaded** basiert auf einer aktuellen Rückmeldung aus diesem Containerstart und zeigt auch den Practice-Zustand. **Diagnostics** prüft das Menü separat. Nach dem Update müssen sowohl Dashboard als auch CS2 neu gebaut und deployed werden.

Direkte Zifferntasten 1–9 sind mit einer optionalen Client-CFG moeglich; ohne Binds funktioniert auch `.nades 1` bis `.nades 9`. [Bedienung, Installation und Testablauf](docs/nades-menu.md) sowie [Zifferntasten-CFG](docs/nades-menu.cfg). Nach dem Repository-Update muss das CS2-Image neu gebaut werden.

Nades werden in MongoDB gespeichert und bidirektional mit folgender Datei synchronisiert:

```text
game/csgo/cfg/MatchZy/savednades.json
```

Panel-Aenderungen werden ohne Server-Neustart geschrieben. Ingame-Aenderungen werden beim naechsten Sync importiert. Lineup-Bilder liegen lokal im persistenten Volume `admin_panel_uploads`; es wird kein externer Upload-Dienst benoetigt.

Rückmeldungen zum Speichern, Aktualisieren und Review erscheinen direkt an der jeweiligen Aktion. Veraltete Änderungen werden abgewiesen, damit eine zwischenzeitliche Bearbeitung oder Freigabe nicht überschrieben wird.

Neue Playbook-Aufnahmen verwenden immer die Steam-ID des Erstellers als Owner. Unter „Alle“ sind alle Aufnahmen sichtbar; nur der Ersteller bearbeitet seine noch nicht offiziellen Aufnahmen. `.nades save` startet die Aufnahme. MatchZys alte `.savenade`- und Importbefehle stehen im eigenständigen Nades-Modus nicht zur Verfügung.

Beim Import einer Ingame-Aenderung behaelt das Panel vorhandene Bildzuordnungen fuer dasselbe Lineup (Owner, Map und Name) bei. MatchZys eigene JSON-Datei enthaelt weiterhin nur die Felder, die das Plugin versteht.

## Maps und Radarpositionen

Die Granaten- und Team-Symbole von [CSNADES.gg](https://csnades.gg/mirage) liegen lokal unter `admin-panel/client/public/assets/nades`. `sources.json` dokumentiert die Originaldateien und ihre SHA-256-Prüfsummen. Filter, Listen und Radarmarker laden ausschließlich die lokalen Dateien; die Website muss dafür nicht erreichbar sein.

Der Maps-Bereich enthaelt den Active-Duty-Pool aus CS2 Season Five: Mirage, Dust II, Nuke, Inferno, Ancient, Anubis und Cache. Valve hat Cache am 8. Juli 2026 fuer Overpass eingewechselt. Der zusaetzliche Referenzkatalog uebernimmt die Reserve- und Community-Maps aus dem [CSNADES-Map-Index](https://csnades.gg/maps). Fuer alle 18 Karten liegt eine lokale Radaransicht im Panel; die Auswahl haengt deshalb nicht von der Erreichbarkeit von CSNADES ab.

Eigene Workshop-Maps werden mit Anzeigename, internem BSP-Namen und Steam-Workshop-ID gespeichert. Optional kann eine Radaransicht hochgeladen oder per URL hinterlegt werden; ihr kompletter Bildrahmen ist die feste Platzierungsgrenze. Dieselbe Workshop-ID landet in `workshopMaps`, sodass MultiAddonManager die Map nach `Apply maps & restart` laedt. Der interne Map-Name verbindet die Map-Karte mit den passenden MatchZy-Nades.

Die Kartenansicht zeichnet jede vollstaendig platzierte Nade auf dem echten Radar ein: Kreis fuer die Wurfposition, Raute fuer den Landepunkt und eine farbige, gerichtete Verbindung dazwischen. Die Kurve visualisiert die Richtung in der Draufsicht, nicht die ballistische Flughoehe. Ein Klick auf eine Route oeffnet das Lineup zum Bearbeiten.

Ersteller vervollständigen ihre noch nicht offiziellen Aufnahmen direkt auf der jeweiligen Lineup-Seite:

1. Start- und Zielbezeichnung eintragen.
2. Bei Bedarf die Koordinaten für Start, Blickwinkel und Landepunkt bearbeiten.
3. Links oben „Start und Ziel setzen“ beziehungsweise „Positionierung bearbeiten“ öffnen und auf dem Radar zuerst den Start und danach das Ziel anklicken.
4. Speichern; die Route erscheint sofort in der Kartenansicht.

Alle Granatentypen verwenden dieselbe Kartenansicht. Die Platzierungswerkzeuge öffnen sich nur bei Bedarf. Ersteller und Plattform-Admins können Start und Ziel auch nach der offiziellen Freigabe setzen oder korrigieren. „Positionierung speichern“ ändert nur die Kartenmarkierungen und erhält den Review-Status. Fehlen ausreichende Referenzen auf einer Map, ist keine automatische Positionierung möglich: Manuell gesetzte Markierungen mit zugehörigen Spielkoordinaten liefern diese Referenzen. Korrekturen werden für automatisch positionierte Nades derselben Map übernommen; manuelle Positionen behalten Vorrang. Auf Nuke werden die Positionen wegen der getrennten Stockwerke immer manuell gesetzt.

„Freigabe zurücknehmen“ ist auf der Detailseite und im Review für Ersteller und Plattform-Admins verfügbar. Die Aufnahme und ihre Medien bleiben erhalten und unter „Alle“ sichtbar; „Offiziell“ und „Must Know“ werden entfernt. Der Ersteller kann die Aufnahme anschließend wieder vollständig bearbeiten und erneut zum Review einreichen. Ein noch offenes Review lässt sich über „Review zurücknehmen“ zurückziehen.

Die Radarpositionen werden normiert zwischen `0` und `1` gespeichert. Dadurch bleiben sie unabhaengig von Bildschirmgroesse und Bildauflösung. `landingPos`, `throwFromTitle`, `throwToTitle`, `radarFrom` und `radarTo` sind Panel-Metadaten in MongoDB. Sie werden beim Ingame-Sync erhalten, aber nicht in MatchZys `savednades.json` geschrieben, weil das Plugin diese Felder nicht kennt.

## Wartung und Diagnose

Der automatische Neustart ist standardmäßig alle zwei Stunden aktiv und kann unter „Wartung“ deaktiviert werden. Der erste Versuch erfolgt zwei Stunden nach Aktivierung des neuen Schedulers. Vor jedem Versuch prüft das Panel per RCON die verbundenen Spieler. Sind noch Spieler verbunden, wird der Neustart übersprungen und eine Stunde später erneut geprüft. Bots verhindern den Neustart nicht. Bei fehlgeschlagener oder nicht auswertbarer Spielerprüfung sowie einem fehlgeschlagenen Neustart wartet das Panel ebenfalls eine Stunde. Nach einem erfolgreichen Neustart beginnt der Zwei-Stunden-Takt erneut. MongoDB speichert den nächsten Versuch auch über Panel-Neustarts hinweg und verhindert doppelte Ausführungen durch mehrere Panel-Instanzen. Die bisherigen Einstellungen `restartTime` und `restartTimezone` werden für diesen Takt nicht mehr verwendet.

Diagnostics prueft:

```text
CS2 container -> Mod bootstrap -> Metamod -> CounterStrikeSharp -> aktiver Servermodus
```

Installierte Versions-Tags werden in folgender JSON-Datei gespeichert:

```text
/home/steam/cs2-dedicated/.mod-installer/state.json
```

`Repair mods once` aktiviert fuer einen Start eine vollstaendige Neuinstallation der Mods. Nach Erfolg, Fehler oder Timeout setzt das Panel den Schalter automatisch zurueck.

Auf gehaerteten Linux-Hosts kann CounterStrikeSharp sonst mit `cannot enable executable stack as shared object requires` abgewiesen werden. Der Bootstrap entfernt das problematische ELF-Flag deshalb bei jedem Start automatisch. Nach einem Repository-Update muss das CS2-Image neu gebaut und deployed werden; ein reiner Neustart des alten Containers uebernimmt den neuen Bootstrap nicht.

Der Compose-Projektname `cs2-matchzy`, Datenbanknamen, Plugin-Dateinamen und die bisherigen Speicherpfade bleiben technische Kompatibilitätsnamen. Eine Änderung des Compose-Namens würde andere persistente Volumes auswählen. Das sichtbare Branding, der Standard-Servername und der gemeinsame Chat-Präfix heißen Playbook. Eigene Servernamen und Präfixe bleiben erhalten.

## Persistente Volumes

| Volume | Inhalt |
| --- | --- |
| `admin_panel_mongodb` | Dashboard-Settings, Admins, Nades und Aktionen |
| `admin_panel_runtime` | private JSON-Dateien fuer den CS2-Start |
| `admin_panel_uploads` | Lineup-Bilder |
| `cs2_data` | Gameserver, Mods und generierte Configs |

## Checks

```bash
docker compose config
docker compose ps
docker compose logs admin-panel
docker compose logs cs2
```

Der oeffentliche Healthcheck des Panels ist:

```text
GET /healthz
```

Nach Aenderungen an `cs2/` oder `admin-panel/` muss die gesamte Compose-Ressource neu gebaut und deployed werden. Ein einfacher Container-Neustart verwendet weiterhin das vorhandene Image.

Wenn ein persistiertes `pre.sh` versehentlich als Ordner vorliegt, korrigiert das Entry-Point-Skript diesen Zustand beim Start automatisch.

Nades erhalten eindeutige IDs aus sieben Groß-/Kleinbuchstaben und Ziffern. Beim API-Start werden bestehende IDs automatisch migriert; die ursprünglichen Einträge bleiben in MongoDB unter `nades/before-short-ids-v1` gesichert. Alte Website-Links funktionieren weiterhin. Owner, Map und interne Ingame-Namen sowie persönliche Favoriten bleiben unverändert.
