# Playbook

Playbook verwaltet CS2-Granaten-Lineups, Teams, rollenbasierte Strats und einen Dedicated Server über ein geschütztes Web-Dashboard für Docker Compose oder Coolify. Servername, Steam-Registrierung, RCON, Spielmodus, Plugins, Versionen, Admins, Workshop-Maps, Nades und Wartung werden im Dashboard gepflegt.

## Lokal entwickeln

Voraussetzungen sind Node.js ab Version 22 und ein laufender Docker-Dienst mit Docker Compose ab Version 2.22. Auf macOS und Windows eignet sich Docker Desktop.

Im Repository starten:

```bash
./dev.sh
```

Unter Windows oder ohne Bash funktioniert `node dev.mjs`. Auch `cd admin-panel` und `pnpm dev` starten dieselbe Umgebung. Eine lokale Installation der npm-Abhängigkeiten ist dafür nicht nötig; sie werden im Docker-Image installiert.

Das Skript startet MongoDB, die API, den Demo-Worker und Vite unter `http://localhost:5173`. Vite lädt Frontend-Änderungen direkt nach. Änderungen unter `admin-panel/src` bauen die API automatisch neu und starten sie wieder. Währenddessen können API-Anfragen kurz fehlschlagen. Strg+C beendet die Container. Datenbank, Uploads und Runtime-Dateien bleiben in eigenen Volumes des Compose-Projekts `cs2-matchzy-dev` erhalten.

Für den Zugriff über eine LAN- oder Tailscale-Adresse die tatsächliche Browser-Adresse angeben:

```bash
./dev.sh --url http://100.109.17.79:5173
```

Beim ersten Start legt das Skript `.env.development` mit dieser Adresse und einem zufälligen Session-Secret an. Die Datei wird von Git ignoriert. Für Admin-Rechte die eigene 17-stellige Steam64-ID in `ADMIN_PANEL_ADMIN_STEAM_ID` eintragen und die Entwicklungsumgebung neu starten. Alternativ beim Start `--admin DEINE_STEAM64_ID` übergeben. Die konfigurierte Steam-ID erhält in der Entwicklungsumgebung auch bei einem bestehenden Player-Konto Admin-Rechte. Name, Favoriten und andere Benutzer bleiben erhalten. Im Deployment bleibt die Variable auf das Anlegen eines neuen Admin-Kontos beschränkt.

Steam verwendet die konfigurierte Adresse für den Callback. Deshalb das Dashboard immer über diese Adresse öffnen. `--url` und `--admin` überschreiben die Dateieinstellungen für den aktuellen Start; dauerhafte Änderungen gehören in `.env.development`. Bereits gesetzte Umgebungsvariablen haben ebenfalls Vorrang vor der Datei. Für einen anderen Port beispielsweise `./dev.sh --url http://localhost:5174` verwenden.

Vite verwendet den gewählten Port auch im Container und zeigt die tatsächliche Browser-Adresse an. Die API läuft intern weiterhin auf Port 8080. Vite leitet `/api` dorthin weiter; der Browser verwendet ausschließlich die konfigurierte öffentliche Adresse.

### HTTPS über Tailscale

Auf Sebastians Mac ist die Entwicklungsadresse `https://sebastian-mac.spitz-werner.ts.net:8443`. Tailscale Serve übernimmt HTTPS und leitet an Vite auf `127.0.0.1:5173` weiter. Andere Geräte benötigen Zugang zum selben Tailnet.

Die lokale `.env.development` enthält dafür zusätzlich zum Session-Secret:

```dotenv
ADMIN_PANEL_PUBLIC_URL=https://sebastian-mac.spitz-werner.ts.net:8443
DEV_PORT=5173
DEV_BIND_ADDRESS=127.0.0.1
```

Die Weiterleitung wird einmalig eingerichtet:

```bash
tailscale serve --bg --https=8443 http://127.0.0.1:5173
```

