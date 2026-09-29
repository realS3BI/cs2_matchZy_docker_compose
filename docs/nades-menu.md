# Trainingszentrale im Spiel

Ab **1.5.0** verwendet MatchZyNades ein festes **Panorama-HUD** mit einer zusammenhängenden Fläche am rechten Bildschirmrand. Die alte World-Text-Anzeige und ihre Kameranachführung sind entfernt. Sichtbarkeit und Bedienung bleiben getrennt. Im Bedienmodus gibt es einen Mauszeiger und anklickbare Einträge; alternativ funktionieren persönliche Hotkeys.

**Layout 1.7.0 noch nicht im Spiel abgenommen:** Die HUD-Quellen und das Build-Skript liegen unter [training-hud](../training-hud/README.md). Die Assets sind mit Valves Workshop-Compiler gebaut; ein Test im CS2-Client steht noch aus. Die Anzeige bleibt bis zur Installation abgeschaltet; es gibt keinen automatischen Rückfall auf das nachziehende Panel.

## Aktivieren

1. [HUD bauen und an Clients ausliefern](../training-hud/README.md). Für mehrere Spieler wird ein eigenes Workshop-Addon benötigt.
2. Passendes Metamod, CounterStrikeSharp **API 374+** und MultiAddonManager verwenden. Das Plugin baut gegen **1.0.374**.
3. CS2- und Dashboard-Image neu bauen. Im Dashboard **Nades** oder **MatchZy** aktivieren; die Statuskarte muss Version **1.7.0** als **Loaded** melden.
4. Im Webpanel unter **Server → Trainings-HUD** das HUD aktivieren. Für veröffentlichte Assets **HUD über Workshop ausliefern** einschalten und die Workshop-ID eintragen; für lokal installierte Testdateien die Auslieferung ausschalten. Mit **Apply & restart** übernehmen. Das gilt für alle Spieler; ohne lokale Dateien und ohne Workshop-Auslieferung erscheint kein HUD. Die bisherigen Deploymentvariablen dienen nur noch als Fallback für ältere Runtime-Konfigurationen.
5. Einem Team beitreten, spawnen und `css_training` in der Konsole ausführen oder einen eigenen Hotkey binden.

Das HUD muss vor dem ersten Öffnen auf dem Client vorhanden sein. Die Plugin-Statuskarte bestätigt nur das Laden des Plugins, nicht die Verfügbarkeit der Client-Dateien. Bis dahin funktionieren die Konfigurationsbefehle bereits, aber das Panel sperrt keine Eingaben.

## Aufbau ab 1.7.0

Oben steht mittig **Trainingszentrale**. Eine kleine Breadcrumb zeigt den aktuellen Menüpfad. Es gibt ausschließlich die kompakte Panelgröße. Darunter bleiben immer neun schmale Zeilen reserviert, auch auf leeren oder teilweise gefüllten Seiten. Die Navigation lautet **Zurück · <- Seite · 1/2 · Seite -> · Home**. Es folgen drei Beschreibungszeilen und nur die Hinweise **F6 Hud/Crosshair** und **F7 Hud anzeigen/verstecken** (bei eigener Belegung mit den eigenen Tasten). Der Indikator zeigt grün **Frei** oder rot **HUD**. Es gibt keinen Beschreibungs-Weiter-Button und keine Footer-Buttons. Der bestehende Bild-ab-Hotkey bleibt für lange Beschreibungen nutzbar.

Plugin und Workshop-Assets müssen gemeinsam aktualisiert werden. Nach einem Asset-Update CS2 vollständig neu starten, weil Panorama Layouts zwischenspeichert. Die Version 1.7.0 ist kompiliert; die Darstellung und Eingaben im laufenden Spiel müssen noch geprüft werden.

## Persönliche Bedienung und Hotkeys

Unter **Deine Einstellungen** oder über den Einstellungen-Hotkey lassen sich für jede Panelaktion Tasten auswählen. Belegung, Favoriten und optionale Spielaktions-Navigation werden pro **Steam-ID** gespeichert: `addons/counterstrikesharp/plugins/MatchZyNades/data/players/<Steam64>.json`. Die Dateien bleiben im CS2-Volume bei Reconnect, Mapwechsel und Neustart erhalten. Eine bereits verwendete Taste wird nicht einer zweiten Aktion zugeordnet.

