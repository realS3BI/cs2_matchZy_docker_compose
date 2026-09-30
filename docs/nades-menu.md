# Trainingszentrale im Spiel (1.9.0)

Das kompakte Panorama-HUD bleibt am rechten Bildschirmrand. Es hat eine mittige Überschrift, Breadcrumb, neun feste Listenplätze, Zurück/Seitenwechsel/Seitenzahl/Home und vier Beschreibungszeilen über die volle Breite. Längere Texte werden mit Auslassungspunkten gekürzt. Unterhalb der Beschreibung gibt es keine Hinweise oder Modusindikatoren mehr.

## Aktivieren und Practice prüfen

CS2- und Dashboard-Image gemeinsam aktualisieren; CounterStrikeSharp API 374+ verwenden. Im Dashboard unter **Server → Trainings-HUD** aktivieren und mit **Apply & restart** übernehmen. Für lokale Entwicklung die Workshop-Auslieferung ausschalten und [lokale Assets bauen/installieren](../training-hud/README.md). Für Mitspieler das Workshop-Addon aktualisieren und ausliefern. Nach Layoutänderungen CS2 vollständig neu starten.

Das Panel funktioniert nur, wenn die geladene MatchZy-Instanz `isPractice == true` und `matchStarted == false` meldet. `.prac` oder der automatische Start im Nades-Modus aktiviert Practice; bloßes `sv_cheats 1` reicht nicht. Bei `.exitprac`, Competitive-Start oder MatchZy-Unload werden Panel, Aufnahme und Map-Abstimmung geschlossen. Der Zugriff liest die öffentlichen MatchZy-Zustandsfelder über die Plugin-Verwaltung von CounterStrikeSharp. Ist diese Schnittstelle nicht verfügbar, bleibt das Panel gesperrt. Nach Updates von MatchZy/CSS ist dieser Übergang im Spiel zu prüfen.