Danach startet `./dev.sh` die Umgebung mit dieser Adresse. Steam-Anmeldung und Vites automatisches Neuladen verwenden ebenfalls die HTTPS-Adresse. Der Vite-Port bleibt lokal erreichbar. Ein anderer interner Port lässt sich mit `--port` wählen; dann muss auch das Ziel der Tailscale-Weiterleitung angepasst werden. HTTPS benötigt diesen vorgeschalteten Proxy, Vite selbst stellt kein Zertifikat aus.

Zum Entfernen ausschließlich dieser Weiterleitung: `tailscale serve --https=8443 off`. [Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve) speichert die mit `--bg` eingerichtete Weiterleitung über Neustarts hinweg; Docker Desktop und die Entwicklungsumgebung müssen für den Zugriff laufen.

Ein bisher separat gestartetes Vite zuerst beenden, falls Port 5173 belegt ist. `pnpm dev:client` startet weiterhin nur das Frontend und benötigt eine separat erreichbare API auf Port 8080. Genau diese fehlende API verursachte bisher HTTP 500 beim Steam-Login mit `pnpm dev`.

Die Entwicklungsumgebung startet keinen CS2-Gameserver und erhält keinen Docker-Socket. Anmeldung, Dashboard und gespeicherte Daten lassen sich lokal entwickeln; Gameserver-Steuerung und Live-Diagnosen benötigen den vollständigen Deployment-Stack.

## Live-Aktualisierungen

Jeder angemeldete Browser verwendet eine gemeinsame WebSocket-Verbindung unter `/api/live`. Das erste Laden und das Speichern von Inhalten verwenden HTTP-Anfragen. Gemeinsame Demo-Wiedergabe und Anwesenheit verwenden zusätzlich bestätigte WebSocket-Befehle. Änderungen an Teams, Strats, aktiven Taktiken, Nades, Favoriten, Benutzerrechten und Servereinstellungen werden nach dem Speichern an die geöffneten Ansichten gesendet. Der bisherige Nade-SSE-Endpunkt bleibt für ältere Clients verfügbar.

HTTP und WebSocket verwenden dieselben Datenabfragen und RBAC-Prüfungen. Vor jedem Versand wird die Sitzung erneut geprüft. Fremde Teams, unveröffentlichte Entwürfe und Serverdaten ohne passende Rolle werden nicht übertragen. Entzogene Mitgliedschaften leeren offene Teamansichten; eine beendete Sitzung schließt die Verbindung. Der Server akzeptiert nur die konfigurierte öffentliche Herkunft, begrenzt Abonnements und Nachrichten und trennt Clients, die keine Daten mehr abnehmen.

Bei einer Unterbrechung zeigt die Oberfläche den Verbindungsstatus und verbindet sich automatisch neu. Danach sendet der Server vollständige aktuelle Ansichten. Ungespeicherte Server- und Strat-Entwürfe bleiben erhalten; parallele Strat-Änderungen müssen vor dem Speichern abgeglichen werden.

Docker-Ereignisse und Logausgaben lösen Server-Updates aus. Dateien des bestehenden Ingame-Plugins werden beobachtet. Als Rückfallebene prüft die API abonnierte Logs jede Sekunde, den Serverstatus alle zwei Sekunden, die Live-Map alle drei Sekunden und Diagnosen alle zehn Sekunden. Diese Prüfungen laufen auf dem Server; im Browser entfallen die wiederkehrenden HTTP-Abfragen. Der Ingame-Dateiabgleich und die Capture-Leases behalten ihr bestehendes Protokoll. Es gibt weiterhin keinen CS2-Gameserver im lokalen Entwicklungsstack.

Ein vorgeschalteter Proxy muss WebSocket-Upgrades für `/api/live` an denselben API-Port weiterreichen. Vite und die lokale Tailscale-Weiterleitung unterstützen das bereits. In Produktion verwendet der Browser automatisch `wss://` mit der konfigurierten HTTPS-Adresse. Die Umsetzung läuft innerhalb einer API-Instanz; mehrere API-Replikate benötigen zusätzlich einen gemeinsamen Ereignisverteiler.

## Demoanalyse und Team-Reviews

