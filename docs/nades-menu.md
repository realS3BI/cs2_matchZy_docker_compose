# Trainingszentrale im Spiel

Ab **1.5.0** verwendet MatchZyNades ein festes **Panorama-HUD** mit einer zusammenhaengenden Flaeche am rechten Bildschirmrand. Die alte World-Text-Anzeige und ihre Kameranachfuehrung sind entfernt. Sichtbarkeit und Bedienung bleiben getrennt. Im Bedienmodus gibt es einen Mauszeiger und anklickbare Eintraege; alternativ funktionieren persoenliche Hotkeys.

**Noch nicht im Spiel abgenommen:** Die HUD-Quellen und das Build-Skript liegen unter [training-hud](../training-hud/README.md). Valves Workshop-Compiler und ein Test im CS2-Client sind fuer das fertige Asset erforderlich. Die neue Anzeige bleibt bis zur Installation abgeschaltet; es gibt keinen automatischen Rueckfall auf das nachziehende Panel.

## Aktivieren

1. [HUD bauen und an Clients ausliefern](../training-hud/README.md). Fuer mehrere Spieler wird ein eigenes Workshop-Addon benoetigt.
2. Passendes Metamod, CounterStrikeSharp **API 374+** und MultiAddonManager verwenden. Das Plugin baut gegen **1.0.374**.
3. CS2- und Dashboard-Image neu bauen. Im Dashboard **Nades** oder **MatchZy** aktivieren; die Statuskarte muss Version **1.5.0** als **Loaded** melden.
4. `MATCHZY_TRAINING_HUD_ADDON_ID` auf die veroeffentlichte Workshop-ID setzen. Erst nach erfolgreicher Asset-Installation `MATCHZY_TRAINING_HUD_READY=1` setzen und den CS2-Container neu erstellen. Fuer lokale Asset-Tests kann die Addon-ID leer bleiben.
5. Einem Team beitreten, spawnen und `css_training` in der Konsole ausfuehren oder einen eigenen Hotkey binden.

Das HUD muss vor dem ersten Oeffnen auf dem Client vorhanden sein. Die Plugin-Statuskarte bestaetigt nur das Laden des Plugins, nicht die Verfuegbarkeit der Client-Dateien. Bis dahin funktionieren die Konfigurationsbefehle bereits, aber das Panel sperrt keine Eingaben.

## Persoenliche Bedienung und Hotkeys

Unter **Deine Einstellungen** oder ueber den Button **Einstellungen** lassen sich fuer jede Panelaktion Tasten auswaehlen. Belegung, Panelgroesse und optionale Spielaktions-Navigation werden pro **Steam-ID** gespeichert: `addons/counterstrikesharp/plugins/MatchZyNades/data/players/<Steam64>.json`. Die Dateien bleiben im CS2-Volume bei Reconnect, Mapwechsel und Neustart erhalten. Eine bereits verwendete Taste wird nicht einer zweiten Aktion zugeordnet.

**Ein Client-Bind ist einmal pro neuer Taste erforderlich.** Der Server darf ihn nicht automatisch setzen. Nach der Auswahl zeigt das Panel den genauen Befehl. `css_training_binds` schreibt alle persoenlichen Binds in die Client-Konsole; diese lassen sich in die eigene CFG uebernehmen. Bestehende Belegungen vorher sichern. Ein Beispiel ohne F-Tasten:

```cfg
css_training_bind focus K
css_training_bind visible L
bind "K" "css_training_key K"
bind "L" "css_training_key L"
```

Die Standardbelegung steht in [training-menu.cfg](training-menu.cfg). Die Navigation ueber Spielaktionen W/S, Use, Inspect und Reload ist standardmaessig aus und kann optional aktiviert werden. Individuelle Console-Binds und Mausklicks sind davon unabhaengig.

| Aktion | Standardtaste nach Installation der CFG |
| --- | --- |
| Bedienung / Spielen | F6 |
| Anzeigen / Verstecken | F7 |
| Einstellungen | F8 |
| Auswahl nach oben / unten | Pfeil hoch / runter |
| Bestaetigen | Enter oder Mausklick |
| Zurueck | Backspace oder Button |
| Vorherige / naechste Seite | Pfeil links / rechts |
| Weitere Beschreibung | Bild ab oder Button |