**Ein Client-Bind ist einmal pro neuer Taste erforderlich.** Der Server darf ihn nicht automatisch setzen. Nach der Auswahl zeigt das Panel den genauen Befehl. `css_training_binds` schreibt alle persönlichen Binds in die Client-Konsole; diese lassen sich in die eigene CFG übernehmen. Bestehende Belegungen vorher sichern. Ein normaler CS2-Bind ersetzt die alte Belegung und gilt clientweit, auch auf anderen Servern; die pro Spieler gespeicherten Panel-Einstellungen alleine ändern keine Client-Binds. Das Custom-HUD unterstützt keine freien Tastatur-Listener oder eigene Skripte. Die Tasteneinrichtung bleibt vorerst unverändert. Ein Beispiel ohne F-Tasten:

```cfg
css_training_bind focus K
css_training_bind visible L
bind "K" "css_training_key K"
bind "L" "css_training_key L"
```

Die Standardbelegung steht in [training-menu.cfg](training-menu.cfg). Die Navigation über Spielaktionen W/S, Use, Inspect und Reload ist standardmäßig aus und kann optional aktiviert werden. Individuelle Console-Binds und Mausklicks sind davon unabhängig.

| Aktion | Standardtaste nach Installation der CFG |
| --- | --- |
| Bedienung / Spielen | F6 |
| Anzeigen / Verstecken | F7 |
| Einstellungen | F8 |
| Auswahl nach oben / unten | Pfeil hoch / runter |
| Bestätigen | Enter oder Mausklick |
| Zurück | Backspace oder Button |
| Vorherige / nächste Seite | Pfeil links / rechts |
| Weitere Beschreibung (bestehender Hotkey) | Bild ab |

Nur im Bedienmodus werden Bewegung und neue Angriffe gesperrt und der Mauszeiger aktiviert. Beim Spielen bleibt das Panel sichtbar, reagiert aber nicht auf Navigation. Ausblenden beendet immer auch die Bedienung. Nach 90 Sekunden ohne Eingabe wird die Bedienung beendet. Tod, Respawn, Runden-/Mapwechsel und Plugin-Unload entfernen die Anzeige und geben Eingaben frei. Ein Practice-Wechsel baut die Inhalte neu auf. Persönliche Einstellungen bleiben erhalten, die offene Auswahl bleibt beim bloßen Aus-/Einblenden erhalten.

## Trainingsaktionen ohne Chat-Eingabe

**Granaten-Bibliothek** zeigt öffentliche und eigene private Lineups der aktuellen Map, nach Typ sortiert, mit neun Einträgen pro Seite. Details enthalten Beschreibung und **Lineup laden & trainieren**. Zurück stellt die vorige Auswahl wieder her. Lange Beschreibungen lassen sich weiterblättern.

**Wurf & Position** bietet Wiederholen, letzten Abwurfpunkt, Position merken/laden, Noclip, Granaten entfernen, Team-Spawns und Granaten ausrüsten. **Trainingswerkzeuge** bietet Bots, Vorschau, Einschläge, Flashschutz, Unverwundbarkeit und Positionsdiagnose. Gemeinsame Aktionen verlangen eine Bestätigung. Die Ausführung gibt die Steuerung frei; das Panel bleibt sichtbar. Eigene Rückmeldungen erscheinen darin. MatchZys eigene Erfolgs-/Berechtigungsnachrichten bleiben vorerst im Chat; das Panel behauptet keinen ungeprüften Erfolg.

**Neue Nade aufnehmen:** Aufnahme starten, werfen, Explosion abwarten, Bedienung aktivieren und **Aufnahme speichern** wählen. Der Name wird aus Typ, Map, UTC-Zeit und Kennung erzeugt. **Aufnahme verwerfen** bricht ab. Nach dem Dashboard-Sync erscheint das neue Lineup automatisch. Freie Namen lassen sich im Dashboard oder optional per Chat vergeben. Karten, Fotos und freie Textfelder sind hier noch nicht eingebaut.

Training kann aus dem Panel gestartet werden, mit MatchZys bestehenden Spielerberechtigungen. Trainingsaktionen verlangen `sv_cheats`. Die Bibliothek muss für die Werkzeuge nicht gefüllt sein. Die bestehenden `.nades`-/`css_nades`-Befehle bleiben als alternativer Zugang erhalten.

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

Solange `sv_cheats` aktiv ist, prüft das Plugin in jedem Tick die Körperneigung lebender Spieler beider Teams. Dadurch greift die Korrektur auch nach MatchZys `.loadnade`, `.last` und `.loadpos`, ohne dessen DLL zu verändern. Spieler mit einer übergeordneten Scene-Node werden ausgelassen. Bei bereits aufrechten Spielern wird kein Zustand geschrieben. `.nades check` zeigt Position, beide Bewegungsmodi sowie Blick- und Körperwinkel für die Fehlersuche. Das vorhandene MatchZy-Format speichert den Duckzustand nicht; bei Duck-Lineups muss weiterhin selbst geduckt werden.