Unter **Analyse** könnt ihr heruntergeladene FACEIT- und Premier-Demos hochladen, Runden auf dem Radar ansehen und Szenen für einen Team-Review vorbereiten. Der Captain steuert die gemeinsame Wiedergabe über WebSocket. Mitglieder können selbst nachsehen, wieder folgen und Erkenntnisse festhalten. Aus einer Szene entsteht ein Strat-Entwurf; Beispiele lassen sich auch mit bestehenden Strats und Spieleraufgaben verbinden.

Uploads sind zunächst privat, sofern beim Hochladen kein Team gewählt wird. Eine spätere Teamfreigabe ist ausdrücklich möglich. Die Verarbeitung läuft im neuen Dienst `demo-worker`; API und Worker benötigen das gemeinsame Demo-Volume. Eine laufende Entwicklungsumgebung nach diesem Update einmal neu starten, damit der zusätzliche Dienst und das Volume eingebunden werden.

Manuelle Datei-Uploads (`.dem`, `.dem.gz`, `.dem.bz2`) bleiben verfügbar. Unter **Live** werden Match- und Team-Besprechungen mit Tonspuren, Präsentationswechseln und Notizen verbunden; Ausschnitte lassen sich als Strat-Erklärungen übernehmen. **Prematch** verbindet Gegnerbesetzung, FACEIT-Wettbewerb, verfügbare Demos und den eigenen Matchplan. **Matchimporte** verwaltet FACEIT-/Steam-Verbindungen, Speicherquoten und Aufbewahrung. Die Quellenzugänge, private Audioablage und noch ausstehenden echten Windows-/Provider-Tests stehen im [Betriebsablauf für Live und Matchvorbereitung](docs/live-analysis-operations.md). KI bleibt eine spätere Erweiterung. Ablauf und Grenzen der Demoanalyse sind in [Demoanalyse und Matchvorbereitung](docs/demo-analysis-plan.md#implementierter-erster-ausbau) beschrieben.

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

Die Website öffnet nach der Anmeldung **All Maps**. Die einklappbare shadcn-Sidebar basiert auf `sidebar-08` und gliedert sich in **Maps**, **Team-Management**, **Strats**, **Server** und **Verwaltung**. Server und Verwaltung erscheinen entsprechend den vergebenen Rechten. Auf dem Handy öffnet sie sich als seitliches Menü.

- **Maps → All Maps**: durchsuchbare Kartenübersicht mit Active Duty, Reserve-Pool, inaktiven Maps, weiteren Spielmodi und Workshop-Maps. Auch nicht installierte Maps bleiben zum Durchstöbern verfügbar.
- **Map-Seiten**, etwa `/maps/mirage`: große Radarkarte mit gruppierten Start- oder Landepositionen. Ein Klick zeigt die zugehörigen Gegenpositionen; mehrere Würfe vom selben Punkt bleiben einzeln auswählbar. Rechts stehen Granatentyp, Sammlung und Suche, darunter eine kompakte Lineup-Liste. „Alle“ zeigt auch ungeprüfte Aufnahmen. Jede Active-Duty-Map ist direkt in der Sidebar verlinkt.
- **Lineup-Seiten** unter `/maps/:map/lineups/:id`: direkt verlinkbare Detailseiten mit Wurfweg, Wurfattributen, Flugzeit und Bildern und kopierbarem Ingame-Befehl. Die ID unterscheidet Owner, Map und internen Namen; ein neuer Anzeigename verändert den Link nicht.
- **Nade hinzufügen** auf der Map-Seite: Plattform-Admins erstellen Nades manuell über den vorhandenen Editor. Name, Granatentyp, Startkoordinaten und Blickwinkel sind erforderlich; Anleitung, Wurfattribute und Radarpositionen können ergänzt werden. Die Nade gehört dem angemeldeten Admin und wird als Entwurf gespeichert. Die Freigaben „Offiziell“ und „Must Know“ erfolgen anschließend auf der Lineup-Seite. Eine Aufnahme im Spiel ist dafür nicht nötig.
- **Favoriten**: über den Stern in der Liste oder auf der Detailseite merken. Website-Favoriten werden in MongoDB pro Steam-ID und vollständiger Lineup-Identität gespeichert. Sie sind unabhängig von den Favoriten des Ingame-Panels.
- **Bearbeiten und Review** direkt auf der Lineup-Seite: Nur Ersteller ändern ihre noch nicht offiziellen Wurfdaten und reichen sie zum Review ein. Anzeigename, Anleitung, Wurfattribute, Flugzeit, Seite (T, CT oder beide) und Spielkoordinaten sind dort bearbeitbar. Kartenpositionen dürfen Ersteller und Plattform-Admins auch nach der Freigabe korrigieren; beide können Review oder Freigabe zurücknehmen. Nur Plattform-Admins vergeben „Offiziell“ und „Must Know“ und dürfen alle Aufnahmen löschen. Ersteller dürfen ihre noch nicht offiziellen Aufnahmen löschen. Andere Nutzer sehen Wurfweg und Anleitung. Review-Fotos und Videos werden auf der eigenen Review-Seite ergänzt.
- **Server**: aufklappbarer Bereich mit den bisherigen Einträgen Übersicht, Einstellungen, Modi & Plugins, Konsole, Diagnose, Logs, Wartung und Dokumentation. Workshop-Maps und Startmap befinden sich in den Servereinstellungen. Die verfügbaren Werkzeuge richten sich nach der Rolle.

Granatentyp, Team, Sammlung und Suche stehen in der URL. Die Teamfilter T und CT zeigen jeweils auch Aufnahmen für beide Seiten. Ältere Aufnahmen ohne Zuordnung bleiben unter „Alle“ sichtbar. Beim Wechsel zur Detailseite und zurück bleiben sie erhalten. `/` und `/nades` öffnen `/maps`; bisherige Links wie `/nades?map=de_mirage` und `/maps?map=mirage` führen auf die passende Map-Seite. Auch `/nades?view=manage` führt jetzt zur Bibliothek. Die früheren schreibenden Sammel- und Import-Endpunkte sind stillgelegt; Änderungen laufen einzeln über die Eigentümer- und Revisionsprüfung.

„Entwurf speichern“ und „Übernehmen & neu starten“ stehen am Ende der jeweiligen Serverseite. Sie erscheinen nicht in der Nade-Bibliothek oder im Atlas. Der Entwurf wird in MongoDB gespeichert. Beim Übernehmen validiert das Panel Steam-Token und RCON-Passwort, aktualisiert die Runtime-Dateien und startet den CS2-Container neu. Ein manueller Neustart schreibt ebenfalls zuerst den zuletzt gespeicherten Stand in die Runtime; noch ungespeicherte Browser-Änderungen werden dabei nicht übernommen. Nades werden separat und ohne Serverneustart gespeichert. Das Aktualisieren oder Speichern eines Bereichs erhält ungespeicherte Änderungen im anderen Bereich.

### VAC und Zugang mit `-insecure`

Server-Admins steuern unter **Server → Einstellungen → VAC und Spielzugang** mit „VAC aktivieren“ den nächsten Serverstart:

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

Die zentrale Rechtematrix steht unter **Verwaltung → Rollen und Rechte**. **Verwaltung → Benutzer** vergibt Plattform- und Serverrollen getrennt. Ein Plattform-Admin bekommt dadurch weder Serverzugriff noch Einsicht in fremde Team-Strats. Teamrollen stehen in der Benutzerübersicht; ändern darf sie ausschließlich der jeweilige Team-Owner.

| Bereich | Feste Rollen |
| --- | --- |
| Plattform | Benutzer; Plattform-Admin für Benutzerverwaltung und administrative Nade-Funktionen |
| Server `primary` | Kein Serverzugriff; Trainingsspieler; Match Admin; Server-Admin |
| Je Team | Mitglied; Captain; Owner |

Neue Steam-Benutzer erhalten keine Serverrechte. Sie dürfen Teams gründen und Einladungen annehmen. Trainingsspieler öffnen mit `.nades` das Panel und verwenden die freigegebenen Trainingswerkzeuge. Match Admins steuern Matches, Modi und erlaubte Optionen. Server-Admins verwalten zusätzlich alle Einstellungen, Neustarts und Diagnose. **Match Admin und Server-Admin besitzen uneingeschränkten RCON-Zugriff.** Nade-Aufnahmen im Spiel erfordern Plattform-Admin und mindestens Trainingsspieler. Die bestehenden Ersteller-, Review- und Favoritenregeln bleiben erhalten.

Beim ersten Start mit RBAC übernimmt `roleAssignments` die bisherigen Rollen: `admin` wird Plattform-Admin plus Server-Admin, `match_admin` und `training_player` behalten ihre jeweilige Serverrolle, `player` wird Benutzer ohne Serverzugriff. Spätere Starts überschreiben diese Zuweisungen nicht. Die eigene Plattform-Admin-Rolle kann nur ein anderer Plattform-Admin entfernen; mindestens einer muss erhalten bleiben. Sichere MongoDB vor dem Update. Eine ältere API-Version versteht getrennte Rollen nicht; für einen Rollback die gesicherte Datenbank zusammen mit der vorherigen Version verwenden.

API und gebündeltes Plugin 2.4.0 gemeinsam neu bauen und deployen. `permissions.json` enthält einen atomaren Berechtigungsstand samt CSS-Flags. Das Plugin prüft effektive Rechte, lädt geänderte CSS-Rechte und bestätigt die Revision in `cfg/MatchZy/permissions-applied.json`. Die Rechtematrix zeigt den Abgleich. Ein fehlender oder ungültiger Export gibt keine privilegierten Funktionen frei. Der temporäre alte Rollenexport erweitert keine Serverrechte eines reinen Plattform-Admins. Das HUD bleibt kompakt mit neun Listenplätzen.

Die Website liest Rechte bei jeder Anfrage aus MongoDB. Sitzungstokens werden gehasht gespeichert und laufen nach zwölf Stunden ab. Abmelden widerruft die Sitzung. Steam-Rückleitungen sind einmalig und an den Browser gebunden; Team-Einladungslinks bleiben über die Anmeldung erhalten. Schreibende Browser-Anfragen müssen von der konfigurierten Website stammen. Das synthetische Testkonto darf keine Teams gründen, Einladungen annehmen oder Serverrechte erhalten.

## Team-Management und Strats

1. Unter **Team-Management** ein Team gründen. Der Gründer ist Owner. Ein Spieler kann mehreren Teams angehören.
2. Als Owner einen Einladungslink erstellen. Er gilt sieben Tage und kann widerrufen werden. Eingeladene Steam-Benutzer bestätigen den Beitritt als Mitglied. Nur der Owner darf Mitglieder entfernen, Captains ernennen und das Eigentum übertragen. Eine Übertragung widerruft offene Einladungen.
3. Unter **Strats** eine Taktik anlegen. Owner und Captains bearbeiten Name, Map, Seite, gemeinsame Erklärung und fünf frei benennbare Plätze. Pro Platz lassen sich ein Teammitglied und geordnete Schritte mit Position, Timing und Nade-Links hinterlegen.
4. Den Entwurf speichern und anschließend veröffentlichen. Mitglieder sehen nur veröffentlichte Strats. **Meine Aufgaben** ist die Standardansicht; **Teamübersicht** zeigt alle Plätze. Noch nicht besetzte Spieler erhalten einen Hinweis.
5. Eine veröffentlichte Strat aktivieren und gemeinsam **Strats → Live-Ansicht** öffnen. Jeder Tab folgt seinem Team aus der URL, mit sofortigen Aktualisierungen über WebSocket. Entwurf und erneute Veröffentlichung verändern die aktive Fassung erst bei erneuter Aktivierung. Archivieren blendet die Bibliotheksfassung aus; ein bereits aktiver Stand bleibt bis zum Beenden erhalten.

Revisionsprüfungen verhindern, dass parallele Änderungen unbemerkt überschrieben werden. Der Editor warnt vor dem Verlassen mit ungespeicherten Änderungen. Nach dem Entfernen eines besetzten Mitglieds muss die Besetzung vor der nächsten Veröffentlichung oder Aktivierung korrigiert werden. Verknüpfte Nades behalten ihre eigenen Rechte und ihren Freigabestatus. Fehlende Nades werden im Schritt angezeigt und verhindern eine erneute Veröffentlichung, bis die Referenz entfernt oder ersetzt wird.

Teams und Strats funktionieren ohne laufenden CS2-Server. Es gibt keinen Import aus `cs-playbook` und keine Ingame-Strat-Ansicht. Technische Details und ursprüngliche Entscheidungen stehen in [Team-Plan](docs/team-playbooks-plan.md) und [RBAC-Plan](docs/rbac-plan.md).

### Tests

Im Verzeichnis `admin-panel` prüfen `pnpm typecheck`, `pnpm build` und `pnpm test` den Webstand. Die vorhandenen Shell-Tests benötigen Bash 4+ und `jq`. Für die MongoDB-Tests zusätzlich `TEST_MONGODB_URI` auf eine erreichbare Testinstanz setzen, zum Beispiel `mongodb://127.0.0.1:27028`. Jeder Test erstellt eine eigene Datenbank mit Präfix `test_` und entfernt sie danach. Ohne diese Variable werden die Datenbanktests übersprungen. Plugin-Tests laufen mit .NET 10 über `dotnet test nades-plugin/MatchZyNades.Tests/MatchZyNades.Tests.csproj` vom Repository-Verzeichnis aus.

## Server-Konsole

Server-Admin und Match Admin können unter „Server-Konsole“ RCON-Befehle wie `status` senden. Der Chat zeigt die Serverantwort oder einen Verbindungsfehler. Er verwendet das RCON-Passwort der angewendeten Serverkonfiguration; ein Neustart ist zum Senden nicht nötig. Der Verlauf bleibt nur im geöffneten Browserfenster. Im Audit werden Steam-ID und Ergebnis gespeichert, keine Befehle mit möglichen Passwörtern.

RCON ist wie gewünscht uneingeschränkt. Ein Match Admin kann darüber auch administrative Serverbefehle ausführen. Die Schreibsperren für Nades und Map-Daten gelten für Website und direkte Ingame-Befehle, nicht als Isolation gegenüber uneingeschränktem RCON.


## Nades und Bilder

Das Playbook-Plugin wird unter dem kompatiblen Dateinamen `MatchZyNades.dll` in allen Modi für die Rollenprüfung installiert. Das Trainingspanel ist für Admin, Match Admin und Trainingsspieler im eigenständigen Nades-Training und in MatchZy Practice verfügbar. Aufnahmen dürfen nur Admins erstellen. Das feste Panorama-HUD bietet Mausbedienung, persönliche Hotkeys, Favoriten und pro Steam-ID gespeicherte Einstellungen. Granaten-Bibliothek, Aufnahme und Trainingswerkzeuge bleiben enthalten. **Vor Aktivierung müssen die HUD-Assets kompiliert und auf den Clients verfügbar sein**; der C#-Build allein reicht nicht. Unter **Server → Trainings-HUD** lassen sich das Panel und die Workshop-Auslieferung getrennt einschalten und die Workshop-ID hinterlegen. Für lokale Entwicklung das HUD aktivieren und die Workshop-Auslieferung ausschalten. Mit **Apply & restart** übernehmen. Anleitung, lokale Build-Befehle und aktueller Abnahmestand: [Training-HUD](training-hud/README.md). CounterStrikeSharp API 374+ ist erforderlich.

Unter Windows aktualisiert ein Doppelklick auf [hud.cmd](hud.cmd) den lokalen Review-Stand: Git-Pull, Panorama-Panel bauen und installieren, Electron-App testen und bauen, Playbook direkt öffnen. CS2 vorher vollständig beenden. Voraussetzungen: Git, PowerShell 7, Node.js 22+ einschließlich npm, .NET SDK 10 und CS2 Workshop Tools. In der geöffneten App **Verwaltung → Reviews** wählen, CS2 starten und das Spielbild freigeben. Der Server benötigt zusätzlich das aktuelle Playbook-Plugin. Ein Workshop-Release bleibt separat über `hud.cmd -Mode release` verfügbar.

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

Im Nades-Modus protokolliert Playbook ab Version `2.3.14` Wiederholungswürfe mit dem Präfix `[Rethrow]`. Jeder `.rt`-/`.rethrow`-Versuch erhält eine Nummer (`Versuch=…`). Die Einträge enthalten den gespeicherten Wurf oder den Ablehnungsgrund, Spieler- und Abwurfposition, Geschwindigkeit, Entity-ID und Handle sowie den Projektilzustand vor/nach Spawn, nach Teleport, im nächsten Frame und nach 0,25, 1, 3, 10 und 30 Sekunden. Modell, RenderMode, CollisionGroup, Besitzer und DetonateTime helfen bei der Diagnose unsichtbarer oder nicht wirksamer Projektile. Die Beobachtung ist auf 64 gleichzeitige Versuche begrenzt und endet beim Trainings-/Map-Reset.

Ab `2.3.18` erscheint beim Erzeugen eines Wiederholungsprojektils keine Diagnosemeldung mehr im Spielchat; Fehler werden weiterhin angezeigt. Zugeordnete Smoke-, Flash-, HE- und Decoy-Ereignisse werden separat geloggt. Molotov-Ereignisse enthalten keine Projektil-ID und werden deshalb ausdrücklich ohne sichere Zuordnung protokolliert. Auch das Verschwinden eines Projektils beweist keine Detonation. Für eine Fehleranalyse die `[Rethrow]`-Einträge vom normalen Wurf bis zum Ende der Beobachtung zusammen mit den angrenzenden Servermeldungen sichern:

```bash
docker compose logs --since 5m cs2
```

Ab `2.3.15` unterscheidet die Diagnose eine ungültige Entity von einem geänderten Handle und protokolliert `OnEntityDeleted`; dieser Callback liefert keinen Löschgrund.

Ab `2.3.16` schreiben die regelmäßigen Trainingsaufgaben ConVars nur bei abweichenden Werten. Die beiden Ein-Sekunden-Timer für Bots und Trainingssitzung melden Laufzeiten ab 2 ms unter `[TrainingPerformance]`, höchstens einmal je Aufgabe pro 10 Simulationssekunden. Diese Laufzeitmessung umfasst auch mögliche Thread-Unterbrechungen und beweist allein keine CPU-Auslastung durch das Plugin. Für die Diagnose von Frame-Spikes diese Meldungen zusammen mit den Engine-Zeitwerten und den `[Rethrow]`-Einträgen sichern.

Ab `2.3.17` erzeugt `.rt` Smoke, HE, Molotov/Incendiary und Decoy mit den jeweiligen nativen Engine-Funktionen; Flashbangs erhalten einen typisierten Spawn. Alle Typen setzen `OwnerEntity`, `Thrower` und `OriginalThrower` auf den Spieler-Pawn. Das Image enthält `playbook-nades.json`; der Bootstrap installiert die Signaturen unter `addons/counterstrikesharp/gamedata/` auch ohne MatchZy im Nades-Modus. Bei fehlender Signatur bricht der Versuch mit einem Fehler im `[Rethrow]`-Log ab, statt ein unvollständig initialisiertes Ersatzprojektil zu erzeugen. Nach Updates ist ein Neubau und ein neuer CS2-Container erforderlich; die nativen Signaturen müssen zum CS2-Build passen.

Wiederholte Wirkungsereignisse mit Entity-ID schließen keine echte Aufnahme oder Flugzeitmessung ab. Bei Molotov-Ereignissen ohne Entity-ID unterscheidet Playbook echte und synthetische Würfe pro Steam-ID. Ein einzelner synthetischer Wurf kann seinem Versuch zugeordnet werden; überlappende Wiederholungswürfe werden ohne erfundene Versuch-ID protokolliert. Überlappen echte Würfe mit anderen Molotov-Würfen desselben Spielers, wird keine Aufnahme abgeschlossen und eine Meldung fordert einen einzelnen Wurf für die Aufnahme an. Die Wirkung im Spiel wird dadurch nicht unterdrückt. Diese Engine-Änderung muss auf dem laufenden CS2-Server für jeden Granatentyp geprüft werden.

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
