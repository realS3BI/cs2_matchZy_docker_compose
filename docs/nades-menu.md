# Nades ingame trainieren

Das eigene CounterStrikeSharp-Plugin `MatchZyNades` zeigt die gespeicherten Lineups der aktuellen Map direkt im CS2-Bildschirm. Es verwendet die bestehende MatchZy-Datei `game/csgo/cfg/MatchZy/savednades.json`; Dashboard, `.savenade` und das neue Menue arbeiten damit auf derselben Bibliothek.

## Aktivieren

1. Den aktualisierten Stack neu bauen und deployen: `docker compose up -d --build` (in Coolify: neu bauen/deployen).
2. Im Dashboard unter `Plugins` den Servermodus **Nades** oder **MatchZy** auswaehlen und `Apply & restart` ausfuehren. Bei MatchZy im Spiel zuerst `.prac` starten.
3. In CS2 einem Team beitreten und spawnen. `.nades` in den Chat schreiben.

Das Image baut das Plugin gegen CounterStrikeSharp **1.0.373**, fuehrt dessen Unit-Tests aus und installiert es beim Bootstrap in den Modi **Nades und MatchZy**. So funktioniert auch ein spaeterer Wechsel mit `.prac`. CounterStrikeSharp muss mindestens API 373 bereitstellen. In den Modi Executes, Warmup und Vanilla entfernt der Bootstrap die Plugin-DLL. Zusaetzlich verlangt das Plugin `sv_cheats`, das MatchZy im Practice-Modus aktiviert und beim Verlassen wieder deaktiviert.

Unter **Plugins** und **Nades** zeigt die Karte **MatchZy Nades · In-game menu** den Installations- und Laufzeitstatus. **Loaded** bedeutet, dass das Plugin innerhalb der letzten 30 Sekunden eine Rueckmeldung aus diesem Containerstart geschrieben hat; dazu erscheinen Plugin-Version und Practice-Zustand. Die Anzeige aktualisiert sich alle 30 Sekunden oder per **Refresh status**. **Installed · unconfirmed** bedeutet nur, dass die DLL vorhanden ist. **Not installed** erklaert, ob `Apply & restart` reicht oder das CS2-Image neu gebaut werden muss. Unter **Diagnostics** gibt es ausserdem einen eigenen Pruefschritt fuer das Menue.

Nach diesem Update beide Images (Dashboard und CS2) neu bauen und deployen. Ein Neustart eines alten Images bringt die neue DLL und Anzeige nicht mit. Die Laufzeitrueckmeldung liegt in `addons/counterstrikesharp/plugins/MatchZyNades/data/status.json`, wird alle fuenf Sekunden atomar erneuert und beim Entladen auf `unloaded` gesetzt. Veraltete Rueckmeldungen aus einem vorherigen Containerstart gelten nicht als Ladebestaetigung.

## Bedienung ohne Installation am Client

`.nades` oeffnet die Typauswahl: **Smoke, HE, Flash, Molotov / Incendiary und Decoy**. Falls alte Eintraege ohne bekannten Typ existieren, erscheint zusaetzlich **Ohne Typ**. Jede Kategorie zeigt die Anzahl ihrer Lineups auf dieser Map. Nach Auswahl eines Typs folgt eine alphabetische Liste mit fuenf Eintraegen pro Seite und Seitenzaehler.

| Eingabe | Aktion |
| --- | --- |
| W / S kurz druecken und loslassen | Vorherigen / naechsten Eintrag markieren; blaettert an Seitengrenzen automatisch |
| Linksklick loslassen | Markierten Typ oeffnen oder markiertes Lineup laden |
| Rechtsklick loslassen | Zur Typauswahl; dort Menue schliessen |
| E loslassen | Menue schliessen |
| `.nades 1` bis `.nades 5` | Eintrag auf der sichtbaren Seite auswaehlen |
| `.nades 6` | Zur Typauswahl |
| `.nades 7` / `.nades 8` | Vorherige / naechste Seite |
| `.nades 9` oder `.nades close` | Menue schliessen |
| `.nades last` | Zuletzt ausgewaehltes Lineup erneut laden |

Die Angaben W/S/E beziehen sich auf die Aktionen Vorwaerts/Rueckwaerts/Benutzen: Bei eigenen Tastenbelegungen gelten die entsprechend belegten Tasten. Das Menue hat keinen frei anklickbaren Mauszeiger; Linksklick bestaetigt die markierte Zeile. Bewegung und neue Angriffe werden waehrend des Menues gesperrt. Beim Schliessen, Tod, Respawn, Rundenbeginn, Mapwechsel oder Plugin-Unload wird der gespeicherte Zustand wiederhergestellt. Nach 90 Sekunden ohne Eingabe schliesst sich das Menue automatisch.

Alternativ funktionieren `!nades` im Chat und `css_nades` in der Client-Konsole. Zum Beispiel entspricht `css_nades last` dem Chatbefehl `.nades last`.