Der eigentliche Wurf wird von dir ausgeführt. Die vorhandenen MatchZy-Daten enthalten Position, Winkel, Typ und Beschreibung, aber keine vollständige Abfolge von Laufbewegung, Ducken, Sprung oder Wurfstärke. Das Menü spielt deshalb keine automatischen Beispielwürfe ab. Bei **Ohne Typ** musst du die Granate selbst wählen; den Typ kannst du im Dashboard nachtragen. MatchZys Flugbahnvorschau und Practice-Funktionen bleiben nutzbar.

Sichtbar sind globale Einträge mit Owner `default` und deine eigenen privaten Einträge mit deiner Steam64-ID. Private Lineups anderer Spieler werden nicht angezeigt. Gleichnamige globale und private Einträge sind einzeln auswählbar; private Einträge tragen `[privat]`. Für gemeinsame Lineups im Dashboard `Save new in-game lineups for everyone` aktivieren.

Bei jedem Öffnen, unmittelbar vor dem Laden und alle zwei Sekunden bei offenen Sitzungen liest das Plugin die Bibliothek. Änderungen im Dashboard erscheinen nach dem bestehenden Live-Sync automatisch. Das Menü behält seine ausgewählte Granate anhand von Owner, Map und internem Namen, auch nach Umbenennung oder Umsortierung. Verschwindet ein geöffnetes Lineup, geht es zur zugehörigen Kategorie zurück; leere Seiten werden abgefangen. Einstellungen werden während der Bearbeitung nicht neu aufgebaut. Bei vorübergehend unlesbaren Dateien bleibt das letzte gültige Menü erhalten. Gelöschte, auf andere Maps verschobene oder nicht mehr freigegebene Einträge werden beim Laden abgewiesen. Defekte Einzelzeilen werden übersprungen; bei einer unlesbaren Datei erscheint eine Fehlermeldung. Das Plugin schreibt die Bibliothek nicht um.

## Anzeigenamen und automatische Zielerfassung (1.2.0)

Im Dashboard lässt sich **Display name** frei vergeben, beispielsweise `Fenster-Smoke vom T-Spawn`. Website, Karten-Tooltip, Kategorien, Detailseite und Ladebestätigung im eigenen `.nades`-Plugin verwenden diesen Titel. Die interne `id` und der MatchZy-Schlüssel `name` bleiben unverändert; `.loadnade window_smoke` funktioniert weiter. Ohne Anzeigenamen erscheint der bisherige technische Name. MatchZys eigenes `.listnades` bleibt bei seinen technischen Namen.

1. Im Practice-Modus an die gewünschte Position stellen, die Granate auswählen und `.savenade window_smoke Beschreibung` eingeben. Für ein vorhandenes Lineup **Lineup laden & trainieren** im `.nades`-Menü benutzen. Auch `.nades last` und ein exaktes `.loadnade window_smoke` aktivieren die Erfassung.
2. Auf die Chat-Bestätigung der Zielerfassung achten. Innerhalb von zwei Minuten die Granate selbst werfen. Der nächste Wurf muss denselben Granatentyp haben; ein anderer Typ verwirft die vorgemerkte Erfassung. Bei gleichnamigen privaten/globalen Lineups im Zweifel die eindeutige Auswahl im `.nades`-Menü verwenden.
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

Die automatischen Tests prüfen das MatchZy-Dateiformat, Map- und Owner-Filter, doppelte Namen verschiedener Owner, Koordinaten, Granatentypen, Pagination, Navigationshistorie, leere Kategorien, Practice-Sperren, Bestätigungsseiten, Befehlszuordnung, gehaltene Tasten, Use/Inspect-Priorität, sichere Textdarstellung und Statusdateien. Die native Körperrotation, Panorama-Darstellung und deren private Übertragung, MatchZy-Berechtigungen und echten Spielereingaben brauchen zusätzlich einen CS2-Client; diese Tests belegen den Ingame-Fix nicht.

Ab Plugin **1.0.2** ein Lineup mit steilem Blickwinkel nach oben oder unten nahe einer Wand über `.nades`, `.nades last` und MatchZys `.loadnade` laden. Auch `.last` und `.loadpos` prüfen. In Ego-Perspektive und mit einem zweiten Spieler kontrollieren, dass der Körper aufrecht bleibt und die Zielrichtung stimmt. `.nades check` muss für die Neigung und seitliche Drehung des Körpers null anzeigen, während der Blickwinkel erhalten bleibt. Ein Lineup nach aktivem Noclip über `.nades` laden und normales Landen/Bewegen prüfen. Nach dem Update das CS2-Image neu bauen und im Dashboard die Plugin-Version kontrollieren.

