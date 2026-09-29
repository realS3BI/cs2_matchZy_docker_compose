# Festes Trainings-HUD

Das Layout ist ein einziges Panorama-Panel, rechts und vertikal mittig am Bildschirm. Es wird vom Client gerendert und hat keine Verbindung zu Weltposition oder Kamerabewegung. `ScreenPanel` überträgt ausschließlich Inhalte, Auswahl und Fokus. Navigation ist per Maus sowie persönlichen Console-Binds möglich.

## Aufbau ab Plugin 1.7.0

Mittige Überschrift, Breadcrumb und neun feste Listenplätze, Zurück/Seitenwechsel/Seitenzahl/Home, drei Beschreibungszeilen und zwei Hotkey-Hinweise mit grünem Frei-/rotem HUD-Indikator. Die Bibliothek wird alle zwei Sekunden aktualisiert, sobald der Dashboard-Sync die Daten geschrieben hat. Die ausgewählte Granate bleibt bei Änderungen möglichst erhalten. Die Tasteneinrichtung bleibt unverändert.

Die neuen Assets sind kompiliert. Plugin und Workshop-Addon gemeinsam aktualisieren und CS2 danach ganz neu starten. Ein erneuter Ingame-Test dieses Layouts steht noch aus.

## Stand und Voraussetzungen

Quellen und Serveranbindung sind vorhanden. Die Workshop Tools wurden installiert und beide Panorama-Dateien erfolgreich kompiliert und in `matchzy_training_hud` abgelegt. Der Benutzer hat die lokale Anzeige im laufenden CS2-Client bestätigt. **Workshop-Auslieferung und Mehrspieler-Abnahme stehen noch aus.** Upload-Texte und Ablauf: [Workshop-Release](workshop-release.md).

- CounterStrikeSharp API **374** oder neuer, passendes Metamod und aktuelles CS2.
- Zum Bauen: CS2 Workshop Tools mit `game/bin/win64/resourcecompiler.exe`.
- Zum Verteilen an Mitspieler: eigenes Workshop-Addon und kompatibler MultiAddonManager. Die Spieler laden das fertige Addon und brauchen keine Workshop Tools.

## Bauen und installieren

```powershell
./training-hud/build.ps1 -Cs2 'D:/SteamLibrary/steamapps/common/Counter-Strike Global Offensive'
```

Das Skript kopiert ausschließlich die zwei Projektquellen in `content/csgo_addons/matchzy_training_hud`, ruft Valves Compiler auf und legt die kompilierten Dateien direkt im zuvor mit den Workshop Tools angelegten Addon `game/csgo_addons/matchzy_training_hud` sowie unter `training-hud/dist` ab. Es verändert weder Tastaturbelegungen noch Dateien unter `game/csgo` und veröffentlicht nichts.

Für einen lokalen Entwicklungstest die beiden kompilierten Dateien aus `dist/panorama` unter den gleichen relativen Pfaden in `game/csgo/panorama` installieren und CS2 normal über Steam neu starten. Der Workshop-Tools-Client läuft mit `-insecure` und kann keinem VAC-gesicherten Server beitreten. Zum Testen braucht der Server das Plugin und `MATCHZY_TRAINING_HUD_READY=1`. Für Mitspieler das Addon über die Workshop Tools veröffentlichen. Vor dem anschließenden Download-Test die lokalen Testdateien aus `game/csgo/panorama` in eine Sicherung verschieben, damit sie das Workshop-Addon nicht überdecken.

In der Webübersicht unter **Server → Trainings-HUD** einstellen und mit **Apply & restart** übernehmen:

| Verwendung | Trainings-HUD aktivieren | HUD über Workshop ausliefern | HUD-Workshop-ID |
| --- | --- | --- | --- |
| Lokale Entwicklung | An | Aus | Darf gespeichert bleiben |
| Workshop-Auslieferung | An | An | Veröffentlichte ID erforderlich |
| Panel ausschalten | Aus | Beliebig | Darf gespeichert bleiben |

