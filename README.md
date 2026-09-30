# CS2 + MatchZy Control

Dieses Repository betreibt einen CS2 Dedicated Server und ein geschütztes Web-Dashboard für Docker Compose oder Coolify. Servername, Steam-Registrierung, RCON, Spielmodus, Plugins, Versionen, Admins, Workshop-Maps, Nades und Wartung werden im Dashboard gepflegt.

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
       └─ MatchZy Control
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
- **Map-Seiten**, etwa `/maps/mirage`: ausschließlich die Lineups dieser Map. shadcn-Tabs wählen Alle, Smokes, Flashes, HE, Molotovs oder Decoys. Darunter stehen die Sammlungen Alle, Favoriten, Must Know und Offiziell sowie eine Suche. „Alle“ zeigt auch ungeprüfte Aufnahmen. Jede Active-Duty-Map ist direkt in der Sidebar verlinkt. Der Annotation-Guide bleibt auf der Map-Seite erreichbar.
- **Lineup-Seiten** unter `/maps/:map/lineups/:id`: direkt verlinkbare Detailseiten mit Wurfweg, Wurftechnik, Bildern und kopierbarem Ingame-Befehl. Die ID unterscheidet Owner, Map und internen Namen; ein neuer Anzeigename verändert den Link nicht.
- **Favoriten**: über den Stern in der Galerie oder auf der Detailseite merken. Website-Favoriten werden in MongoDB pro Steam-ID und vollständiger Lineup-Identität gespeichert. Sie sind unabhängig von den Favoriten des Ingame-Panels.
- **Verwalten** in der Nade-Bibliothek: Bibliotheksverwaltung für Plattform-Admins mit Review, Wurfweg- und Bildbearbeitung, Import, Export und Sync-Status.
- **Server**: aufklappbarer Bereich mit den bisherigen Einträgen Übersicht, Einstellungen, Modi & Plugins, Konsole, Benutzer, Diagnose, Logs, Wartung und Dokumentation. Workshop-Maps und Startmap befinden sich in den Servereinstellungen. Die verfügbaren Werkzeuge richten sich nach der Rolle.

Granatentyp, Sammlung und Suche stehen in der URL. Beim Wechsel zur Detailseite und zurück bleiben sie erhalten. `/` und `/nades` öffnen `/maps`; bisherige Links wie `/nades?map=de_mirage` und `/maps?map=mirage` führen auf die passende Map-Seite. `/nades?view=manage` bleibt für die Verwaltung erhalten.

„Entwurf speichern“ und „Übernehmen & neu starten“ stehen am Ende der jeweiligen Serverseite. Sie erscheinen nicht in der Nade-Bibliothek oder im Atlas. Der Entwurf wird in MongoDB gespeichert. Beim Übernehmen validiert das Panel Steam-Token und RCON-Passwort, aktualisiert die Runtime-Dateien und startet den CS2-Container neu. Ein manueller Neustart schreibt ebenfalls zuerst den zuletzt gespeicherten Stand in die Runtime; noch ungespeicherte Browser-Änderungen werden dabei nicht übernommen. Nades werden separat und ohne Serverneustart gespeichert. Das Aktualisieren oder Speichern eines Bereichs erhält ungespeicherte Änderungen im anderen Bereich.

Das Dashboard findet den CS2-Container ueber Docker-Compose-Labels. Dafuer ist `/var/run/docker.sock` eingebunden. Dieser Zugriff ist sicherheitsrelevant; das Panel sollte ueber HTTPS und nach Moeglichkeit zusaetzlich per VPN oder IP-Allowlist geschuetzt werden.

## Servermodi und Plugins

Es ist immer genau ein Modus aktiv:

- `MatchZy`: Competitive Matches
- `Nades`: startet MatchZy mit `matchzy_autostart_mode 2` direkt im Practice-Modus und stellt gespeicherte Lineups bereit
- `Warmup / Aim Botz`: startet die Workshop-Map `Aim Botz - Aim Training (CS2)` (`3070244462`) fuer Solo-Aim-Training mit Bots
- `Vanilla + framework`: Metamod und CounterStrikeSharp ohne Match-Plugin