## Direkte Zifferntasten 1–9

Die Standard-Zifferntasten sind im CS2-Client Waffenslots. Fuer direkte Menueauswahl gibt es deshalb die optionale [nades-menu.cfg](nades-menu.cfg):

1. Eigene Zifferntasten-Binds sichern, falls vorhanden.
2. Die Datei auf deinem Gaming-PC nach `Counter-Strike Global Offensive/game/csgo/cfg/nades-menu.cfg` kopieren.
3. In der CS2-Konsole `exec nades-menu` ausfuehren.

Danach waehlen **1–5** die sichtbaren Eintraege, **6** die Typauswahl, **7/8** blaettern und **9** schliesst. Ausserhalb des Menues bleiben die Standard-Waffenslots nutzbar. Der Server veraendert keine Client-Binds automatisch. In der CFG stehen auch optionale Schnellzugriffe und Befehle zum Wiederherstellen der Standardbelegung.

## Training und Daten

Die Auswahl setzt Standposition und Blickwinkel und stoppt vorhandene Bewegung. Fehlt die passende Granate im Inventar, gibt das Plugin sie dem Spieler und waehlt den Granaten-Slot aus. Bei Molly-Lineups verwendet es fuer CTs eine Incendiary und fuer Ts einen Molotov. Die gespeicherte Beschreibung erscheint im Chat, etwa als Hinweis auf einen Jumpthrow. `.nades last` setzt dich erneut an den Abwurfpunkt.

Der eigentliche Wurf wird von dir ausgefuehrt. Die vorhandenen MatchZy-Daten enthalten Position, Winkel, Typ und Beschreibung, aber keine vollstaendige Abfolge von Laufbewegung, Ducken, Sprung oder Wurfstaerke. Das Menue spielt deshalb keine automatischen Beispielwuerfe ab. Bei **Ohne Typ** musst du die Granate selbst waehlen; den Typ kannst du im Dashboard nachtragen. MatchZys Flugbahnvorschau und Practice-Funktionen bleiben nutzbar.

Sichtbar sind globale Eintraege mit Owner `default` und deine eigenen privaten Eintraege mit deiner Steam64-ID. Private Lineups anderer Spieler werden nicht angezeigt. Gleichnamige globale und private Eintraege sind einzeln auswaehlbar; private Eintraege tragen `[privat]`. Fuer gemeinsame Lineups im Dashboard `Save new in-game lineups for everyone` aktivieren.

Bei jedem Oeffnen und unmittelbar vor dem Laden liest das Plugin die Datei neu. Aenderungen im Dashboard erscheinen nach dem bestehenden Live-Sync beim naechsten Oeffnen. Ein bereits geoeffnetes Menue behaelt seine Reihenfolge, damit sich die Auswahl nicht unter dem Cursor verschiebt. Geloeschte, auf andere Maps verschobene oder nicht mehr freigegebene Eintraege werden beim Laden abgewiesen. Defekte Einzelzeilen werden uebersprungen; bei einer unlesbaren Datei erscheint eine Fehlermeldung. Das Plugin schreibt die Bibliothek nicht um.

## Pruefen

```sh
dotnet test nades-plugin/MatchZyNades.Tests/MatchZyNades.Tests.csproj --configuration Release
docker build -f cs2/Dockerfile --target nades-tests .
```

Die automatischen Tests pruefen das MatchZy-Dateiformat, Map- und Owner-Filter, doppelte Namen verschiedener Owner, Koordinaten, Granatentypen, Pagination, leere Kategorien und die sichere Textdarstellung. Darstellung und Spielereingaben brauchen zusaetzlich einen echten CS2-Client.

Fuer den Ingame-Test mindestens sechs Smokes auf derselben Map speichern, davon eine privat. `.nades` ueber normalen und Teamchat pruefen, mit W/S bis auf die zweite Seite navigieren und dort ein Lineup laden. Position, Blickwinkel, Granate und `.nades last` pruefen. Anschliessend das Menue mit E und Rechtsklick schliessen und nach Tod/Respawn sowie Mapwechsel erneut oeffnen. Waehrend ein Menue offen ist, im Dashboard ein Lineup aendern oder loeschen und die erneute Auswahl pruefen. Mit einem zweiten Spieler sicherstellen, dass private Eintraege unsichtbar bleiben. Falls Ziffernbinds verwendet werden, auch die Waffenslots nach dem Schliessen pruefen.

Die verwendeten API-Einstiegspunkte sind in den offiziellen CounterStrikeSharp-Quellen dokumentiert: [Spieleraktionen und HTML-Ausgabe](https://github.com/roflmuffin/CounterStrikeSharp/blob/main/managed/CounterStrikeSharp.API/Core/Model/CCSPlayerController.cs). Dateiformat und Slot-Auswahl entsprechen [MatchZys PracticeMode](https://github.com/shobhit-pathak/MatchZy/blob/main/PracticeMode.cs).