Im Practice-Modus einem Team beitreten, spawnen und `css_training` ausführen. Ohne installierte HUD-Dateien kann das Plugin keine sichtbare Oberfläche garantieren. Einmalige Bind-Einrichtung: [Feste Keybinds](../training-hud/README.md#feste-keybinds). Freie Tastenzuweisungen und Navigation über W/S/Use sind entfernt. Bestehende Favoriten werden beim Laden alter Profile erhalten.

## Hauptmenü

1. **Granaten-Bibliothek:** Typ auswählen, dann Favoriten, Offiziell, Must Know oder Alle. „Alle“ enthält sämtliche Spieleraufnahmen auf dieser Map, auch ungeprüfte.
2. **Must Know:** direkter Einstieg in die vom Plattform-Admin ausgewählten Grundlagen dieser Map.
3. **Trainingswerkzeuge:** letzten Wurf wiederholen, zum letzten Abwurfpunkt, Position merken/laden, Granaten entfernen, Bots, Trainingshilfen und Positionsdiagnose.
4. **Neue Nade aufnehmen:** Aufnahme starten, innerhalb von drei Minuten werfen, Wirkung abwarten, mit KP_0 zurück ins HUD und speichern. Ein automatischer Name wird vergeben; der Ersteller bleibt als Steam-ID erhalten.
5. **Favoriten:** persönlich gemerkte Granaten auf dieser Map. Die Identität ist Owner + Map + interner Name; Umbenennen des Anzeigenamens verliert keine Favoriten.
6. **Competitive-Spawns:** CT- oder T-Startposition wählen und dorthin teleportieren.
7. **Map wechseln:** eine Map vorschlagen oder in einer laufenden Abstimmung Ja/Nein wählen.
8. **Keybinds:** die festen acht Tasten und die Bind-Befehle anzeigen.
9. **Panel ausblenden:** mit KP_DEL wieder anzeigen. KP_0 wechselt zwischen Bedienung und freiem Spielen.

**Bots** enthält stehenden Bot, duckenden Bot und Bots entfernen. **Trainingshilfen** enthält Flugbahnvorschau, Einschläge, Flashschutz und God Mode. Die Beschriftung zeigt „einschalten“ oder „ausschalten“ entsprechend dem tatsächlichen Zustand. MatchZys God Mode wird anhand seiner Lebenspunkte-Logik erkannt. Gemeinsame Trainingsaktionen werden sofort ausgeführt; die Beschreibung kennzeichnet ihre Wirkung auf alle Spieler. MatchZy behält seine Berechtigungsprüfung und meldet das Ergebnis im Chat.

## Aufnahme bearbeiten, löschen und prüfen lassen

Alle Aufnahmen sind sofort für alle sichtbar. Nur der Ersteller einer noch nicht offiziellen Aufnahme sieht **Name bearbeiten**, **Beschreibung bearbeiten**, **Zum Review freigeben** und **Eigene Aufnahme löschen**. Beim Bearbeiten den Text im Chat eingeben (Name maximal 120, Beschreibung maximal 300 Zeichen); `abbrechen` beendet die Eingabe. Texteingabe läuft nach zwei Minuten ab. Löschen verlangt eine zusätzliche Bestätigung.

„Zum Review freigeben“ markiert die Aufnahme als **[Review]**. Plattform-Admins finden diese über **All lineups → Review-Status → Review angefragt** und können sie freigeben oder ablehnen. Änderungen mit **Save nades** speichern. **Offiziell** kennzeichnet geprüfte Lineups; **Must Know** ist die besonders wichtige Auswahl und schaltet zugleich Offiziell ein. Nach Freigabe kann der Ersteller die Granate nicht mehr verändern oder löschen. Änderungen an Name/Beschreibung vor einer Freigabe setzen einen alten Review-Antrag zurück; danach erneut einreichen.

Spieleranfragen werden mit authentifizierter Steam-ID und Versionsstand über `savednades.requests` an den Dashboard-Sync übergeben. Der Sync prüft Besitzer, Freigabe und Version erneut. Eine veraltete Anfrage überschreibt keine neuere Admin-Änderung. Ohne laufenden Sync bleiben Anfragen ausstehend. Erfolg oder Ablehnung wird nach Verarbeitung im Spiel gemeldet. Zielerfassung beim erneuten Werfen verändert keine fremden oder offiziellen Lineups.

## Map-Abstimmung

Jeder lebende Spieler in Practice darf eine Abstimmung starten. Zur Auswahl stehen lokal vorhandene Standard-Map-VPKs und im angewendeten Dashboard konfigurierte Workshop-Maps. Mapnamen und Workshop-IDs werden geprüft; freie Befehle sind nicht zulässig.

Die Abstimmung dauert 30 Sekunden. Auch der Initiator muss ausdrücklich mit Ja oder Nein abstimmen. Es gilt `floor(Anzahl / 2) + 1`: bei vier Spielern sind drei Ja-Stimmen nötig. Gezählt werden alle beim Start verbundenen menschlichen Spieler inklusive Zuschauer, ohne Bots oder HLTV. Jeder hat eine Stimme. Spätere Beitritte stimmen nicht mit; Disconnects verkleinern den Nenner nicht, Enthaltungen sind keine Ja-Stimmen.

Abstimmen im Panel unter **Map wechseln**, im Chat mit `.mapja` / `.mapnein` oder in der Konsole mit `css_training_vote yes` / `css_training_vote no`. Bei erreichter Mehrheit wird gewechselt; ohne Mehrheit bleibt die Map. Zwischen Vorschlägen liegen mindestens 60 Sekunden. Practice-Ende, Map-Ende und Plugin-Unload verwerfen die Abstimmung.

## Abnahmestand

Version 1.9.0 wird mit Unit-/Integrationstests, Web-Build und Valves Panorama-Compiler geprüft. Die tatsächliche Darstellung, MatchZy-Zustandsanbindung, Mapwechsel und Mehrspielerabläufe müssen auf einem Entwicklungsserver im Spiel abgenommen werden. Ein lokaler Layout-Build aktualisiert keine Server-Plugin-Funktionen.

## Architektur

`InGameMenu` verwaltet Seiten und History. `ScreenPanel` erstellt eine private `custom_hud_layout`-Entity pro offener Sitzung und setzt Texte, CSS-Klassen und Cursorzustand. `CheckTransmit` hält die Entity von anderen Spielern fern. Es gibt keine World-Text-Entities oder Kameratransformationen mehr. Eine neue Entity pro Sitzung verhindert das Wiederverwenden alter Slot-Texte in API 374. Die pro Spieler gespeicherten Werte liegen getrennt davon in `PlayerPanelSettingsStore`.

`TrainingMenu` und `PanelSettingsMenu` definieren die Inhalte; `PanelControls` prüft die Tasten und routet Maus-/Tastaturaktionen. Texte werden niemals als beliebige Serverbefehle ausgeführt. MatchZy-Befehle laufen weiterhin im Spieler-Kontext. Native Eingaben, Layout-Compiler und Darstellung müssen im Spiel geprüft werden; die Unit-Tests prüfen Daten, Navigation und Persistenz.

## Direkte Zifferntasten 1–9

Die Standard-Zifferntasten sind im CS2-Client Waffenslots. Für direkte Menüauswahl gibt es deshalb die optionale [nades-menu.cfg](nades-menu.cfg):

1. Eigene Zifferntasten-Binds sichern, falls vorhanden.
2. Die Datei auf deinem Gaming-PC nach `Counter-Strike Global Offensive/game/csgo/cfg/nades-menu.cfg` kopieren.
3. In der CS2-Konsole `exec nades-menu` ausführen.

Danach wählen **1–9** die neun sichtbaren Einträge. Zurück und Seitenwechsel nutzen die eigenen Buttons oder die Hotkeys aus training-menu.cfg; **Home** springt ins Hauptmenü. Außerhalb des Menüs bleiben die Standard-Waffenslots nutzbar. Der Server verändert keine Client-Binds automatisch. In der CFG stehen auch optionale Schnellzugriffe und Befehle zum Wiederherstellen der Standardbelegung.

## Training und Daten

Die Auswahl setzt die gespeicherte Standposition und Blickrichtung und stoppt vorhandene Bewegung. Ab Version **1.0.2** korrigiert das Plugin außerdem einen bekannten CS2-Teleportfehler: Der vertikale Blickwinkel kann auf den gesamten Spielerkörper übertragen werden. Das kippt das Modell und beeinträchtigt Lineups (siehe [MatchZy #393](https://github.com/shobhit-pathak/MatchZy/issues/393) und den [entsprechenden Upstream-Fix](https://github.com/sivert-io/MatchZy-Enhanced/pull/13)). Die Korrektur setzt nur Neigung und seitliche Drehung des Körpers auf null. Blickrichtung, horizontale Körperdrehung und gespeicherte Position bleiben erhalten; die Bibliothek wird nicht verändert.

Beim erfolgreichen Laden wird normale Laufbewegung aktiviert und Noclip beendet. Das ist relevant, weil MatchZy `.savenade` mit einem Z-Aufschlag von 4 Units speichert: Ohne Schwerkraft im Noclip bleibt die Figur dort in der Luft. Vor dem Wurf kurz landen lassen. Das bloße Schließen eines Menüs ohne Laden behält weiterhin den vorherigen Bewegungsmodus bei.

Fehlt die passende Granate im Inventar, gibt das Plugin sie dem Spieler und wählt den Granaten-Slot aus. Bei Molly-Lineups verwendet es für CTs eine Incendiary und für Ts einen Molotov. Die gespeicherte Beschreibung erscheint im Chat, etwa als Hinweis auf einen Jumpthrow. `.nades last` setzt dich erneut an den Abwurfpunkt.

Solange MatchZy Practice aktiv ist, prüft das Plugin in jedem Tick die Körperneigung lebender Spieler beider Teams. Dadurch greift die Korrektur auch nach MatchZys `.loadnade`, `.last` und `.loadpos`, ohne dessen DLL zu verändern. Spieler mit einer übergeordneten Scene-Node werden ausgelassen. Bei bereits aufrechten Spielern wird kein Zustand geschrieben. `.nades check` zeigt Position, beide Bewegungsmodi sowie Blick- und Körperwinkel für die Fehlersuche. Das vorhandene MatchZy-Format speichert den Duckzustand nicht; bei Duck-Lineups muss weiterhin selbst geduckt werden.

Der eigentliche Wurf wird von dir ausgeführt. Die vorhandenen MatchZy-Daten enthalten Position, Winkel, Typ und Beschreibung, aber keine vollständige Abfolge von Laufbewegung, Ducken, Sprung oder Wurfstärke. Das Menü spielt deshalb keine automatischen Beispielwürfe ab. Bei **Ohne Typ** musst du die Granate selbst wählen; den Typ kannst du im Dashboard nachtragen. MatchZys Flugbahnvorschau und Practice-Funktionen bleiben nutzbar.

Sichtbar sind alle gültigen Aufnahmen der aktuellen Map, unabhängig vom Owner. Der Owner bleibt für Bearbeitungsrechte und Favoriten erhalten. Eine Aufnahme mit Review-Antrag trägt [Review]; Offiziell und Must Know werden zusätzlich in eigenen Sammlungen angeboten.

Bei jedem Öffnen, unmittelbar vor dem Laden und alle zwei Sekunden bei offenen Sitzungen liest das Plugin die Bibliothek. Änderungen im Dashboard erscheinen nach dem bestehenden Live-Sync automatisch. Das Menü behält seine ausgewählte Granate anhand von Owner, Map und internem Namen, auch nach Umbenennung oder Umsortierung. Verschwindet ein geöffnetes Lineup, geht es zur zugehörigen Kategorie zurück; leere Seiten werden abgefangen. Die Keybind-Hilfeseite wird nicht neu aufgebaut. Bei vorübergehend unlesbaren Dateien bleibt das letzte gültige Menü erhalten. Gelöschte, auf andere Maps verschobene Einträge werden beim Laden abgewiesen. Defekte Einzelzeilen werden übersprungen; bei einer unlesbaren Datei erscheint eine Fehlermeldung. Bearbeitungen laufen über die geprüfte Anfragewarteschlange des Dashboard-Syncs.

## Anzeigenamen und automatische Zielerfassung (1.2.0)

Im Dashboard lässt sich **Display name** frei vergeben, beispielsweise `Fenster-Smoke vom T-Spawn`. Website, Karten-Tooltip, Kategorien, Detailseite und Ladebestätigung im eigenen `.nades`-Plugin verwenden diesen Titel. Die interne `id` und der MatchZy-Schlüssel `name` bleiben unverändert; `.loadnade window_smoke` funktioniert weiter. Ohne Anzeigenamen erscheint der bisherige technische Name. MatchZys eigenes `.listnades` bleibt bei seinen technischen Namen.

1. Im Practice-Modus an die gewünschte Position stellen, die Granate auswählen und `.savenade window_smoke Beschreibung` eingeben. Für eine eigene, noch nicht offizielle Aufnahme **Lineup laden & trainieren** im `.nades`-Menü benutzen. Auch `.nades last` und ein exaktes `.loadnade window_smoke` aktivieren die Erfassung.
2. Auf die Chat-Bestätigung der Zielerfassung achten. Innerhalb von zwei Minuten die Granate selbst werfen. Der nächste Wurf muss denselben Granatentyp haben; ein anderer Typ verwirft die vorgemerkte Erfassung. Bei gleichnamigen Aufnahmen verschiedener Ersteller im Zweifel die eindeutige Auswahl im `.nades`-Menü verwenden.
3. Das Plugin ordnet den echten Wurf einem Projektil zu und speichert beim Smoke-Effekt beziehungsweise der Flash-/HE-Explosion die Weltkoordinaten. Decoys werden beim Aktivieren erfasst. Eine Flash darf dabei in der Luft explodieren: Die Höhe bleibt gespeichert. Molly/Incendiary-Ziele sind vorerst manuell, da Flugende und entstehende Feuerfläche unterschiedliche Ereignisse sind.
4. Nach der Bestätigung wenige Sekunden auf den Dateisync warten und im Dashboard **Refresh lineups** wählen. Vorhandene lokale Änderungen vorher speichern. Zum erneuten Erfassen das Lineup erneut laden und werfen.


### Neues Lineup direkt im Spiel aufnehmen (1.3.0)

1. Practice einschalten, `.nades save` in den Chat eingeben und die Chat-Bestätigung abwarten.
2. In den nächsten drei Minuten den gewünschten Wurf ausführen: Jumpthrow, Duckthrow, Duck-Setup mit anschließendem Aufstehen, Walkthrow oder Anlauf mit normalem Wurf.
3. **Wurf erkannt** bestätigt Typ und Abwurf. Bei der Smoke-Entstehung, Flash-/HE-Explosion, Molotov-Zündung oder Decoy-Aktivierung meldet der Server **Ziel erfasst** und fragt danach im Chat nach einem Titel. Zum Abbrechen `abbrechen` schreiben.
4. Den gewünschten lesbaren Titel eingeben, zum Beispiel `Mirage Fenster Smoke vom T Spawn`. Das Plugin erstellt daraus einen technischen `.loadnade`-Namen, wählt den MatchZy-Owner gemäß der Einstellung für globale Saves und legt den Eintrag in der Dashboard-Bibliothek ab. Der Dateisync stellt ihn auch MatchZy und dem Ingame-Menü bereit.

Während die Aufnahme bereit ist, protokolliert das Plugin maximal die letzten acht Sekunden vor dem Wurf: Abwurfposition, Winkel, Geschwindigkeit, Blickrichtung, Positionen und gedrückte Tasten je Server-Tick. Start und Landepunkt stammen aus den Spielereignissen. Jump-, Duck- und Walk-Merkmale werden aus dieser Eingabespur abgeleitet; Anlaufstrecke und Geschwindigkeit bleiben ebenfalls sichtbar. Im Dashboard zeigen die Lineup-Details die Zusammenfassung und unter **Show recorded throw inputs and movement** die vollständige Spur. Das macht Sequenzen nachvollziehbar, beweist aber bei komplexen Sprung-/Release-Timings nicht automatisch die perfekte Technik. Körperpose oder Sprunghöhe als echte Animation werden nicht aufgezeichnet.

`.nades save` gilt für einen Wurf pro Aufnahme und läuft nach drei Minuten ab. Ein Spieler muss bis zur Detonation verbunden sein. Wenn **Wurf erkannt** fehlt, Practice aktivieren und genau eine Smoke, Flash, HE, Molotov/Incendiary oder Decoy werfen. Der Server nimmt zum Zeitpunkt des Wurfs die tatsächliche Spielerposition und Blickrichtung auf; MatchZys Namensspeicher wird nicht als Eingabe missbraucht. Nach der Chat-Namenseingabe zieht das Dashboard die Datei automatisch ein. In der Website **Refresh lineups** wählen, wenn ein bereits geöffnetes Formular die neue Zeile noch nicht zeigt.

Die Startposition kommt weiterhin aus `.savenade` beziehungsweise dem gespeicherten Lineup; sie ist der Aufstellpunkt vor einem Jump-/Runthrow, nicht die Position der Granate in der Luft. Vorhandene Lineups ohne gemessenes Ziel müssen einmal geworfen werden. Ziele lassen sich aus Position und Blickwinkel allein nicht zuverlässig rekonstruieren. Tod, Disconnect, Runden-/Mapwechsel oder Practice-Ende verwerfen offene Erfassungen. Synthetische Rethrows ohne echtes `grenade_thrown` aktivieren keine Erfassung.

### Automatische Kartenmarker

Die mitgelieferten CSNADES-Bilder sind unterschiedlich zugeschnitten. Deshalb verwendet das Dashboard die gespeicherten manuellen Marker mit zugehörigen Weltkoordinaten als Kartenreferenzen. Für jede Karte werden mindestens zwei genaue Referenzpunkte benötigt, die **in beiden Achsen** auseinanderliegen (mindestens 256 Welt-Units und 10 % der Bildbreite/-höhe). Am besten zwei weit auseinanderliegende **Startpositionen** von gespeicherten Lineups auf der Karte markieren. Alternativ kann eine Route mit bekanntem Start und gemessenem Ziel als Referenz dienen. Anschließend Lineups speichern.

Aus diesen Referenzen werden neue Start- und Zielmarker automatisch abgeleitet. Bereits vorhandene manuelle Marker haben Vorrang. **Use automatic positions** entfernt die manuellen Marker des bearbeiteten Lineups; die Referenz-Lineups sollten ihre Marker behalten. Bei widersprüchlichen Referenzen, fehlenden Koordinaten oder Punkten außerhalb des Bildes wird kein automatischer Marker erfunden. Die vorhandenen gebogenen Verbindungslinien zeigen nur die Richtung, keine aufgezeichnete Flugbahn. Start-/Zielbezeichnungen wie `T Spawn` bleiben optionale Texte.

**Nuke:** Das vorhandene Radar stellt mehrere Stockwerke nebeneinander dar. Hier ist die automatische XY-Projektion deaktiviert; Weltkoordinaten werden trotzdem erfasst, Marker müssen auf der richtigen Ebene gesetzt werden. Andere Kartenbilder müssen nordorientiert sein und einen einheitlichen Maßstab pro Achse haben. Nach Austausch eines Kartenbildes die Referenzen neu setzen.

### Daten und Kompatibilität

`savednades.json` behält MatchZys Owner-/Namensstruktur. `DisplayName` und `LandingPos` werden als optionale Strings exportiert; Kartenmarker und Bilder bleiben im Panel. Zusätzlich schreibt das Dashboard `cfg/MatchZy/savednades.metadata.json`, damit Anzeigenamen auch nach MatchZy-Schreibvorgängen erhalten bleiben. Das Plugin schreibt ausschließlich seine atomare `savednades.captures.json` mit den zuletzt gemessenen Zielen (bis zu 2000 Lineups), niemals MatchZys Bibliothek. Der Panel-Sync liest diese Datei auch dann, wenn `savednades.json` unverändert ist.

Jede Messung enthält Owner, Map, technischen Namen, gespeicherte Startposition und Winkel. Nur ein passendes Lineup wird aktualisiert. Eine bereits importierte Messung überschreibt spätere manuelle Korrekturen nicht; ein neuer Wurf ersetzt ein altes Ziel und dessen manuellen Zielmarker. Aendert MatchZy Startposition oder Blickwinkel, verwirft der Sync die alte Zielmessung. Anzeigenamen, IDs und Bilder bleiben erhalten.

Dashboard- und CS2-Image neu bauen und deployen. Ein Ingame-Test mit mindestens zwei Spielern, mehreren gleichzeitig fliegenden Granaten und einer in der Luft explodierenden Flash bleibt erforderlich; Unit-Tests ersetzen die nativen CS2-Ereignisse nicht. API-Referenzen: [Smoke-Effekt](https://docs.cssharp.dev/api/CounterStrikeSharp.API.Core.EventSmokegrenadeDetonate.html), [Flash-Explosion](https://docs.cssharp.dev/api/CounterStrikeSharp.API.Core.EventFlashbangDetonate.html), [echter Spielerwurf](https://docs.cssharp.dev/api/CounterStrikeSharp.API.Core.EventGrenadeThrown.html).

## Prüfen

```sh
dotnet test nades-plugin/MatchZyNades.Tests/MatchZyNades.Tests.csproj --configuration Release
docker build -f cs2/Dockerfile --target nades-tests .
```

Die automatischen Tests prüfen das MatchZy-Dateiformat, Map-Filter und Besitzerrechte, doppelte Namen verschiedener Owner, Koordinaten, Granatentypen, Pagination, Navigationshistorie, leere Kategorien, Practice-Sperren, Löschbestätigung, feste Keybinds, Practice-Zustand, Review-Versionierung, Mehrheiten und Befehlszuordnung, sichere Textdarstellung und Statusdateien. Die native Körperrotation, Panorama-Darstellung und deren private Übertragung, MatchZy-Berechtigungen und echten Spielereingaben brauchen zusätzlich einen CS2-Client; diese Tests belegen den Ingame-Fix nicht.

Ab Plugin **1.0.2** ein Lineup mit steilem Blickwinkel nach oben oder unten nahe einer Wand über `.nades`, `.nades last` und MatchZys `.loadnade` laden. Auch `.last` und `.loadpos` prüfen. In Ego-Perspektive und mit einem zweiten Spieler kontrollieren, dass der Körper aufrecht bleibt und die Zielrichtung stimmt. `.nades check` muss für die Neigung und seitliche Drehung des Körpers null anzeigen, während der Blickwinkel erhalten bleibt. Ein Lineup nach aktivem Noclip über `.nades` laden und normales Landen/Bewegen prüfen. Nach dem Update das CS2-Image neu bauen und im Dashboard die Plugin-Version kontrollieren.

Für die neue HUD-Abnahme die [Ingame-Prüfliste](../training-hud/README.md#abnahme-im-spiel) verwenden. Zusätzlich Lineups mit privaten Einträgen, MatchZy-Berechtigungen, leere Bibliothek und Practice-Wechsel prüfen.

Die verwendeten API-Einstiegspunkte sind in den offiziellen CounterStrikeSharp-Quellen dokumentiert: [Spieleraktionen und HTML-Ausgabe](https://github.com/roflmuffin/CounterStrikeSharp/blob/main/managed/CounterStrikeSharp.API/Core/Model/CCSPlayerController.cs). Dateiformat und Slot-Auswahl entsprechen [MatchZys PracticeMode](https://github.com/shobhit-pathak/MatchZy/blob/main/PracticeMode.cs).

## Lineups im Dashboard löschen

In der Map-Galerie und unter **All lineups** entfernt **Delete** nach Bestätigung einen Eintrag aus dem Entwurf. Erst **Save lineups** bzw. **Save nades** schreibt die Änderung auf den Server. Das offene Ingame-Menü übernimmt sie automatisch. Bereits verarbeitete Aufnahme-IDs werden in `savednades.capture-receipts.json` neben der Bibliothek gespeichert, damit alte `savednades.captures.json`-Dateien gelöschte Einträge auch nach einem Neustart nicht wieder anlegen. Eine neue Aufnahme mit neuer ID bleibt möglich. Speichern und Sync-Polling laufen im Dashboard nacheinander, damit sie sich nicht gegenseitig überschreiben.


## Competitive-Spawns (1.9.0)

Im Hauptmenü **Competitive-Spawns → CT-Spawns / T-Spawns → Spawn** wählen. Das Plugin liest die `info_player_counterterrorist`- und `info_player_terrorist`-Entities direkt aus der geladenen Map. Es verwendet pro Seite die aktivierten Punkte mit dem kleinsten numerischen Prioritätswert, entsprechend dem Grundprinzip in [MatchZys Spawn-Erfassung](https://github.com/shobhit-pathak/MatchZy/blob/main/PracticeMode.cs). Die beiden Teams werden getrennt ausgewertet, damit auch unterschiedliche Prioritäten auf Custom-Maps funktionieren. Es wird keine feste Anzahl von fünf Spawns vorausgesetzt.

Die Nummerierung folgt den Entity-Indizes der geladenen Map. Der Teleport prüft den Spawn erneut, setzt Position und Blickrichtung, stoppt Bewegung und beendet Noclip. Er ist nur für lebende Spieler im Training verfügbar und ändert nicht das Team. Besetzte oder inzwischen deaktivierte Spawnpunkte werden mit einer Meldung abgewiesen. Die tatsächlichen Teleports müssen im laufenden CS2 auf den verwendeten Maps geprüft werden.

## Map-Katalog und Abstimmung ab 1.9.0

Dashboard und Server-Plugin gemeinsam aktualisieren. `css_plugins list` muss **MatchZy Nades 1.9.0** anzeigen; die früheren Korrekturen hatten noch dieselbe Versionsnummer 1.8.0.

Das Dashboard schreibt den gemeinsamen Katalog als `map-catalog.json` neben die angewendeten Einstellungen. Das Plugin ermittelt installierte VPK-Maps und aktivierte Workshop-IDs und veröffentlicht `savednades.maps.json` neben der Granatenbibliothek. Nach **Refresh** verwendet der Web-Atlas genau diese Kategorien und Verfügbarkeiten. Ohne Serverbestand kennzeichnet die Website die Ladbarkeit als unbestätigt.

- **Active Duty:** Mirage, Dust II, Nuke, Inferno, Ancient, Anubis, Cache (Valve Season Five).
- **Reserve & Community:** die bisherigen Reserve-/Community-Referenzen, sofern auf dem Server vorhanden oder als aktivierte Workshop-Version hinterlegt.
- **Others:** weitere installierte Maps und sonstige konfigurierte Workshop-Maps.
- **Nicht verfügbar:** Katalogeinträge ohne installierte oder aktivierte Workshop-Version; vorhandene Lineups bleiben erhalten.

Vanity-, Workshop-Vorschau-, Grafiktest- und Lobby-Kulissen erscheinen nicht als ladbare Maps. Das Ingame-Menü startet eine 30-sekündige Ja/Nein-Abstimmung. Der Vorschlagende hat keine automatische Stimme; auch allein muss er ausdrücklich zustimmen. Für lebende Spieler wird die Abstimmungsseite im HUD eingeblendet, ohne freies Zielen zu sperren. Mit KP_0 kann man sie bedienen; Zuschauer stimmen über `.mapja`/`.mapnein` ab. Ein administrativer RCON-Mapwechsel auf der Website bleibt ein direkter Admin-Befehl.

Review-Anfragen verwenden stabile IDs für identische Änderungen. Das Dashboard hält Verarbeitungsbelege unter `savednades.requests/processed` vor, damit eine übrig gebliebene Anfrage nicht nochmals ausgeführt wird. Benachrichtigungen hängen nicht davon ab, ob der Spielprozess eine vom Dashboard erzeugte Ergebnisdatei löschen darf.

Zusätzliche Radaransichten für Baggage, Shoots, Shoots (Nacht), Ancient (Nacht), Shelter, Boulder, Debris, El Dorado, Fachwerk, Poseidon und Training stammen aus den extrahierten Valve-/Map-Autoren-Assets unter https://github.com/MurkyYT/cs2-map-icons/tree/main/images/radars (abgerufen am 30.09.2026). Sie liegen unverändert als PNG unter `admin-panel/client/public/maps`; jeweils die Hauptansicht, keine automatische Ebenenauswahl. Für Pool Day wurde dort keine Radaransicht gefunden; hier bleibt die neutrale Darstellung. Vorhandene CSNADES-Radare bleiben unverändert.