Bei bestehenden Installationen wird ein gespeicherter Executes-Modus beim Update auf MatchZy umgestellt. Der naechste CS2-Start entfernt die alten Executes-Plugin-Dateien aus dem persistenten Volume.

Metamod und CounterStrikeSharp sind feste Kernkomponenten. Optional aktivierbar sind WeaponPaints, Fortnite Emotes und Workshop-Maps. Notwendige Abhängigkeiten werden automatisch installiert oder entfernt. SimpleAdmin und Fake RCON werden nicht mehr installiert; vorhandene Dateien entfernt der nächste CS2-Start. Die MatchZy-Nades-Erweiterung bleibt in allen Modi für die Rollenprüfung aktiv.

`METAMOD=latest` waehlt den neuesten verfuegbaren 2.0-Linux-Build ab `1467`. Aktuelle CounterStrikeSharp-Versionen benoetigen Metamod-Plugin-Schnittstelle 18. Fuer aeltere CounterStrikeSharp-Versionen mit Schnittstelle 17 kann `METAMOD=compatible` (Build `1411`) gesetzt werden. Beide Komponenten muessen zur gleichen Schnittstelle passen.

WeaponPaints benoetigt eine eigene Datenbankkonfiguration im erzeugten Plugin-Config-File und kann wegen der Server-Guideline-Einstellung ein Risiko fuer den Steam-Token darstellen. Das Dashboard zeigt deshalb eine Warnung an.

## Steam-Anmeldung und Rollen

