# Trainingszentrale im Spiel

Das eigene CounterStrikeSharp-Plugin `MatchZyNades` bietet ab **1.1.0** eine Trainingszentrale direkt im CS2-Bildschirm. `.nades` oeffnet das Hauptmenue mit Granaten-Bibliothek, letztem Lineup, Wurf-/Positionsaktionen und Trainingswerkzeugen. Es verwendet die bestehende MatchZy-Datei `game/csgo/cfg/MatchZy/savednades.json`; Dashboard, `.savenade` und das Menue arbeiten damit auf derselben Bibliothek.

## Aktivieren

1. Den aktualisierten Stack neu bauen und deployen: `docker compose up -d --build` (in Coolify: neu bauen/deployen).
2. Im Dashboard unter `Plugins` den Servermodus **Nades** oder **MatchZy** auswaehlen und `Apply & restart` ausfuehren. Die Statuskarte muss Version **1.1.0** als **Loaded** anzeigen.
3. In CS2 einem Team beitreten und spawnen. `.nades` in den Chat schreiben.

Das Image baut das Plugin gegen CounterStrikeSharp **1.0.373**, fuehrt dessen Unit-Tests aus und installiert es beim Bootstrap in den Modi **Nades und MatchZy**. CounterStrikeSharp muss mindestens API 373 bereitstellen. In den Modi Executes, Warmup und Vanilla entfernt der Bootstrap die Plugin-DLL. Das Hauptmenue ist auch vor dem Practice-Modus erreichbar und bietet dann **Training starten** an. MatchZy prueft dabei die bestehenden Spielerberechtigungen. Trainingsaktionen verlangen `sv_cheats`, das MatchZy im Practice-Modus aktiviert und beim Verlassen deaktiviert.

Unter **Plugins** und **Nades** zeigt die Karte **MatchZy Nades · In-game menu** den Installations- und Laufzeitstatus. **Loaded** bedeutet, dass das Plugin innerhalb der letzten 30 Sekunden eine Rueckmeldung aus diesem Containerstart geschrieben hat; dazu erscheinen Plugin-Version und Practice-Zustand. Die Anzeige aktualisiert sich alle 30 Sekunden oder per **Refresh status**. **Installed · unconfirmed** bedeutet nur, dass die DLL vorhanden ist. **Not installed** erklaert, ob `Apply & restart` reicht oder das CS2-Image neu gebaut werden muss. Unter **Diagnostics** gibt es ausserdem einen eigenen Pruefschritt fuer das Menue.

Nach diesem Update beide Images (Dashboard und CS2) neu bauen und deployen. Ein Neustart eines alten Images bringt die neue DLL und Anzeige nicht mit. Die Laufzeitrueckmeldung liegt in `addons/counterstrikesharp/plugins/MatchZyNades/data/status.json`, wird alle fuenf Sekunden atomar erneuert und beim Entladen auf `unloaded` gesetzt. Veraltete Rueckmeldungen aus einem vorherigen Containerstart gelten nicht als Ladebestaetigung.

## Bedienung ohne Installation am Client

Unter **Granaten-Bibliothek** stehen **Smoke, HE, Flash, Molotov / Incendiary und Decoy** zur Auswahl. Falls alte Eintraege ohne bekannten Typ existieren, erscheint zusaetzlich **Ohne Typ**. Jede Kategorie zeigt ihre Anzahl auf dieser Map. Nach Auswahl eines Typs folgt eine alphabetische Liste mit fuenf Eintraegen pro Seite. Ein Lineup oeffnet eine Detailseite mit Beschreibung und **Lineup laden & trainieren**. Zurueck stellt die vorherige Seite und Markierung wieder her.

| Eingabe | Aktion |
| --- | --- |
| W / S kurz druecken und loslassen | Vorherigen / naechsten Eintrag markieren; blaettert an Seitengrenzen automatisch |
| E / Use loslassen | Markierten Eintrag bestaetigen |
| G / Inspect loslassen | Eine Ebene zurueck; im Hauptmenue schliessen |
| A / D loslassen | Vorherige / naechste Seite |
| `.nades 1` bis `.nades 5` | Eintrag auf der sichtbaren Seite auswaehlen |
| `.nades 6` | Eine Ebene zurueck; im Hauptmenue schliessen |
| `.nades 7` / `.nades 8` | Vorherige / naechste Seite |
| `.nades 9` oder `.nades close` | Menue schliessen |
| `.nades last` | Zuletzt ausgewaehltes Lineup erneut laden |
| `.nades check` | Aktuelle Position, Bewegungsmodus, Blickwinkel und Koerperwinkel im Chat und Serverlog anzeigen |

