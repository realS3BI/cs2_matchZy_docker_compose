# Trainingszentrale im Spiel

Das eigene CounterStrikeSharp-Plugin `MatchZyNades` bietet ab **1.4.0** eine Trainingszentrale als **experimentelles Seitenpanel rechts**. Sichtbarkeit und Bedienung sind getrennt: Beim Spielen bleiben Auswahl, Beschreibungen und eigene Rueckmeldungen sichtbar. Granaten-Bibliothek, Aufnahme neuer Nades, Wurf-/Positionsaktionen und Trainingswerkzeuge lassen sich ueber das Panel aufrufen. Es verwendet die bestehende MatchZy-Datei `game/csgo/cfg/MatchZy/savednades.json`; Dashboard, `.savenade` und das Menue arbeiten damit auf derselben Bibliothek.

**Darstellungsgrenze:** Das Panel besteht aus privaten `point_worldtext`-Entities, deren Position jeden Server-Tick der Blickrichtung folgt. CS2 hat die frueher verwendeten Viewmodel-Entities entfernt. Deshalb ist dieses Panel kein festes, clientseitig gerendertes HUD: Bei schnellen Kamerabewegungen, Latenz, Zoom oder nahe an Geometrie sind Versatz, Abschneiden oder Verdeckung moeglich. Die Darstellung ist noch nicht im Spiel abgenommen. Fuer ein festes Panorama-HUD mit Kartenansicht und Fotos ist eine eigene Ausbaustufe mit Workshop-Layout und Addon-Auslieferung vorgesehen; diese Assets werden hier noch nicht mitgeliefert. Hintergrund: [entfernte Viewmodels](https://github.com/M-archand/CenterSpeed), [Panorama-HUD und Workshop-Voraussetzungen](https://github.com/nvmxre/cs2-ui-kit).

## Aktivieren

1. Den aktualisierten Stack neu bauen und deployen: `docker compose up -d --build` (in Coolify: neu bauen/deployen).
2. Im Dashboard unter `Plugins` den Servermodus **Nades** oder **MatchZy** auswaehlen und `Apply & restart` ausfuehren. Die Statuskarte muss Version **1.4.0** als **Loaded** anzeigen.
3. Einmal die unten beschriebenen F6-/F7-Binds setzen. In CS2 einem Team beitreten, spawnen und F6 druecken. Alternativ funktioniert weiterhin `.nades`.

Das Image baut das Plugin gegen CounterStrikeSharp **1.0.373**, fuehrt dessen Unit-Tests aus und installiert es beim Bootstrap in den Modi **Nades und MatchZy**. CounterStrikeSharp muss mindestens API 373 bereitstellen. In den Modi Warmup und Vanilla entfernt der Bootstrap die Plugin-DLL. Das Hauptmenue ist auch vor dem Practice-Modus erreichbar und bietet dann **Training starten** an. MatchZy prueft dabei die bestehenden Spielerberechtigungen. Trainingsaktionen verlangen `sv_cheats`, das MatchZy im Practice-Modus aktiviert und beim Verlassen deaktiviert.

Unter **Plugins** und **Nades** zeigt die Karte **MatchZy Nades · In-game menu** den Installations- und Laufzeitstatus. **Loaded** bedeutet, dass das Plugin innerhalb der letzten 30 Sekunden eine Rueckmeldung aus diesem Containerstart geschrieben hat; dazu erscheinen Plugin-Version und Practice-Zustand. Die Anzeige aktualisiert sich alle 30 Sekunden oder per **Refresh status**. **Installed · unconfirmed** bedeutet nur, dass die DLL vorhanden ist. **Not installed** erklaert, ob `Apply & restart` reicht oder das CS2-Image neu gebaut werden muss. Unter **Diagnostics** gibt es ausserdem einen eigenen Pruefschritt fuer das Menue.

Nach diesem Update beide Images (Dashboard und CS2) neu bauen und deployen. Ein Neustart eines alten Images bringt die neue DLL und Anzeige nicht mit. Die Laufzeitrueckmeldung liegt in `addons/counterstrikesharp/plugins/MatchZyNades/data/status.json`, wird alle fuenf Sekunden atomar erneuert und beim Entladen auf `unloaded` gesetzt. Veraltete Rueckmeldungen aus einem vorherigen Containerstart gelten nicht als Ladebestaetigung.

## Bedienung ohne Installation am Client

Unter **Granaten-Bibliothek** stehen **Smoke, HE, Flash, Molotov / Incendiary und Decoy** zur Auswahl. Falls alte Eintraege ohne bekannten Typ existieren, erscheint zusaetzlich **Ohne Typ**. Jede Kategorie zeigt ihre Anzahl auf dieser Map. Nach Auswahl eines Typs folgt eine alphabetische Liste mit fuenf Eintraegen pro Seite. Ein Lineup oeffnet eine Detailseite mit Beschreibung und **Lineup laden & trainieren**. Zurueck stellt die vorherige Seite und Markierung wieder her.

| Eingabe | Aktion |
| --- | --- |
| F6 (einmal binden) | Panel oeffnen / Bedienung einschalten oder zurueck ins Spiel; Anzeige bleibt sichtbar |
| F7 (einmal binden) | Panel verstecken / passiv wieder anzeigen; Auswahl bleibt erhalten |
| W / S kurz druecken und loslassen | Vorherigen / naechsten Eintrag markieren; blaettert an Seitengrenzen automatisch |
| E / Use loslassen | Markierten Eintrag bestaetigen |
| G / Inspect loslassen | Eine Ebene zurueck; im Hauptmenue nur die Bedienung beenden |
| A / D loslassen | Vorherige / naechste Seite |
| R / Reload loslassen | Naechste Seite einer langen Beschreibung; nur im Bedienmodus |
| `.nades 1` bis `.nades 5` | Eintrag auf der sichtbaren Seite auswaehlen |
| `.nades 6` | Eine Ebene zurueck; im Hauptmenue die Bedienung beenden |
| `.nades 7` / `.nades 8` | Vorherige / naechste Seite |
| `.nades 9` oder `.nades close` | Panel ausblenden |
| `.nades last` | Zuletzt ausgewaehltes Lineup erneut laden |
| `.nades check` | Aktuelle Position, Bewegungsmodus, Blickwinkel und Koerperwinkel im Chat und Serverlog anzeigen |

Die Buchstaben entsprechen Spielaktionen: Vorwaerts/Rueckwaerts, Seitwaerts, Use, Inspect und Reload. **G funktioniert als Zurueck, wenn G auf Inspect gebunden ist**. Eigene Binds gelten entsprechend. Mausangriffe waehlen nichts aus. Bereits beim Aktivieren des Bedienmodus gehaltene Tasten muessen erst losgelassen und erneut gedrueckt werden. Das Panel hat keinen Mauszeiger. Nur im **Bedienmodus** werden Bewegung und neue Angriffe gesperrt; Use und Reload koennen weiterhin Spielaktionen ausloesen. Im passiven oder versteckten Zustand konsumiert das Panel keine Navigation. Nach 90 Sekunden ohne Menueeingabe wird nur die Bedienung beendet. F7 gibt ebenfalls sofort die Spielsteuerung frei. Beim erneuten Aktivieren wird der aktuelle Bewegungs-/Angriffszustand gesichert, sodass zwischenzeitliches Noclip erhalten bleibt. Bei Tod, Respawn, Rundenbeginn, Mapwechsel oder Plugin-Unload werden Anzeige und Sperren entfernt; danach F6/F7 erneut verwenden. Ein Practice-Wechsel baut die Inhalte neu auf und gibt die Steuerung frei.

Unter **Panelposition 16:9 / 4:3** auf der zweiten Hauptmenue-Seite laesst sich der rechte Abstand fuer schmale Bildformate aendern. Die Einstellung gilt bis zum Neuaufbau des Panels. Lange Beschreibungen werden in sechszeilige Seiten aufgeteilt; **R** blaettert im Bedienmodus weiter. Jedes Textfeld bleibt unter dem nativen 512-Byte-Limit, auch bei mehrbyteigen Zeichen.

Alternativ funktionieren `!nades` im Chat und `css_nades` in der Client-Konsole. Zum Beispiel entspricht `css_nades last` dem Chatbefehl `.nades last`.

## Ohne Chat bedienen

Einmal auf dem Gaming-PC in der CS2-Konsole setzen, oder die optionale [training-menu.cfg](training-menu.cfg) installieren und `exec training-menu` ausfuehren. Vorher eigene F6-/F7-Binds sichern:

```cfg
bind "F6" "css_training"
bind "F7" "css_training_visible"
```

F6 wechselt zwischen Bedienung und Spielen, F7 zwischen sichtbar und versteckt. E, Inspect und Reload brauchen keine zusaetzlichen Binds. Der Server kann Client-Tasten nicht automatisch umbelegen.

**Wurf & Position** bietet letzten Wurf wiederholen, zum letzten Abwurfpunkt, Position merken/laden, Noclip, aktive Granaten entfernen, naechsten/entferntesten Team-Spawn und **Granate ausruesten** fuer alle fuenf Granatentypen. **Trainingswerkzeuge** bietet stehende/duckende Bots, Bots entfernen, Flugbahnvorschau, Einschlaege, Flashschutz, Unverwundbarkeit und Positionsdiagnose. Aktionen, die den Server gemeinsam betreffen, haben eine Bestaetigungsseite mit Abbrechen als Standardauswahl. Trainingsaktionen geben die Bewegung frei; das Panel bleibt stehen. Eigene Rueckmeldungen erscheinen im Panel und zusaetzlich im Chat. MatchZys eigene Erfolgs-/Berechtigungsnachrichten bleiben vorerst im Chat; das Panel bestaetigt nur die Weitergabe des Befehls und behauptet keinen ungeprueften Erfolg.

**Neue Nade aufnehmen:** Aufnahme starten, Granate werfen, Explosion abwarten, F6 und **Aufnahme speichern** waehlen. Das erzeugt einen eindeutigen Namen aus Typ, Map, UTC-Zeit und Kennung. **Aufnahme verwerfen** bricht ab. Eine ungespeicherte fertige Aufnahme wird durch erneutes Starten nicht ueberschrieben. Nach dem bestehenden Dashboard-Sync **Bibliothek aktualisieren** auf der zweiten Hauptmenue-Seite waehlen und das Lineup laden. Der Sync bleibt Voraussetzung fuer die Aufnahme in MatchZys Bibliothek. Eigene Titel lassen sich spaeter im Dashboard vergeben; die bisherige optionale Chat-Namenseingabe funktioniert weiterhin.

Die Bibliothek muss nicht gefuellt sein, um Trainingswerkzeuge oder Aufnahme zu verwenden. Ein freier Texteditor, Kartenansicht, Fotos und die vollstaendige Uebernahme fremder Plugin-Rueckmeldungen sind weitere Ausbaustufen. Fuer die beschriebenen Panel-Aktionen ist keine Chat-Eingabe erforderlich.

## Architektur und Erweiterungen

`InGameMenu` verwaltet Seiten, Auswahl, History und Pagination ohne Spiel-API. `MenuInput` uebersetzt Use/Inspect/Reload und Bewegungstasten in einmalige Aktionen beim Loslassen. `PanelText` erzeugt begrenzte Textfelder und Detailseiten. `ScreenPanel` erstellt fuenf World-Text-Entities pro sichtbarem Panel, aktualisiert Texte bei Aenderungen und fuehrt die Position pro Tick nach. `CheckTransmit` entfernt die Entities aus den Updates aller anderen Spieler. Verstecken und Lifecycle-Cleanup entfernen die Entities. `TrainingMenu` definiert Inhalte und feste Befehle. Der Plugin-Adapter besitzt Sichtbarkeit, Fokus und Spielerzustand; nur Fokus aktiviert Bewegungssperre und Eingabeauswertung. `MenuRenderer` bleibt als bisheriger HTML-Renderer und Text-Hilfsfunktion erhalten, wird fuer die neue Anzeige nicht aufgerufen.

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

Die automatischen Tests pruefen das MatchZy-Dateiformat, Map- und Owner-Filter, doppelte Namen verschiedener Owner, Koordinaten, Granatentypen, Pagination, Navigationshistorie, leere Kategorien, Practice-Sperren, Bestaetigungsseiten, Befehlszuordnung, gehaltene Tasten, Use/Inspect-Prioritaet, sichere Textdarstellung und Statusdateien. Die native Koerperrotation, World-Text-Darstellung und deren private Uebertragung, MatchZy-Berechtigungen und echten Spielereingaben brauchen zusaetzlich einen CS2-Client; diese Tests belegen den Ingame-Fix nicht.

Ab Plugin **1.0.2** ein Lineup mit steilem Blickwinkel nach oben oder unten nahe einer Wand ueber `.nades`, `.nades last` und MatchZys `.loadnade` laden. Auch `.last` und `.loadpos` pruefen. In Ego-Perspektive und mit einem zweiten Spieler kontrollieren, dass der Koerper aufrecht bleibt und die Zielrichtung stimmt. `.nades check` muss fuer die Neigung und seitliche Drehung des Koerpers null anzeigen, waehrend der Blickwinkel erhalten bleibt. Ein Lineup nach aktivem Noclip ueber `.nades` laden und normales Landen/Bewegen pruefen. Nach dem Update das CS2-Image neu bauen und im Dashboard die Plugin-Version kontrollieren.

Fuer den Ingame-Test mindestens sechs Smokes auf derselben Map speichern, davon eine privat. `.nades` ueber normalen und Teamchat sowie F6 pruefen, mit W/S und A/D bis auf die zweite Listenseite navigieren, Details mit E oeffnen und mit G/Inspect zur selben Auswahl zurueckkehren. Lineup mit E laden und Position, Blickwinkel und Granate pruefen. Die Hauptmenue-Aktion zum erneuten Laden testen. Mit Inspect im Hauptmenue und F6 die Bedienung beenden, dann mit F7 verstecken und wieder anzeigen; nach Tod/Respawn sowie Mapwechsel erneut oeffnen. Waehrend ein Menue offen ist, im Dashboard ein Lineup aendern oder loeschen und die erneute Auswahl pruefen. Mit einem zweiten Spieler private Eintraege und die Bestaetigung gemeinsamer Aktionen kontrollieren. Training einmal als berechtigter und einmal als unberechtigter Spieler ueber das Menue starten. Leere Bibliothek, lange Namen, gehaltenes E beim Oeffnen, Inspect mit anderem Bind, Practice-Ende, normale Bewegung/Angriffe nach Schliessen und Ziffernbinds pruefen. Das echte HUD bei 16:9 und 4:3 auf Abschneiden/Lesbarkeit kontrollieren.

Die verwendeten API-Einstiegspunkte sind in den offiziellen CounterStrikeSharp-Quellen dokumentiert: [Spieleraktionen und HTML-Ausgabe](https://github.com/roflmuffin/CounterStrikeSharp/blob/main/managed/CounterStrikeSharp.API/Core/Model/CCSPlayerController.cs). Dateiformat und Slot-Auswahl entsprechen [MatchZys PracticeMode](https://github.com/shobhit-pathak/MatchZy/blob/main/PracticeMode.cs).