Für die neue HUD-Abnahme die [Ingame-Prüfliste](../training-hud/README.md#abnahme-im-spiel) verwenden. Zusätzlich Lineups mit privaten Einträgen, MatchZy-Berechtigungen, leere Bibliothek und Practice-Wechsel prüfen.

Die verwendeten API-Einstiegspunkte sind in den offiziellen CounterStrikeSharp-Quellen dokumentiert: [Spieleraktionen und HTML-Ausgabe](https://github.com/roflmuffin/CounterStrikeSharp/blob/main/managed/CounterStrikeSharp.API/Core/Model/CCSPlayerController.cs). Dateiformat und Slot-Auswahl entsprechen [MatchZys PracticeMode](https://github.com/shobhit-pathak/MatchZy/blob/main/PracticeMode.cs).

## Lineups im Dashboard löschen

In der Map-Galerie und unter **All lineups** entfernt **Delete** nach Bestätigung einen Eintrag aus dem Entwurf. Erst **Save lineups** bzw. **Save nades** schreibt die Aenderung auf den Server. Das offene Ingame-Menü übernimmt sie automatisch. Bereits verarbeitete Aufnahme-IDs werden in `savednades.capture-receipts.json` neben der Bibliothek gespeichert, damit alte `savednades.captures.json`-Dateien gelöschte Einträge auch nach einem Neustart nicht wieder anlegen. Eine neue Aufnahme mit neuer ID bleibt möglich. Speichern und Sync-Polling laufen im Dashboard nacheinander, damit sie sich nicht gegenseitig überschreiben.

## Favoriten und Must Know (1.7.0)

Jeder Granatentyp öffnet zunächst **Favoriten**, **Privat**, **Must Know** und **Alle**, jeweils mit der Anzahl passender Lineups. **Privat** enthält ausschließlich die eigenen privaten Lineups. **Alle** enthält öffentliche und eigene private Lineups der aktuellen Map.

In den Lineup-Details schaltet **Zu Favoriten hinzufügen** bzw. **Aus Favoriten entfernen** die persönliche Markierung um. Favoriten tragen einen Stern und sind zusätzlich über **Favoriten** im Hauptmenü erreichbar. Sie werden pro Steam-ID in der vorhandenen Einstellungsdatei gespeichert und bleiben nach Reconnect, Mapwechsel und Neustart erhalten. Als Identität dienen Owner, Map und interner Name, sodass eine Änderung des Anzeigenamens keine Favoriten verliert. Gelöschte oder nicht mehr sichtbare Lineups werden nicht angezeigt; ihre gespeicherte Referenz gibt keinen Zugriff auf fremde private Daten.

**Must Know** wird im Dashboard im Lineup-Dialog oder unter **All lineups** markiert und mit **Save lineups** bzw. **Save nades** gespeichert. Die Markierung gilt für alle Spieler, die das Lineup sehen dürfen. Sie wird als Boolean exportiert und zusätzlich in `savednades.metadata.json` veröffentlicht; MatchZy-Schreibvorgänge ohne dieses Feld entfernen sie nicht. Das Abschalten der Markierung wird ebenfalls synchronisiert.

## Competitive-Spawns (1.7.0)

Im Hauptmenü **Competitive-Spawns → CT-Spawns / T-Spawns → Spawn** wählen. Das Plugin liest die `info_player_counterterrorist`- und `info_player_terrorist`-Entities direkt aus der geladenen Map. Es verwendet pro Seite die aktivierten Punkte mit dem kleinsten numerischen Prioritätswert, entsprechend dem Grundprinzip in [MatchZys Spawn-Erfassung](https://github.com/shobhit-pathak/MatchZy/blob/main/PracticeMode.cs). Die beiden Teams werden getrennt ausgewertet, damit auch unterschiedliche Prioritäten auf Custom-Maps funktionieren. Es wird keine feste Anzahl von fünf Spawns vorausgesetzt.

Die Nummerierung folgt den Entity-Indizes der geladenen Map. Der Teleport prüft den Spawn erneut, setzt Position und Blickrichtung, stoppt Bewegung und beendet Noclip. Er ist nur für lebende Spieler im Training verfügbar und ändert nicht das Team. Besetzte oder inzwischen deaktivierte Spawnpunkte werden mit einer Meldung abgewiesen. Die tatsächlichen Teleports müssen im laufenden CS2 auf den verwendeten Maps geprüft werden.