Die Buchstaben entsprechen der gewuenschten Belegung; technisch liest das Plugin die Spielaktionen Vorwaerts/Rueckwaerts, Seitwaerts, Use und Inspect. **G funktioniert als Zurueck, wenn G auf Inspect gebunden ist** (CS2 hat dafuer standardmaessig eine andere Taste). Bei eigenen Binds gelten die entsprechend belegten Tasten. Mausangriffe waehlen nichts aus. Bereits beim Oeffnen gehaltene Tasten muessen erst losgelassen und erneut gedrueckt werden. Das Menue hat keinen frei anklickbaren Mauszeiger und verwendet CS2-Center-HTML mit begrenzten Gestaltungselementen. Bewegung und neue Angriffe werden waehrend des Menues gesperrt; dies ist kein vollstaendiger Filter fuer andere Spielaktionen wie Tueren benutzen. Beim Schliessen, Tod, Respawn, Rundenbeginn, Practice-Wechsel, Mapwechsel oder Plugin-Unload wird der gespeicherte Zustand wiederhergestellt. Nach 90 Sekunden ohne Menueeingabe schliesst es automatisch.

Alternativ funktionieren `!nades` im Chat und `css_nades` in der Client-Konsole. Zum Beispiel entspricht `css_nades last` dem Chatbefehl `.nades last`.

## Ohne Chat bedienen

Einmal auf dem Gaming-PC in der CS2-Konsole `bind "F6" "css_training"` setzen, oder die optionale [training-menu.cfg](training-menu.cfg) installieren und `exec training-menu` ausfuehren. Vorher einen eigenen F6-Bind sichern. Danach oeffnet und schliesst **F6** die Trainingszentrale. E und Inspect brauchen keine zusaetzlichen Binds. Der Server kann Client-Tasten nicht automatisch umbelegen.

**Wurf & Position** bietet letzten Wurf wiederholen, zum letzten Abwurfpunkt, Position merken/laden, Noclip, aktive Granaten entfernen sowie naechsten/entferntesten Team-Spawn. **Trainingswerkzeuge** bietet stehende/duckende Bots, Bots entfernen, Flugbahnvorschau, Einschlaege, Flashschutz, Unverwundbarkeit und Positionsdiagnose. Aktionen, die den Server gemeinsam betreffen, haben eine Bestaetigungsseite mit Abbrechen als Standardauswahl. Beim Ausfuehren schliesst das Menue und gibt die Bewegung frei; F6 oeffnet es wieder. Rueckmeldungen von MatchZy erscheinen weiterhin im Chat, eine Texteingabe ist dafuer nicht erforderlich.

Die Bibliothek muss nicht gefuellt sein, um Trainingswerkzeuge zu verwenden. Das Erfassen freier Namen/Beschreibungen fuer neue Lineups bleibt vorerst im Dashboard oder bei `.savenade`. Matchverwaltung, beliebige Konsolenbefehle und ein vollstaendiger Texteditor sind nicht Bestandteil dieser ersten Trainingsintegration.

## Architektur und Erweiterungen

`InGameMenu` verwaltet beliebig verschachtelte Seiten, Auswahl, History und Pagination ohne Spiel-API. `MenuInput` uebersetzt Use/Inspect und Bewegungstasten in einmalige Aktionen beim Loslassen. `MenuRenderer` ist die gemeinsame CS2-HTML-Darstellung mit Titel, Seitenzaehler, gelber Auswahl samt Pfeil, Kontexthilfe und Bedienleiste. `TrainingMenu` definiert die Inhalte und eine feste Befehlsliste. Der Plugin-Adapter besitzt den Spielerzustand, sperrt Bewegung/Angriffe, validiert die Ausfuehrung und gibt den Zustand wieder frei.