Nur im Bedienmodus werden Bewegung und neue Angriffe gesperrt und der Mauszeiger aktiviert. Beim Spielen bleibt das Panel sichtbar, reagiert aber nicht auf Navigation. Ausblenden beendet immer auch die Bedienung. Nach 90 Sekunden ohne Eingabe wird die Bedienung beendet. Tod, Respawn, Runden-/Mapwechsel und Plugin-Unload entfernen die Anzeige und geben Eingaben frei. Ein Practice-Wechsel baut die Inhalte neu auf. Persoenliche Einstellungen bleiben erhalten, die offene Auswahl bleibt beim blossen Aus-/Einblenden erhalten.

## Trainingsaktionen ohne Chat-Eingabe

**Granaten-Bibliothek** zeigt oeffentliche und eigene private Lineups der aktuellen Map, nach Typ sortiert, mit fuenf Eintraegen pro Seite. Details enthalten Beschreibung und **Lineup laden & trainieren**. Zurueck stellt die vorige Auswahl wieder her. Lange Beschreibungen lassen sich weiterblaettern.

**Wurf & Position** bietet Wiederholen, letzten Abwurfpunkt, Position merken/laden, Noclip, Granaten entfernen, Team-Spawns und Granaten ausruesten. **Trainingswerkzeuge** bietet Bots, Vorschau, Einschlaege, Flashschutz, Unverwundbarkeit und Positionsdiagnose. Gemeinsame Aktionen verlangen eine Bestaetigung. Die Ausfuehrung gibt die Steuerung frei; das Panel bleibt sichtbar. Eigene Rueckmeldungen erscheinen darin. MatchZys eigene Erfolgs-/Berechtigungsnachrichten bleiben vorerst im Chat; das Panel behauptet keinen ungeprueften Erfolg.

**Neue Nade aufnehmen:** Aufnahme starten, werfen, Explosion abwarten, Bedienung aktivieren und **Aufnahme speichern** waehlen. Der Name wird aus Typ, Map, UTC-Zeit und Kennung erzeugt. **Aufnahme verwerfen** bricht ab. Nach dem Dashboard-Sync **Bibliothek aktualisieren** waehlen, um das neue Lineup zu laden. Freie Namen lassen sich im Dashboard oder optional per Chat vergeben. Karten, Fotos und freie Textfelder sind hier noch nicht eingebaut.

Training kann aus dem Panel gestartet werden, mit MatchZys bestehenden Spielerberechtigungen. Trainingsaktionen verlangen `sv_cheats`. Die Bibliothek muss fuer die Werkzeuge nicht gefuellt sein. Die bestehenden `.nades`-/`css_nades`-Befehle bleiben als alternativer Zugang erhalten.

## Architektur

`InGameMenu` verwaltet Seiten und History. `ScreenPanel` erstellt eine private `custom_hud_layout`-Entity pro offener Sitzung und setzt Texte, CSS-Klassen und Cursorzustand. `CheckTransmit` haelt die Entity von anderen Spielern fern. Es gibt keine World-Text-Entities oder Kameratransformationen mehr. Eine neue Entity pro Sitzung verhindert das Wiederverwenden alter Slot-Texte in API 374. Die pro Spieler gespeicherten Werte liegen getrennt davon in `PlayerPanelSettingsStore`.

`TrainingMenu` und `PanelSettingsMenu` definieren die Inhalte; `PanelControls` prueft die Tasten und routet Maus-/Tastaturaktionen. Texte werden niemals als beliebige Serverbefehle ausgefuehrt. MatchZy-Befehle laufen weiterhin im Spieler-Kontext. Native Eingaben, Layout-Compiler und Darstellung muessen im Spiel geprueft werden; die Unit-Tests pruefen Daten, Navigation und Persistenz.

## Direkte Zifferntasten 1–9

Die Standard-Zifferntasten sind im CS2-Client Waffenslots. Fuer direkte Menueauswahl gibt es deshalb die optionale [nades-menu.cfg](nades-menu.cfg):

