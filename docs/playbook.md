# Playbook und die Servermodi

Playbook ist die Website und das eigene Server-Plugin für die Granaten-Bibliothek, Aufnahmen, Favoriten, Reviews und das kompakte Trainings-HUD. Der Nades-Modus benötigt nur CS2, Metamod und CounterStrikeSharp. Der Bootstrap installiert MatchZy ausschließlich im Modus `matchzy` für Scrims.

## Funktionen

| Funktion | Nades | MatchZy |
| --- | --- | --- |
| Trainingskonfiguration, Respawn, unbegrenzte Granaten | Playbook, automatisch | MatchZy nach `.prac` |
| Lineups laden, aufnehmen, bearbeiten und zum Review einreichen | Playbook | Playbook in Practice |
| Favoriten, Offiziell, Must Know, alle Aufnahmen | Playbook | Playbook in Practice |
| CT-/T-Spawns und Map-Abstimmungen im HUD | Playbook | Playbook in Practice |
| Noclip, Positionsspeicher, letzter Abwurfpunkt | Playbook | MatchZy in Practice |
| Flugbahnvorschau, Einschläge, Flashschutz, God Mode, Granaten entfernen | Playbook | MatchZy in Practice |
| Rethrow, Bot-Platzierung, Wurfhistorie, Colored Smokes | Noch nicht implementiert, ausgeblendet bzw. gesperrt | MatchZy in Practice |
| Ready, Matchstart, Pausen, Knife, Veto, Demos, Statistiken | Nicht verfügbar | MatchZy |

Die eigene Implementierung ersetzt zunächst die grundlegenden Trainingsfunktionen. Insbesondere Rethrow benötigt zusätzlich eine geprüfte Anbindung zur Erzeugung und Initialisierung von CS2-Granatenprojektilen. Der Nades-Modus ruft keine fehlenden MatchZy-Werkzeuge auf. Im Scrim-Modus bleibt MatchZy unverändert als externes Plugin installiert.

## Befehle im Nades-Modus

Chatbefehle funktionieren mit `.`, `!` und `/`. Die entsprechende Konsole verwendet `css_`, beispielsweise `.loadnade smoke` und `css_loadnade smoke`.

| Befehl | Funktion |
| --- | --- |
| `.nades` / `css_training` | Trainingspanel öffnen |
| `.nades save` | Aufnahme eines neuen Wurfs starten, danach über das Panel speichern |
| `.nades last` | Zuletzt ausgewähltes Lineup laden |
| `.loadnade <Name>` / `.ln <Name>` | Gespeichertes Lineup laden; bei mehrdeutigen Namen das Panel verwenden |
| `.listnades [Filter]` / `.lin [Filter]` | Bis zu zwölf interne Namen anzeigen; vollständige Liste im Panel |
| `.last` | Zum eigenen letzten Abwurfpunkt zurückkehren |
| `.savepos` / `.loadpos` | Eigene Position und Blickwinkel merken bzw. laden |
| `.noclip` / `noclip` | Fliegen ein- oder ausschalten |
| `.traj` / `.impacts` | Flugbahnvorschau bzw. Geschosseinschläge für den Server umschalten |
| `.noflash` / `.noblind` | Eigenen Flashschutz umschalten |
| `.god` | Eigenen Schutz vor Schaden umschalten |
| `.clear` | Aktive Granaten und Feuer für alle entfernen |
| `.help` | Verfügbare Trainingsbefehle anzeigen |

Die bestehenden festen `css_training_*`- und `css_tk`-Binds bleiben gültig. Das HUD bleibt kompakt und reserviert neun Listenplätze. Die Rollenprüfung gilt zusätzlich zur Modusprüfung. Server-RCON bleibt wie bisher uneingeschränkt. Im Nades-Modus sind `.ready`, `.start`, `.exitprac`, `.savenade` und die übrigen nicht implementierten MatchZy-Befehle gesperrt. In Warmup und Vanilla sind weder das Trainingspanel noch die MatchZy-Befehle verfügbar.

## Branding und Daten

Website, Seitentitel, Plugin-Anzeigename, HUD und Workshop-Texte heißen Playbook. Der gemeinsame Chat-Präfix ist standardmäßig `[{Green}Playbook{Default}]`; eigene Präfixe gelten für Playbook und MatchZy. Im MatchZy-Modus liest Playbook den tatsächlich verwendeten MatchZy-Präfix. Nur die alten ausgelieferten Standardwerte für Servername und Präfix werden migriert.

`MatchZyNades.dll`, der Compose-Projektname, die HUD-Assetpfade und `cfg/MatchZy/savednades.json` bleiben kompatible technische Namen. Damit bleiben bestehende Volumes, Workshop-Assets, Binds und gespeicherte Daten zugeordnet. Favoriten verwenden weiterhin Steam-ID sowie Owner, Map und internen Lineup-Namen. Es gibt keine Umbenennung von Nutzerinhalten.

## Prüfen und ausrollen

Dashboard und CS2-Image neu bauen, dann den gewünschten Modus übernehmen und den Server neu starten. Für die neue HUD-Überschrift auch die Panorama-Assets kompilieren und lokal bzw. im Workshop aktualisieren. Die Quellen allein aktualisieren keine installierten Client-Assets.

Automatische Tests prüfen Modus- und Rollenregeln, Menüumfang, Bootstrap-Entfernung ohne Datenverlust, Prefix-Farben, Diagnose ohne MatchZy sowie die bestehenden Bibliotheksfunktionen. Native CS2-Aktionen benötigen zusätzlich diese Abnahme mit einem Client:

1. Nades starten. `css_plugins list` zeigt Playbook 2.0.0 und keine MatchZy-Instanz. Ohne `.prac` sind Granaten, Respawn und HUD verfügbar.
2. Als Admin und Match Admin Noclip, Positionsspeicher, Flashschutz, God Mode, Spawns und `.clear` prüfen. Als Player dieselben Befehle ablehnen lassen.
3. Ein Lineup aufnehmen, speichern, laden und favorisieren. Nach Favoritenwechsel bleiben Rethrow und Bots im Nades-Menü ausgeblendet. Eigene und fremde Aufnahmen bleiben korrekt getrennt.
4. Mit zwei Spielern `.last` und `.savepos` prüfen. Positionen und Schutzoptionen dürfen sich nicht gegenseitig überschreiben. Nach Disconnect, Mapwechsel und Rollenentzug dürfen keine alten Spielerzustände weiterwirken.
5. Im Nades-Modus `.ready`, `!start`, `/exitprac` und `css_rethrow` prüfen. Sie dürfen weder Match noch Trainingszustand verändern.
6. Auf MatchZy wechseln und einen Scrim mit Ready, Start und Pause prüfen. `.prac` aktiviert dessen Trainingswerkzeuge; `.exitprac` schließt das Panel. Beide Plugins melden sich mit demselben Präfix.
7. Zurück zu Nades wechseln. MatchZy wird entfernt, die Bibliothek und Favoriten bleiben erhalten.

Quellen für die Abgrenzung: [MatchZy-Funktionen](https://shobhit-pathak.github.io/MatchZy/), [MatchZy-Befehle](https://shobhit-pathak.github.io/MatchZy/commands/), [CounterStrikeSharp-Spieler-API](https://docs.cssharp.dev/api/CounterStrikeSharp.API.Core.CCSPlayerPawn.html).
