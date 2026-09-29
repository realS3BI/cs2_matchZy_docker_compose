# Festes Trainings-HUD

Das Layout ist ein einziges Panorama-Panel, rechts und vertikal mittig am Bildschirm. Es wird vom Client gerendert und hat keine Verbindung zu Weltposition oder Kamerabewegung. `ScreenPanel` uebertraegt ausschliesslich Inhalte, Auswahl und Fokus. Navigation ist per Maus sowie persoenlichen Console-Binds moeglich.

## Stand und Voraussetzungen

Quellen und Serveranbindung sind vorhanden. Die Workshop Tools wurden installiert und beide Panorama-Dateien erfolgreich kompiliert und in `matchzy_training_hud` abgelegt. **Das HUD wurde noch nicht im laufenden CS2-Client getestet oder veroeffentlicht.** Bis zur Asset-Auslieferung bleibt es bewusst abgeschaltet; es darf kein unsichtbares Panel die Steuerung sperren.

- CounterStrikeSharp API **374** oder neuer, passendes Metamod und aktuelles CS2.
- Zum Bauen: CS2 Workshop Tools mit `game/bin/win64/resourcecompiler.exe`.
- Zum Verteilen an Mitspieler: eigenes Workshop-Addon und kompatibler MultiAddonManager. Die Spieler laden das fertige Addon und brauchen keine Workshop Tools.

## Bauen und installieren

```powershell
./training-hud/build.ps1 -Cs2 'D:/SteamLibrary/steamapps/common/Counter-Strike Global Offensive'
```

Das Skript kopiert ausschliesslich die zwei Projektquellen in `content/csgo_addons/matchzy_training_hud`, ruft Valves Compiler auf und legt die kompilierten Dateien direkt im zuvor mit den Workshop Tools angelegten Addon `game/csgo_addons/matchzy_training_hud` sowie unter `training-hud/dist` ab. Es veraendert weder Tastaturbelegungen noch Dateien unter `game/csgo` und veroeffentlicht nichts.

Fuer einen lokalen Test das Addon `matchzy_training_hud` in den Workshop Tools starten und CS2 neu starten (Layout-Cache). Fuer Mitspieler das Addon ueber die Workshop Tools veroeffentlichen. Das Veroeffentlichen ist ein separater Schritt und bisher nicht erfolgt.

Im Compose/Coolify-Deployment nach dem Veroeffentlichen setzen:

```env
MATCHZY_TRAINING_HUD_ADDON_ID=<eigene Workshop-ID>
MATCHZY_TRAINING_HUD_READY=1
```

Der Bootstrap installiert den bereits verwendeten MultiAddonManager bei Bedarf und schreibt die HUD-ID nach `mm_client_extra_addons`. Vorhandene Server-/Map-Addons bleiben in `mm_extra_addons`. Erst `MATCHZY_TRAINING_HUD_READY=1` gibt das Panel frei. Bei rein lokalen Tests ist die Addon-ID leer, aber der Testclient muss die Dateien installiert haben. Ohne Assets erscheint sonst trotz erfolgreich erstellter Server-Entity kein HUD. Fuer API/Metamod/AddonManager eine zusammen kompatible Version benutzen; keine ungetestete pauschale Versionserhoehung des gesamten Servers.

## Persoenliche Hotkeys

Im Panel **Einstellungen** oeffnen, Aktion und Taste waehlen. Verwendete Tasten sind gesperrt, damit sich Panelaktionen nicht gegenseitig ueberschreiben. Standardmaessig ist die alte W/S/Use-Steuerung aus; optional in den Einstellungen einschalten.

Jede Auswahl wird atomar unter `addons/counterstrikesharp/plugins/MatchZyNades/data/players/<Steam64>.json` gespeichert. Reconnects, Mapwechsel, Neustarts und Image-Updates behalten die Dateien im CS2-Volume. Groesse und Tastenhinweise werden fuer jeden Spieler separat geladen.

**CS2-Binds bleiben Client-Einstellungen:** Der Server kann weder beliebige physische Tasten abfragen noch `bind` auf dem Client ausfuehren. Nach einer neuen Taste einmal den angezeigten Bind lokal setzen. Mit `css_training_binds` alle persoenlichen Bind-Zeilen in der Client-Konsole anzeigen und in die eigene CFG uebernehmen. Vorhandene Spielbelegungen vorher sichern; alte Binds werden nicht automatisch entfernt.

Auch ohne geladenes HUD funktioniert beispielsweise:

```cfg
css_training_bind focus K
css_training_bind visible L
bind "K" "css_training_key K"
bind "L" "css_training_key L"
```

`css_training_key` sucht die Aktion anhand der gespeicherten Taste. Nach einer Neubelegung reagieren alte, nicht mehr zugewiesene Tasten nicht mehr auf Panelaktionen. Die direkten Befehle `css_training` und `css_training_visible` bleiben als unabhaengiger Zugang verfuegbar. Navigationstasten wirken nur bei sichtbarem, aktiv bedientem Panel. Konfigurations- und Sichtbarkeitstasten funktionieren auch ausserhalb dieses Modus.

## Abnahme im Spiel

1. Compilerlauf ohne Fehler; Layout mit 16:9 und 4:3 pruefen, auch lange Titel und Beschreibungen.
2. Schnell drehen, laufen, springen und zoomen: Rahmen bleibt am Bildschirmrand.
3. Maus: Eintraege, Zurueck, Seitenwechsel, Spielen und Verstecken testen. Nach Verlassen darf kein Cursor/Sperrzustand bleiben.
4. Zwei Spieler mit verschiedenen Tasten und Groessen; jeder sieht nur seine Inhalte. Reconnect mit wiederverwendetem Slot und Serverneustart pruefen.
5. Neue Taste speichern, Bind ausfuehren, alte Taste pruefen; doppelte Taste ablehnen. Navigation im passiven/versteckten Zustand darf keine Aktion ausloesen.
6. Aufnahme, Speichern, Laden, Noclip, Tod, Respawn, Runden-/Mapwechsel und Plugin-Unload testen.

Technische Referenzen: [CounterStrikeSharp HUD-API](https://github.com/roflmuffin/CounterStrikeSharp/blob/main/managed/CounterStrikeSharp.API/Modules/Extensions/CCSCustomHudLayoutExtensions.cs), [CS2UIKit Erkenntnisse zu Panorama](https://github.com/nvmxre/cs2-ui-kit/blob/master/docs/GOTCHAS.md). Dieses Projekt bindet CS2UIKit nicht als Laufzeitabhaengigkeit ein.