1. Eigene Zifferntasten-Binds sichern, falls vorhanden.
2. Die Datei auf deinem Gaming-PC nach `Counter-Strike Global Offensive/game/csgo/cfg/nades-menu.cfg` kopieren.
3. In der CS2-Konsole `exec nades-menu` ausfuehren.

Danach waehlen **1–5** die sichtbaren Eintraege, **6** geht zurueck, **7/8** blaettern und **9** schliesst. Ausserhalb des Menues bleiben die Standard-Waffenslots nutzbar. Der Server veraendert keine Client-Binds automatisch. In der CFG stehen auch optionale Schnellzugriffe und Befehle zum Wiederherstellen der Standardbelegung.

## Training und Daten

Die Auswahl setzt die gespeicherte Standposition und Blickrichtung und stoppt vorhandene Bewegung. Ab Version **1.0.2** korrigiert das Plugin ausserdem einen bekannten CS2-Teleportfehler: Der vertikale Blickwinkel kann auf den gesamten Spielerkoerper uebertragen werden. Das kippt das Modell und beeintraechtigt Lineups (siehe [MatchZy #393](https://github.com/shobhit-pathak/MatchZy/issues/393) und den [entsprechenden Upstream-Fix](https://github.com/sivert-io/MatchZy-Enhanced/pull/13)). Die Korrektur setzt nur Neigung und seitliche Drehung des Koerpers auf null. Blickrichtung, horizontale Koerperdrehung und gespeicherte Position bleiben erhalten; die Bibliothek wird nicht veraendert.

Beim erfolgreichen Laden wird normale Laufbewegung aktiviert und Noclip beendet. Das ist relevant, weil MatchZy `.savenade` mit einem Z-Aufschlag von 4 Units speichert: Ohne Schwerkraft im Noclip bleibt die Figur dort in der Luft. Vor dem Wurf kurz landen lassen. Das blosse Schliessen eines Menues ohne Laden behaelt weiterhin den vorherigen Bewegungsmodus bei.

Fehlt die passende Granate im Inventar, gibt das Plugin sie dem Spieler und waehlt den Granaten-Slot aus. Bei Molly-Lineups verwendet es fuer CTs eine Incendiary und fuer Ts einen Molotov. Die gespeicherte Beschreibung erscheint im Chat, etwa als Hinweis auf einen Jumpthrow. `.nades last` setzt dich erneut an den Abwurfpunkt.

Solange `sv_cheats` aktiv ist, prueft das Plugin in jedem Tick die Koerperneigung lebender Spieler beider Teams. Dadurch greift die Korrektur auch nach MatchZys `.loadnade`, `.last` und `.loadpos`, ohne dessen DLL zu veraendern. Spieler mit einer uebergeordneten Scene-Node werden ausgelassen. Bei bereits aufrechten Spielern wird kein Zustand geschrieben. `.nades check` zeigt Position, beide Bewegungsmodi sowie Blick- und Koerperwinkel fuer die Fehlersuche. Das vorhandene MatchZy-Format speichert den Duckzustand nicht; bei Duck-Lineups muss weiterhin selbst geduckt werden.

Der eigentliche Wurf wird von dir ausgefuehrt. Die vorhandenen MatchZy-Daten enthalten Position, Winkel, Typ und Beschreibung, aber keine vollstaendige Abfolge von Laufbewegung, Ducken, Sprung oder Wurfstaerke. Das Menue spielt deshalb keine automatischen Beispielwuerfe ab. Bei **Ohne Typ** musst du die Granate selbst waehlen; den Typ kannst du im Dashboard nachtragen. MatchZys Flugbahnvorschau und Practice-Funktionen bleiben nutzbar.

Sichtbar sind globale Eintraege mit Owner `default` und deine eigenen privaten Eintraege mit deiner Steam64-ID. Private Lineups anderer Spieler werden nicht angezeigt. Gleichnamige globale und private Eintraege sind einzeln auswaehlbar; private Eintraege tragen `[privat]`. Fuer gemeinsame Lineups im Dashboard `Save new in-game lineups for everyone` aktivieren.

Bei jedem Oeffnen und unmittelbar vor dem Laden liest das Plugin die Datei neu. Aenderungen im Dashboard erscheinen nach dem bestehenden Live-Sync beim naechsten Oeffnen. Ein bereits geoeffnetes Menue behaelt seine Reihenfolge, damit sich die Auswahl nicht unter dem Cursor verschiebt. Geloeschte, auf andere Maps verschobene oder nicht mehr freigegebene Eintraege werden beim Laden abgewiesen. Defekte Einzelzeilen werden uebersprungen; bei einer unlesbaren Datei erscheint eine Fehlermeldung. Das Plugin schreibt die Bibliothek nicht um.

## Anzeigenamen und automatische Zielerfassung (1.2.0)

Im Dashboard laesst sich **Display name** frei vergeben, beispielsweise `Fenster-Smoke vom T-Spawn`. Website, Karten-Tooltip, Kategorien, Detailseite und Ladebestaetigung im eigenen `.nades`-Plugin verwenden diesen Titel. Die interne `id` und der MatchZy-Schluessel `name` bleiben unveraendert; `.loadnade window_smoke` funktioniert weiter. Ohne Anzeigenamen erscheint der bisherige technische Name. MatchZys eigenes `.listnades` bleibt bei seinen technischen Namen.

1. Im Practice-Modus an die gewuenschte Position stellen, die Granate auswaehlen und `.savenade window_smoke Beschreibung` eingeben. Fuer ein vorhandenes Lineup **Lineup laden & trainieren** im `.nades`-Menue benutzen. Auch `.nades last` und ein exaktes `.loadnade window_smoke` aktivieren die Erfassung.
2. Auf die Chat-Bestaetigung der Zielerfassung achten. Innerhalb von zwei Minuten die Granate selbst werfen. Der naechste Wurf muss denselben Granatentyp haben; ein anderer Typ verwirft die vorgemerkte Erfassung. Bei gleichnamigen privaten/globalen Lineups im Zweifel die eindeutige Auswahl im `.nades`-Menue verwenden.
3. Das Plugin ordnet den echten Wurf einem Projektil zu und speichert beim Smoke-Effekt beziehungsweise der Flash-/HE-Explosion die Weltkoordinaten. Decoys werden beim Aktivieren erfasst. Eine Flash darf dabei in der Luft explodieren: Die Hoehe bleibt gespeichert. Molly/Incendiary-Ziele sind vorerst manuell, da Flugende und entstehende Feuerflaeche unterschiedliche Ereignisse sind.
4. Nach der Bestaetigung wenige Sekunden auf den Dateisync warten und im Dashboard **Refresh lineups** waehlen. Vorhandene lokale Aenderungen vorher speichern. Zum erneuten Erfassen das Lineup erneut laden und werfen.


### Neues Lineup direkt im Spiel aufnehmen (1.3.0)

1. Practice einschalten, `.nades save` in den Chat eingeben und die Chat-Bestaetigung abwarten.
2. In den naechsten drei Minuten den gewuenschten Wurf ausfuehren: Jumpthrow, Duckthrow, Duck-Setup mit anschliessendem Aufstehen, Walkthrow oder Anlauf mit normalem Wurf.
3. **Wurf erkannt** bestaetigt Typ und Abwurf. Bei der Smoke-Entstehung, Flash-/HE-Explosion, Molotov-Zuendung oder Decoy-Aktivierung meldet der Server **Ziel erfasst** und fragt danach im Chat nach einem Titel. Zum Abbrechen `abbrechen` schreiben.
4. Den gewuenschten lesbaren Titel eingeben, zum Beispiel `Mirage Fenster Smoke vom T Spawn`. Das Plugin erstellt daraus einen technischen `.loadnade`-Namen, waehlt den MatchZy-Owner gemaess der Einstellung fuer globale Saves und legt den Eintrag in der Dashboard-Bibliothek ab. Der Dateisync stellt ihn auch MatchZy und dem Ingame-Menue bereit.

Waerend die Aufnahme bereit ist, protokolliert das Plugin maximal die letzten acht Sekunden vor dem Wurf: Abwurfposition, Winkel, Geschwindigkeit, Blickrichtung, Positionen und gedrueckte Tasten je Server-Tick. Start und Landepunkt stammen aus den Spielereignissen. Jump-, Duck- und Walk-Merkmale werden aus dieser Eingabespur abgeleitet; Anlaufstrecke und Geschwindigkeit bleiben ebenfalls sichtbar. Im Dashboard zeigen die Lineup-Details die Zusammenfassung und unter **Show recorded throw inputs and movement** die vollstaendige Spur. Das macht Sequenzen nachvollziehbar, beweist aber bei komplexen Sprung-/Release-Timings nicht automatisch die perfekte Technik. Koerperpose oder Sprunghoehe als echte Animation werden nicht aufgezeichnet.

`.nades save` gilt fuer einen Wurf pro Aufnahme und laeuft nach drei Minuten ab. Ein Spieler muss bis zur Detonation verbunden sein. Wenn **Wurf erkannt** fehlt, Practice aktivieren und genau eine Smoke, Flash, HE, Molotov/Incendiary oder Decoy werfen. Der Server nimmt zum Zeitpunkt des Wurfs die tatsaechliche Spielerposition und Blickrichtung auf; MatchZys Namensspeicher wird nicht als Eingabe missbraucht. Nach der Chat-Namenseingabe zieht das Dashboard die Datei automatisch ein. In der Website **Refresh lineups** waehlen, wenn ein bereits geoeffnetes Formular die neue Zeile noch nicht zeigt.

Die Startposition kommt weiterhin aus `.savenade` beziehungsweise dem gespeicherten Lineup; sie ist der Aufstellpunkt vor einem Jump-/Runthrow, nicht die Position der Granate in der Luft. Vorhandene Lineups ohne gemessenes Ziel muessen einmal geworfen werden. Ziele lassen sich aus Position und Blickwinkel allein nicht zuverlaessig rekonstruieren. Tod, Disconnect, Runden-/Mapwechsel oder Practice-Ende verwerfen offene Erfassungen. Synthetische Rethrows ohne echtes `grenade_thrown` aktivieren keine Erfassung.

### Automatische Kartenmarker

Die mitgelieferten CSNADES-Bilder sind unterschiedlich zugeschnitten. Deshalb verwendet das Dashboard die gespeicherten manuellen Marker mit zugehoerigen Weltkoordinaten als Kartenreferenzen. Fuer jede Karte werden mindestens zwei genaue Referenzpunkte benoetigt, die **in beiden Achsen** auseinanderliegen (mindestens 256 Welt-Units und 10 % der Bildbreite/-hoehe). Am besten zwei weit auseinanderliegende **Startpositionen** von gespeicherten Lineups auf der Karte markieren. Alternativ kann eine Route mit bekanntem Start und gemessenem Ziel als Referenz dienen. Anschliessend Lineups speichern.

Aus diesen Referenzen werden neue Start- und Zielmarker automatisch abgeleitet. Bereits vorhandene manuelle Marker haben Vorrang. **Use automatic positions** entfernt die manuellen Marker des bearbeiteten Lineups; die Referenz-Lineups sollten ihre Marker behalten. Bei widerspruechlichen Referenzen, fehlenden Koordinaten oder Punkten ausserhalb des Bildes wird kein automatischer Marker erfunden. Die vorhandenen gebogenen Verbindungslinien zeigen nur die Richtung, keine aufgezeichnete Flugbahn. Start-/Zielbezeichnungen wie `T Spawn` bleiben optionale Texte.

**Nuke:** Das vorhandene Radar stellt mehrere Stockwerke nebeneinander dar. Hier ist die automatische XY-Projektion deaktiviert; Weltkoordinaten werden trotzdem erfasst, Marker muessen auf der richtigen Ebene gesetzt werden. Andere Kartenbilder muessen nordorientiert sein und einen einheitlichen Massstab pro Achse haben. Nach Austausch eines Kartenbildes die Referenzen neu setzen.

### Daten und Kompatibilitaet

`savednades.json` behaelt MatchZys Owner-/Namensstruktur. `DisplayName` und `LandingPos` werden als optionale Strings exportiert; Kartenmarker und Bilder bleiben im Panel. Zusaetzlich schreibt das Dashboard `cfg/MatchZy/savednades.metadata.json`, damit Anzeigenamen auch nach MatchZy-Schreibvorgaengen erhalten bleiben. Das Plugin schreibt ausschliesslich seine atomare `savednades.captures.json` mit den zuletzt gemessenen Zielen (bis zu 2000 Lineups), niemals MatchZys Bibliothek. Der Panel-Sync liest diese Datei auch dann, wenn `savednades.json` unveraendert ist.

Jede Messung enthaelt Owner, Map, technischen Namen, gespeicherte Startposition und Winkel. Nur ein passendes Lineup wird aktualisiert. Eine bereits importierte Messung ueberschreibt spaetere manuelle Korrekturen nicht; ein neuer Wurf ersetzt ein altes Ziel und dessen manuellen Zielmarker. Aendert MatchZy Startposition oder Blickwinkel, verwirft der Sync die alte Zielmessung. Anzeigenamen, IDs und Bilder bleiben erhalten.

Dashboard- und CS2-Image neu bauen und deployen. Ein Ingame-Test mit mindestens zwei Spielern, mehreren gleichzeitig fliegenden Granaten und einer in der Luft explodierenden Flash bleibt erforderlich; Unit-Tests ersetzen die nativen CS2-Ereignisse nicht. API-Referenzen: [Smoke-Effekt](https://docs.cssharp.dev/api/CounterStrikeSharp.API.Core.EventSmokegrenadeDetonate.html), [Flash-Explosion](https://docs.cssharp.dev/api/CounterStrikeSharp.API.Core.EventFlashbangDetonate.html), [echter Spielerwurf](https://docs.cssharp.dev/api/CounterStrikeSharp.API.Core.EventGrenadeThrown.html).

## Pruefen

```sh
dotnet test nades-plugin/MatchZyNades.Tests/MatchZyNades.Tests.csproj --configuration Release
docker build -f cs2/Dockerfile --target nades-tests .
```

Die automatischen Tests pruefen das MatchZy-Dateiformat, Map- und Owner-Filter, doppelte Namen verschiedener Owner, Koordinaten, Granatentypen, Pagination, Navigationshistorie, leere Kategorien, Practice-Sperren, Bestaetigungsseiten, Befehlszuordnung, gehaltene Tasten, Use/Inspect-Prioritaet, sichere Textdarstellung und Statusdateien. Die native Koerperrotation, Panorama-Darstellung und deren private Uebertragung, MatchZy-Berechtigungen und echten Spielereingaben brauchen zusaetzlich einen CS2-Client; diese Tests belegen den Ingame-Fix nicht.

Ab Plugin **1.0.2** ein Lineup mit steilem Blickwinkel nach oben oder unten nahe einer Wand ueber `.nades`, `.nades last` und MatchZys `.loadnade` laden. Auch `.last` und `.loadpos` pruefen. In Ego-Perspektive und mit einem zweiten Spieler kontrollieren, dass der Koerper aufrecht bleibt und die Zielrichtung stimmt. `.nades check` muss fuer die Neigung und seitliche Drehung des Koerpers null anzeigen, waehrend der Blickwinkel erhalten bleibt. Ein Lineup nach aktivem Noclip ueber `.nades` laden und normales Landen/Bewegen pruefen. Nach dem Update das CS2-Image neu bauen und im Dashboard die Plugin-Version kontrollieren.

Fuer die neue HUD-Abnahme die [Ingame-Pruefliste](../training-hud/README.md#abnahme-im-spiel) verwenden. Zusaetzlich Lineups mit privaten Eintraegen, MatchZy-Berechtigungen, leere Bibliothek und Practice-Wechsel pruefen.

Die verwendeten API-Einstiegspunkte sind in den offiziellen CounterStrikeSharp-Quellen dokumentiert: [Spieleraktionen und HTML-Ausgabe](https://github.com/roflmuffin/CounterStrikeSharp/blob/main/managed/CounterStrikeSharp.API/Core/Model/CCSPlayerController.cs). Dateiformat und Slot-Auswahl entsprechen [MatchZys PracticeMode](https://github.com/shobhit-pathak/MatchZy/blob/main/PracticeMode.cs).
