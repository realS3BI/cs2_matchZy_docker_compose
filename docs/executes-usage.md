# CS2 Executes starten und bedienen

Stand: offizieller Quellcode `186d3d2`, Plugin-Version 1.1.1.

## Kurzantwort

CS2 Executes hat keinen eigenen Start- oder Ready-Befehl. Sobald der Server das Plugin geladen hat, reagiert es auf den Mapstart. Es sucht nach `map_config/<mapname>.json`. Wenn die Datei erfolgreich geladen wurde, erstellt es bei Bedarf `game/csgo/cfg/cs2-executes/executes.cfg` und führt diese CFG nach einer Sekunde aus. [Plugin-Start und Map-Hook](https://github.com/zwolof/cs2-executes/blob/186d3d23e22d6a6c06bd8534430c0c9dff24be68/ExecutesPlugin.cs#L56-L69), [Map-Initialisierung](https://github.com/zwolof/cs2-executes/blob/186d3d23e22d6a6c06bd8534430c0c9dff24be68/ExecutesPlugin.cs#L121-L135), [CFG-Erstellung und Ausführung](https://github.com/zwolof/cs2-executes/blob/186d3d23e22d6a6c06bd8534430c0c9dff24be68/Helpers.cs#L179-L245)

Das bloße Auswählen oder Hinzufügen eines Modus startet daher nur dann Executes, wenn dieser Modus auch das Plugin lädt und eine Map mit passender Szenario-Datei startet. Im offiziellen Paket liegt derzeit nur `map_config/de_mirage.json`. Für jede andere Map braucht es eine gleichnamige JSON-Datei, etwa `map_config/de_inferno.json`. Fehlt sie oder ist sie ungültig, setzt das Plugin die Map-Konfiguration auf `null` und startet seine CFG nicht. Der Bootstrap wählt deshalb ausdrücklich das Release mit Map-Konfiguration und installiert Executes erneut, wenn die Mirage-Datei fehlt. [Offizielle Map-Dateien](https://github.com/zwolof/cs2-executes/tree/186d3d23e22d6a6c06bd8534430c0c9dff24be68/map_config), [Ladelogik](https://github.com/zwolof/cs2-executes/blob/186d3d23e22d6a6c06bd8534430c0c9dff24be68/Managers/GameManager.cs#L37-L79)

## Normaler Ablauf

1. Das Release-ZIP muss unter `counterstrikesharp/plugins` entpackt und von CounterStrikeSharp geladen sein. Die offizielle README nennt Metamod und CounterStrikeSharp als Voraussetzungen. [Installation](https://github.com/zwolof/cs2-executes/blob/186d3d23e22d6a6c06bd8534430c0c9dff24be68/README.md#L18-L24)
2. Eine Map mit einer passenden `map_config/<mapname>.json` starten. Das offizielle Paket bringt derzeit eine Konfiguration für `de_mirage` mit.
3. Spieler wählen im Teammenü T oder CT. Das Plugin fängt `jointeam` ab, nimmt während des Warmups bis zu zehn Spieler als aktive Spieler auf und verwaltet weitere Spieler über eine Warteschlange. [Team-Hook](https://github.com/zwolof/cs2-executes/blob/186d3d23e22d6a6c06bd8534430c0c9dff24be68/ExecutesPlugin.cs#L397-L438), [Queue-Aufnahme](https://github.com/zwolof/cs2-executes/blob/186d3d23e22d6a6c06bd8534430c0c9dff24be68/Managers/QueueManager.cs#L39-L113)
4. Außerhalb des Warmups wählt das Plugin vor jeder Runde automatisch ein zufälliges gültiges Szenario. Ein Szenario ist nicht gültig, wenn es weniger Spawnpunkte als aktive Spieler hat. [Szenarioauswahl](https://github.com/zwolof/cs2-executes/blob/186d3d23e22d6a6c06bd8534430c0c9dff24be68/Managers/GameManager.cs#L82-L135), [Aufruf vor Rundenstart](https://github.com/zwolof/cs2-executes/blob/186d3d23e22d6a6c06bd8534430c0c9dff24be68/ExecutesPlugin.cs#L539-L590)
5. Beim Rundenstart teleportiert das Plugin die Spieler an die Szenario-Spawns, erzeugt die hinterlegten Granaten, verteilt Waffen und C4 und zeigt die Szenariobeschreibung an. [Ausrüstung](https://github.com/zwolof/cs2-executes/blob/186d3d23e22d6a6c06bd8534430c0c9dff24be68/ExecutesPlugin.cs#L593-L634), [Spawns und Granaten](https://github.com/zwolof/cs2-executes/blob/186d3d23e22d6a6c06bd8534430c0c9dff24be68/ExecutesPlugin.cs#L636-L696)

Es gibt im Plugin keinen Spielerbefehl wie `!ready`. Der praktische Trigger ist Teamwahl plus das Ende des Warmups beziehungsweise der nächste normale Rundenstart.

## Befehle

CounterStrikeSharp registriert Befehle mit `css_` zusätzlich als Chatbefehle ohne Präfix. `css_forcescenario` in Konsole oder RCON entspricht daher `!forcescenario` oder `/forcescenario` im Chat. [CounterStrikeSharp-Befehlsdokumentation](https://docs.cssharp.dev/examples/WithCommands.html)

| Zweck | Chat | Konsole oder RCON | Berechtigung |
| --- | --- | --- | --- |
| Bestimmtes Szenario ab der nächsten Runde ständig wiederholen | `!forcescenario <Teil des Namens>` | `css_forcescenario <Teil des Namens>` | `@css/admin` |
| Erzwungenes Szenario beenden | `!forcescenario` | `css_forcescenario` | `@css/admin` |
| Teams in der nächsten Runde mischen | `!scramble` oder `!scrambleteams` | `css_scramble` oder `css_scrambleteams` | `@css/admin` |
| JSON der aktuellen Map neu laden | `!reloadscenarios` | `css_reloadscenarios` | keine Prüfung im Plugin |
| Edit-Debugmodus umschalten | `!debug` | `css_debug` | keine Prüfung im Plugin |
| Aktuelle Position in die Client-Konsole schreiben | `!getpos` | `css_getpos` | keine Prüfung im Plugin, Spieler nötig |
| Spieler zu Spawn-ID bewegen | `!tospawn <ID>` | `css_tospawn <ID>` | keine Prüfung im Plugin, Spieler nötig |
| Granaten-JSON ausgeben | `!addgrenade T A` | nicht zulässig | `@css/root`, nur Client |

Die Befehlsdefinitionen und Berechtigungen stehen direkt im Plugin. `css_addgrenade` schreibt trotz seines Namens nichts in die Map-Datei, sondern gibt ein JSON-Objekt in der Client-Konsole aus. [Debug-, Reload- und Edit-Befehle](https://github.com/zwolof/cs2-executes/blob/186d3d23e22d6a6c06bd8534430c0c9dff24be68/ExecutesPlugin.cs#L137-L255), [Adminbefehle](https://github.com/zwolof/cs2-executes/blob/186d3d23e22d6a6c06bd8534430c0c9dff24be68/ExecutesPlugin.cs#L257-L308)

`css_forcescenario` sucht ohne Beachtung der Großschreibung nach einem Teil des Szenarionamens, beendet sofort die laufende Runde und verwendet das gefundene Szenario fortlaufend. Ein Aufruf ohne Namen beendet das Forcing und beendet ebenfalls die laufende Runde. [Implementierung von `forcescenario`](https://github.com/zwolof/cs2-executes/blob/186d3d23e22d6a6c06bd8534430c0c9dff24be68/ExecutesPlugin.cs#L266-L306)

## Erforderliche Daten und automatische Regeln

Eine Map-JSON enthält `Scenarios`, `Spawns` und `Grenades`. Jedes Szenario verweist über `SpawnIds` und `GrenadeIds` auf Einträge aus derselben Datei. Das Plugin löst diese IDs beim Laden auf. Fehlende referenzierte IDs verursachen eine Exception. [Datenmodelle](https://github.com/zwolof/cs2-executes/tree/186d3d23e22d6a6c06bd8534430c0c9dff24be68/Models), [ID-Auflösung](https://github.com/zwolof/cs2-executes/blob/186d3d23e22d6a6c06bd8534430c0c9dff24be68/Managers/GameManager.cs#L138-L185)

Das Plugin verwaltet maximal zehn aktive Spieler und verwendet standardmäßig einen T-Anteil von 45 Prozent. Spieler mit `@css/vip` erhalten Priorität in der Warteschlange. Diese Werte sind im Quellcode fest verdrahtet, nicht in der Plugin-Konfiguration. [Queue-Einstellungen](https://github.com/zwolof/cs2-executes/blob/186d3d23e22d6a6c06bd8534430c0c9dff24be68/Managers/QueueManager.cs#L7-L36), [VIP-Priorität](https://github.com/zwolof/cs2-executes/blob/186d3d23e22d6a6c06bd8534430c0c9dff24be68/Managers/QueueManager.cs#L137-L193)

Für die Diagnose sollten im Serverlog mindestens diese Meldungen erscheinen:

```text
[Executes] ----------- CS2 Executes loaded -----------
[Executes] Loading ".../map_config/de_mirage.json"
-------------------------- Loaded <Anzahl> executes config.
[Executes] Config loaded!
```

Fehlt die Map-Datei, meldet das Plugin `<mapname>.json does not exist.` und `Failed to load spawns.`. Dann läuft kein Executes-Szenario. [Map-Ladelogik](https://github.com/zwolof/cs2-executes/blob/186d3d23e22d6a6c06bd8534430c0c9dff24be68/Managers/GameManager.cs#L37-L79)