Die Einstellung gilt für den gesamten Server. Ohne Workshop-Auslieferung werden keine HUD-Dateien an Spieler verteilt; jeder Testclient braucht die lokalen Dateien. Die lokale Arbeitskopie wird nicht direkt gelesen: `panel-source.ps1 local` kompiliert und installiert XML/CSS, danach CS2 vollständig neu starten und erneut verbinden. Lokale Overrides können auch eine ausgelieferte Workshop-Version überdecken; für einen Live-Test zusätzlich `panel-source.ps1 live` ausführen.

Die Panel-Einstellungen haben nach dem Übernehmen Vorrang vor den bisherigen Compose/Coolify-Variablen. Bei der ersten Übernahme **Trainings-HUD aktivieren** ausdrücklich setzen; die Voreinstellung ist aus. Für ältere Runtime-Konfigurationen ohne diese Panel-Einstellungen bleiben die bisherigen Variablen als Fallback erhalten:

```env
MATCHZY_TRAINING_HUD_ADDON_ID=<eigene Workshop-ID>
MATCHZY_TRAINING_HUD_READY=1
```

Der Bootstrap installiert den bereits verwendeten MultiAddonManager bei Bedarf und schreibt die HUD-ID nach `mm_client_extra_addons`. Vorhandene Server-/Map-Addons bleiben in `mm_extra_addons`. Erst `MATCHZY_TRAINING_HUD_READY=1` gibt das Panel frei. Bei rein lokalen Tests ist die Addon-ID leer, aber der Testclient muss die Dateien installiert haben. Ohne Assets erscheint sonst trotz erfolgreich erstellter Server-Entity kein HUD. Für API/Metamod/AddonManager eine zusammen kompatible Version benutzen; keine ungetestete pauschale Versionserhöhung des gesamten Servers.

## Zwischen lokaler Entwicklung und Live wechseln

CS2 vollständig beenden und im Projektordner in PowerShell ausführen:

```powershell
$cs2Path = 'D:/SteamLibrary/steamapps/common/Counter-Strike Global Offensive'
./training-hud/panel-source.ps1 local -Cs2 $cs2Path
./training-hud/panel-source.ps1 live -Cs2 $cs2Path
./training-hud/panel-source.ps1 status -Cs2 $cs2Path
```

Die drei Zeilen sind Alternativen: `local` baut die aktuellen XML-/CSS-Quellen und installiert die beiden lokalen Overrides. Mit `-SkipBuild` werden stattdessen die bereits kompilierten Dateien unter `dist` verwendet. `live` entfernt ausschließlich diese beiden Overrides; vorhandene Dateien werden vorher unter `<CS2>/matchzy-hud-backups/<ID>` gesichert. `status` prüft nur die Dateien auf der Festplatte und funktioniert auch bei laufendem Spiel. Die installierte Workshop-Version wird nicht verändert.

Nach einem Wechsel CS2 normal über Steam starten. Das Skript beendet oder startet das Spiel nicht automatisch. Für `live` muss das veröffentlichte Workshop-Addon bereits vom Server bereitgestellt werden; das Entfernen lokaler Dateien allein lädt kein Addon herunter. Die Workshop-Auslieferung dieses Projekts ist noch nicht abgenommen.