Die Website verwendet [Steams OpenID-Anmeldung](https://steamcommunity.com/dev). Dafür ist kein Steam-Web-API-Key nötig. Steam bestätigt die Steam64-ID; Passwörter werden nur bei Steam eingegeben. Die feste Callback-Adresse lautet `ADMIN_PANEL_PUBLIC_URL/api/auth/steam/callback`. Hinter Coolify muss die konfigurierte öffentliche Adresse der Browser-Adresse entsprechen.

| Rolle | Website | Spielserver |
| --- | --- | --- |
| Admin | Alle Bereiche, Benutzerverwaltung, Nade-Freigaben und Server-Konsole | Alle Rechte |
| Match Admin | Alle Nades und Maps lesen, Workshop-Maps hinzufügen, Servermodus, Plugins und Colored Smokes ändern, RCON senden | Panel und MatchZy-Befehle; keine Nade-Aufnahmen bearbeiten, importieren oder löschen |
| Player | Alle Nades und Maps ansehen, persönliche Website-Favoriten speichern | Spielen; kein Panel und keine MatchZy-Befehle, auch kein `.ready` |

Neue Steam-Logins werden dauerhaft als Player gespeichert. Unter „Benutzer“ kann ein Admin Namen und Rollen ändern oder Steam64-IDs vorab anlegen. Eine Umstellung auf Player entzieht die Verwaltungsrechte. Die eigene Admin-Rolle kann nur ein anderer Admin ändern.

Vorhandene Owner und alte Einträge mit Root-Rechten werden als Admin übernommen. Match Operator wird Match Admin; Moderator und andere Custom-Rollen werden Player. Es gibt keine frei vergebbaren Flags mehr. Die Migration überschreibt keine bereits umgestellten Benutzer. Nach dem Update sind alte Passwort-Sitzungen ungültig; `ADMIN_PANEL_PASSWORD` kann aus Coolify entfernt werden.

Die Website liest die Rolle bei jeder Anfrage aus MongoDB. Zufällige Sitzungstokens werden nur gehasht gespeichert und laufen nach zwölf Stunden ab. Abmelden widerruft die Sitzung. Steam-Rückleitungen sind an eine einmalig verwendbare Browser-Anmeldung gebunden. Schreibende Browser-Anfragen müssen von der konfigurierten Website stammen.

Das Panel schreibt Rollen und feste CounterStrikeSharp-Rechte in das Runtime-Volume. Die gebündelte Server-Erweiterung prüft Rollen vor Konsolen- und Chatbefehlen und lädt geänderte CSS-Rechte innerhalb weniger Sekunden. MatchZys eigene `admins.json` bleibt leer, `matchzy_everyone_is_admin` ist beim Start deaktiviert. Das Ingame-Panel bleibt kompakt mit neun Listenplätzen.

## Server-Konsole

Admin und Match Admin können unter „Server-Konsole“ RCON-Befehle wie `status` senden. Der Chat zeigt die Serverantwort oder einen Verbindungsfehler. Er verwendet das RCON-Passwort der angewendeten Serverkonfiguration; ein Neustart ist zum Senden nicht nötig. Der Verlauf bleibt nur im geöffneten Browserfenster. Im Audit werden Steam-ID und Ergebnis gespeichert, keine Befehle mit möglichen Passwörtern.

RCON ist wie gewünscht uneingeschränkt. Ein Match Admin kann darüber auch administrative Serverbefehle ausführen. Die Schreibsperren für Nades und Map-Daten gelten für Website und direkte Ingame-Befehle, nicht als Isolation gegenüber uneingeschränktem RCON.


## Nades und Bilder

`MatchZyNades` wird in allen Modi für die Rollenprüfung installiert. Das Trainingspanel ist für Admin und Match Admin im Practice-Modus verfügbar. Aufnahmen dürfen nur Admins erstellen. Das feste Panorama-HUD bietet Mausbedienung, persönliche Hotkeys, Favoriten und pro Steam-ID gespeicherte Einstellungen. Granaten-Bibliothek, Aufnahme und Trainingswerkzeuge bleiben enthalten. **Vor Aktivierung müssen die HUD-Assets kompiliert und auf den Clients verfügbar sein**; der C#-Build allein reicht nicht. Unter **Server → Trainings-HUD** lassen sich das Panel und die Workshop-Auslieferung getrennt einschalten und die Workshop-ID hinterlegen. Für lokale Entwicklung das HUD aktivieren und die Workshop-Auslieferung ausschalten. Mit **Apply & restart** übernehmen. Anleitung, lokale Build-Befehle und aktueller Abnahmestand: [Training-HUD](training-hud/README.md). CounterStrikeSharp API 374+ ist erforderlich.

Unter **Server → Modi & Plugins** und **Verwalten** in der Nade-Bibliothek zeigt eine Statuskarte, ob das Menü fehlt, nur installiert oder vom laufenden Plugin bestätigt ist. **Loaded** basiert auf einer aktuellen Rückmeldung aus diesem Containerstart und zeigt auch den Practice-Zustand. **Diagnostics** prüft das Menü separat. Nach dem Update müssen sowohl Dashboard als auch CS2 neu gebaut und deployed werden.

Direkte Zifferntasten 1–9 sind mit einer optionalen Client-CFG moeglich; ohne Binds funktioniert auch `.nades 1` bis `.nades 9`. [Bedienung, Installation und Testablauf](docs/nades-menu.md) sowie [Zifferntasten-CFG](docs/nades-menu.cfg). Nach dem Repository-Update muss das CS2-Image neu gebaut werden.

Nades werden in MongoDB gespeichert und bidirektional mit folgender Datei synchronisiert:

```text
game/csgo/cfg/MatchZy/savednades.json
```

Panel-Aenderungen werden ohne Server-Neustart geschrieben. Ingame-Aenderungen werden beim naechsten Sync importiert. Lineup-Bilder liegen lokal im persistenten Volume `admin_panel_uploads`; es wird kein externer Upload-Dienst benoetigt.

Der Nades-Bereich zeigt, ob beide Sync-Dateien erreichbar sind, wann der letzte Abgleich bestaetigt wurde und in welche Richtung zuletzt Daten uebertragen wurden. Er prueft den Status alle 2,5 Sekunden. Aendert MatchZy die Bibliothek, weist das Panel auf die neuere Fassung hin.

`Save new in-game lineups for everyone` setzt MatchZys globale Nade-Option. Nach `Apply sharing & restart` speichert `.savenade` neue Lineups unter dem MatchZy-Owner `default`; damit können Admin und Match Admin sie mit `.listnades` sehen und mit `.loadnade` laden. Bereits privat gespeicherte Lineups bleiben privat und werden im Panel entsprechend markiert.

Beim Import einer Ingame-Aenderung behaelt das Panel vorhandene Bildzuordnungen fuer dasselbe Lineup (Owner, Map und Name) bei. MatchZys eigene JSON-Datei enthaelt weiterhin nur die Felder, die das Plugin versteht.

## Maps und Valve Map Guides

Der Maps-Bereich enthaelt den Active-Duty-Pool aus CS2 Season Five: Mirage, Dust II, Nuke, Inferno, Ancient, Anubis und Cache. Valve hat Cache am 8. Juli 2026 fuer Overpass eingewechselt. Der zusaetzliche Referenzkatalog uebernimmt die Reserve- und Community-Maps aus dem [CSNADES-Map-Index](https://csnades.gg/maps). Fuer alle 18 Karten liegt eine lokale Radaransicht im Panel; die Auswahl haengt deshalb nicht von der Erreichbarkeit von CSNADES ab.

Eigene Workshop-Maps werden mit Anzeigename, internem BSP-Namen und Steam-Workshop-ID gespeichert. Optional kann eine Radaransicht hochgeladen oder per URL hinterlegt werden; ihr kompletter Bildrahmen ist die feste Platzierungsgrenze. Dieselbe Workshop-ID landet in `workshopMaps`, sodass MultiAddonManager die Map nach `Apply maps & restart` laedt. Der interne Map-Name verbindet die Map-Karte mit den passenden MatchZy-Nades.

Die Kartenansicht zeichnet jede vollstaendig platzierte Nade auf dem echten Radar ein: Kreis fuer die Wurfposition, Raute fuer den Landepunkt und eine farbige, gerichtete Verbindung dazwischen. Die Kurve visualisiert die Richtung in der Draufsicht, nicht die ballistische Flughoehe. Ein Klick auf eine Route oeffnet das Lineup zum Bearbeiten.

Neue und bereits aus MatchZy importierte Lineups lassen sich ueber `Add nade` beziehungsweise `Edit route` vervollstaendigen:

1. Start- und Zielbezeichnung eintragen.
2. `getpos` am Abwurfpunkt sowie am Landepunkt einfuegen.
3. Auf dem Radar zuerst den Start und danach das Ziel anklicken.
4. Speichern; die Route erscheint sofort in der Kartenansicht.

Die Radarpositionen werden normiert zwischen `0` und `1` gespeichert. Dadurch bleiben sie unabhaengig von Bildschirmgroesse und Bildauflösung. `landingPos`, `throwFromTitle`, `throwToTitle`, `radarFrom` und `radarTo` sind Panel-Metadaten in MongoDB. Sie werden beim Ingame-Sync erhalten, aber nicht in MatchZys `savednades.json` geschrieben, weil das Plugin diese Felder nicht kennt.

Valves Map Guides verwenden ein anderes Dateiformat als MatchZy. `savednades.json` kennt Standposition und Blickwinkel. Eine Grenade-Annotation braucht zusaetzlich den Landepunkt, den der CS2-Client nach dem Wurf erfasst. Deshalb erzeugt das Panel keine unvollstaendigen Annotation-Dateien. Der Guide im Maps-Bereich enthaelt stattdessen fuer jede ausgewaehlte Map die aktuellen Befehle zum Erstellen, Speichern, Laden, Aufteilen und Veroeffentlichen im Steam Workshop. Seit dem [Map-Guide-Update vom 18. Maerz 2026](https://www.counter-strike.net/newsentry/532126482488623353) gilt `sv_allow_annotations_access_level 2` fuer den Editiermodus. Lokale Sessions erlauben 300 Nodes; Competitive und Retakes sind standardmaessig auf 30 Nodes und die ersten fuenf Runden je Haelfte begrenzt.

## Wartung und Diagnose

Der geplante Neustart ist standardmaessig taeglich um `05:00` in `Europe/Vienna` aktiv und kann im Dashboard geaendert oder deaktiviert werden. MongoDB stellt sicher, dass mehrere Panel-Instanzen denselben Tages-Slot nicht doppelt ausfuehren.

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