Neue Funktionen erhalten eine `TrainingAction`, einen Menueeintrag und einen expliziten Handler bzw. Allowlist-Befehl. Bibliotheksnamen und Beschreibungen werden niemals als Befehle ausgefuehrt. MatchZy-Befehle laufen ueber `ExecuteClientCommandFromServer` im Spieler-Kontext, niemals als privilegierter Serverkonsolenaufruf. Dadurch bleiben MatchZys eigene Berechtigungspruefungen wirksam. Es wird kein eigener MatchZy-Zustand fuer persoenliche Toggles gespiegelt; die Eintraege heissen bewusst "umschalten" und behaupten keinen unbekannten An/Aus-Status.

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

## Pruefen

```sh
dotnet test nades-plugin/MatchZyNades.Tests/MatchZyNades.Tests.csproj --configuration Release
docker build -f cs2/Dockerfile --target nades-tests .
```

Die automatischen Tests pruefen das MatchZy-Dateiformat, Map- und Owner-Filter, doppelte Namen verschiedener Owner, Koordinaten, Granatentypen, Pagination, Navigationshistorie, leere Kategorien, Practice-Sperren, Bestaetigungsseiten, Befehlszuordnung, gehaltene Tasten, Use/Inspect-Prioritaet, sichere Textdarstellung und Statusdateien. Die native Koerperrotation, HUD-Darstellung, MatchZy-Berechtigungen und echten Spielereingaben brauchen zusaetzlich einen CS2-Client; diese Tests belegen den Ingame-Fix nicht.

Ab Plugin **1.0.2** ein Lineup mit steilem Blickwinkel nach oben oder unten nahe einer Wand ueber `.nades`, `.nades last` und MatchZys `.loadnade` laden. Auch `.last` und `.loadpos` pruefen. In Ego-Perspektive und mit einem zweiten Spieler kontrollieren, dass der Koerper aufrecht bleibt und die Zielrichtung stimmt. `.nades check` muss fuer die Neigung und seitliche Drehung des Koerpers null anzeigen, waehrend der Blickwinkel erhalten bleibt. Ein Lineup nach aktivem Noclip ueber `.nades` laden und normales Landen/Bewegen pruefen. Nach dem Update das CS2-Image neu bauen und im Dashboard die Plugin-Version kontrollieren.

Fuer den Ingame-Test mindestens sechs Smokes auf derselben Map speichern, davon eine privat. `.nades` ueber normalen und Teamchat sowie F6 pruefen, mit W/S und A/D bis auf die zweite Listenseite navigieren, Details mit E oeffnen und mit G/Inspect zur selben Auswahl zurueckkehren. Lineup mit E laden und Position, Blickwinkel und Granate pruefen. Die Hauptmenue-Aktion zum erneuten Laden testen. Menue mit Inspect im Hauptmenue und F6 schliessen; nach Tod/Respawn sowie Mapwechsel erneut oeffnen. Waehrend ein Menue offen ist, im Dashboard ein Lineup aendern oder loeschen und die erneute Auswahl pruefen. Mit einem zweiten Spieler private Eintraege und die Bestaetigung gemeinsamer Aktionen kontrollieren. Training einmal als berechtigter und einmal als unberechtigter Spieler ueber das Menue starten. Leere Bibliothek, lange Namen, gehaltenes E beim Oeffnen, Inspect mit anderem Bind, Practice-Ende, normale Bewegung/Angriffe nach Schliessen und Ziffernbinds pruefen. Das echte HUD bei 16:9 und 4:3 auf Abschneiden/Lesbarkeit kontrollieren.

Die verwendeten API-Einstiegspunkte sind in den offiziellen CounterStrikeSharp-Quellen dokumentiert: [Spieleraktionen und HTML-Ausgabe](https://github.com/roflmuffin/CounterStrikeSharp/blob/main/managed/CounterStrikeSharp.API/Core/Model/CCSPlayerController.cs). Dateiformat und Slot-Auswahl entsprechen [MatchZys PracticeMode](https://github.com/shobhit-pathak/MatchZy/blob/main/PracticeMode.cs).