Das ist ein **PowerShell-Befehl, kein CS2-Konsolenbefehl**. Das Plugin bestimmt den Layoutpfad; der Client löst diesen über seine geladenen Dateien auf. Ein verlässlicher Wechsel der Quelle innerhalb einer laufenden Sitzung ist hier nicht verfügbar: Panorama hält Layouts im Cache, auch über einen Reconnect hinweg ([technische Referenz](https://github.com/nvmxre/cs2-ui-kit/blob/master/docs/GOTCHAS.md#changes-to-the-layout-do-not-show-up)).

Damit lassen sich Layout und Styles ohne Workshop-Veröffentlichung und ohne Serveränderung entwickeln, solange Panel-IDs und Variablen zur installierten Plugin-Version passen. Menüpunkte, Favoriten, Spawns und andere C#-Funktionen kommen weiterhin vom Server-Plugin. Zum Testen neuer Funktionen ist eine aktualisierte Plugin-Version auf einem Entwicklungsserver nötig.

## Persönliche Hotkeys

Im Panel **Einstellungen** öffnen, Aktion und Taste wählen. Verwendete Tasten sind gesperrt, damit sich Panelaktionen nicht gegenseitig überschreiben. Standardmäßig ist die alte W/S/Use-Steuerung aus; optional in den Einstellungen einschalten.

Jede Auswahl wird atomar unter `addons/counterstrikesharp/plugins/MatchZyNades/data/players/<Steam64>.json` gespeichert. Reconnects, Mapwechsel, Neustarts und Image-Updates behalten die Dateien im CS2-Volume. Favoriten und Tastenhinweise werden für jeden Spieler separat geladen. Die Panelgröße ist für alle kompakt; alte Größen-Einstellungen werden ignoriert.

**CS2-Binds bleiben Client-Einstellungen:** Der Server kann weder beliebige physische Tasten abfragen noch `bind` auf dem Client ausführen. Nach einer neuen Taste einmal den angezeigten Bind lokal setzen. Mit `css_training_binds` alle persönlichen Bind-Zeilen in der Client-Konsole anzeigen und in die eigene CFG übernehmen. Vorhandene Spielbelegungen vorher sichern; alte Binds werden nicht automatisch entfernt.

Auch ohne geladenes HUD funktioniert beispielsweise:

```cfg
css_training_bind focus K
css_training_bind visible L
bind "K" "css_training_key K"
bind "L" "css_training_key L"
```

`css_training_key` sucht die Aktion anhand der gespeicherten Taste. Nach einer Neubelegung reagieren alte, nicht mehr zugewiesene Tasten nicht mehr auf Panelaktionen. Die direkten Befehle `css_training` und `css_training_visible` bleiben als unabhängiger Zugang verfügbar. Navigationstasten wirken nur bei sichtbarem, aktiv bedientem Panel. Konfigurations- und Sichtbarkeitstasten funktionieren auch außerhalb dieses Modus.

## Abnahme im Spiel

1. Compilerlauf ohne Fehler; Layout mit 16:9 und 4:3 prüfen, auch lange Titel und Beschreibungen.
2. Schnell drehen, laufen, springen und zoomen: Rahmen bleibt am Bildschirmrand.
3. Maus: alle neun Einträge, Zurück, Seitenwechsel und Home testen. F6/F7 sowie den grünen/roten Indikator prüfen. Nach Verlassen darf kein Cursor/Sperrzustand bleiben.
4. Zwei Spieler mit verschiedenen Tasten und Favoriten; jeder sieht nur seine Inhalte. Reconnect mit wiederverwendetem Slot und Serverneustart prüfen.
5. Neue Taste speichern, Bind ausführen, alte Taste prüfen; doppelte Taste ablehnen. Navigation im passiven/versteckten Zustand darf keine Aktion auslösen.
6. Aufnahme, Speichern, Laden, Noclip, Tod, Respawn, Runden-/Mapwechsel und Plugin-Unload testen.

Technische Referenzen: [CounterStrikeSharp HUD-API](https://github.com/roflmuffin/CounterStrikeSharp/blob/main/managed/CounterStrikeSharp.API/Modules/Extensions/CCSCustomHudLayoutExtensions.cs), [CS2UIKit Erkenntnisse zu Panorama](https://github.com/nvmxre/cs2-ui-kit/blob/master/docs/GOTCHAS.md). Dieses Projekt bindet CS2UIKit nicht als Laufzeitabhängigkeit ein.
