# Ingame-Panel: Gestaltung und UX

Vorschläge, wie das kompakte Panorama-Panel schöner und besser bedienbar wird. Die Tokens und Begriffe stammen aus dem [Design System](design-system.md). Die Bedienung ist in [Playbook im Spiel](nades-menu.md) beschrieben.

Feste Rahmenbedingungen, die alle Vorschläge einhalten:

- Es gibt nur die kompakte Größe. Das Panel bleibt 380 px breit am rechten Rand.
- Jede Seite reserviert immer neun Listenplätze. Leere Plätze bleiben im Fluss, damit die Navigation nie springt.
- Panorama kennt keine CSS-Variablen, keine Container-Queries und nur einen Teil von CSS. Werte stehen als Hex mit Verweis auf den Token.
- Der Server setzt Texte über Dialog-Variablen und Zustände über CSS-Klassen pro Spieler (`ScreenPanel`). Neue Darstellungen brauchen also entweder neue Klassen, neue Labels oder beides.
- Darstellung muss im Spiel abgenommen werden. Nichts davon ist hier verifiziert.

## Umsetzungsstand

Umgesetzt in `training-hud/` und `server-plugin/Playbook/`, Abnahme im Spiel steht aus: A1 bis A9, B1, B3 (als Eintrag „Zuletzt trainiert“ in den Trainingswerkzeugen, damit die Startseite ihre neun Plätze behält), B4, B5 (die Statuszeile zeigt „Nicht verfügbar“, der Hinweis steht in der Beschreibung), B7. B6 ist für die Aufnahme über D4 umgesetzt (Countdown und Balken), für Medien-Reviews nicht. Offen: B2 (Reihenfolge der Startseite; betrifft Tests und Dokumentation), B8 (Mausrad), B9 (Begriffe). Die Gestaltungsideen D1 bis D10 sind ebenfalls umgesetzt. Die Notiz-Töne werden aus dem Wortlaut abgeleitet (`PanelNotice.ToneFor`); explizite Töne über `InGameMenu.SetNotice` gewinnen.

## Befund

So sieht das Panel heute aus (aus `playbook_training.xml` und `playbook_training.css`):

```
┌────────────────────────────────────────┐
│               Playbook                 │  24 px, zentriert
│ Home › Granaten-Bibliothek › Smokes    │  12 px
│ ▌★ Fenster vom T-Spawn [Review]        │  Zeile 32 px, Rail 3 px
│   Jungle-Smoke                         │
│   CT-Smoke                             │
│   …                                    │
│   (leer)                               │
│ [Zurück][<- Seite] 1/2 [Seite ->][Home]│
│ ────────────────────────────────────── │
│ BESCHREIBUNG                           │
│ Offiziell. An der Kante stehen …       │  4 Zeilen
└────────────────────────────────────────┘
```

Was gut ist: die feste Höhe, die stabile Navigation, Beschreibung als eigener Bereich, Breadcrumb.

Was stört:

1. **Die Marke frisst die wertvollste Zeile.** „Playbook“ in 24 px zentriert sagt dem Spieler nichts über seinen Ort. Der eigentliche Seitentitel steht nur als letztes Glied im Breadcrumb in 12 px.
2. **Status steckt im Text.** Favorit („★ “), Review („[Review]“), Offiziell (nur in der Beschreibung) und Zähler („(12)“) sind Teil des Labels. Sie verschieben den Namen, sind nicht farbcodiert und werden bei langen Namen abgeschnitten.
3. **Kein Typ, keine Seite erkennbar.** In „Alle“ sieht man nicht, ob eine Zeile Smoke oder Flash, T oder CT ist. Im Web ist das die Radar-Tinte.
4. **Man sieht nicht, ob die Maus gerade das Panel oder das Spiel steuert.** Der Unterschied zwischen `editing` und freiem Spielen ist nur an den Hover-Effekten erkennbar. Das ist der häufigste Moment der Verwirrung (KP_0).
5. **Die Navigationsleiste hat fünf gleich gewichtete Buttons.** „Zurück“ und „Home“ sind auf der Startseite wirkungslos, aber sichtbar. Seitenwechsel ist nur bei mehreren Seiten relevant.
6. **Hinweise und Fehler sehen aus wie Beschreibungen.** Eine Ablehnung („Die Bibliothek wurde aktualisiert.“) steht in derselben Farbe und Position wie der Hilfetext der Zeile.
7. **Arial.** Die Website nutzt IBM Plex, das Spiel Stratum2. Arial passt zu keinem von beiden.
8. **Farben weichen vom Web ab.** Auswahl in Hellblau `#89d3ff`, Flächen `#273d50` und `#334d62` kommen nirgends sonst vor.

## Zielbild

```
┌────────────────────────────────────────┐
│ PLAYBOOK · MIRAGE              ● Maus  │  Label-Zeile: Marke klein, Fokuszustand rechts
│ Smokes · Alle                          │  Seitentitel 18 px
│ Home › Bibliothek › Smokes             │  Breadcrumb 11 px, gedämpft
│ 1 ▌● Fenster vom T-Spawn      ★ JT 3,1 │  Nummer · Tinte · Name · Meta rechts
│ 2  ● Jungle                      CT    │
│ 3  ● Top Mid                   Review  │
│ 4  ● Connector              Offiziell  │
│ 5  ● …                                 │
│ 6                                      │
│ 7                                      │
│ 8                                      │
│ 9                                      │
│ ‹ Zurück          2 / 3          ⌂     │  Navigation nach Kontext
│ ────────────────────────────────────── │
│ ✓ Offiziell · Smoke · T                │  Statuszeile zur Auswahl
│ An der Kante stehen. Auf die obere …   │  Beschreibung, 3 Zeilen
└────────────────────────────────────────┘
```

Gleiche Breite, gleiche neun Plätze, gleiche Höhe der Beschreibung. Anders ist die Hierarchie: Ort zuerst, Status als Farbe und rechtsbündige Meta, Navigation nur dort, wo sie etwas tut.

## Vorschläge

Jeder Vorschlag nennt, was sich wo ändert: **XML** (Layout), **CSS** (Panorama-Stylesheet), **C#** (`ScreenPanel`, `TrainingMenu`, `InGameMenu`). Aufwand S, M, L.

### A. Gestaltung

**A1. Kopf umbauen: Ort statt Marke.** (XML, CSS, C#; S)
Die Marke wird zur Label-Zeile in 11 px Mono-Optik oben links, mit der aktuellen Map daneben. Der Seitentitel bekommt eine eigene Zeile in 18 px. Der Breadcrumb bleibt darunter in 11 px gedämpft. C#: neue Dialog-Variable `training_title` mit `menu.Current.Title`, `training_map` mit der Map.

**A2. Farben auf die Web-Tokens bringen.** (CSS; S)
Panel `#0b1118f2` (`--surface-1`), Kante `#334253` (`--line-default`), Text `#edf3f8`, gedämpft `#a3b3c3`, Auswahl `#1b2a37` (`--sidebar-accent`) mit Mint-Leiste `#80cabc`, Hover `#263341`. Buttons `#263341`, Hover `#304052`. Damit entsprechen Auswahl und Hover exakt der Sidebar der Website.

**A3. Schrift.** (CSS; S)
`font-family: "Stratum2", "IBM Plex Sans", Arial`. Stratum2 ist die UI-Schrift von CS2 und auf jedem Client vorhanden; das Panel wirkt damit wie ein Teil des Spiels statt wie ein Fremdfenster. Im Spiel prüfen, ob die Panorama-Schriftliste den Namen auflöst; sonst bleibt Arial als Fallback.

**A4. Zeilenanatomie mit Radar-Tinte.** (XML, CSS, C#; M)
Jede Zeile bekommt vier Elemente: Nummer 1 bis 9 (Mono, 11 px, gedämpft; die Zifferntasten aus `nades-menu.cfg` sind damit sichtbar), Typpunkt in Radar-Tinte, Name, rechtsbündige Meta. C#: pro Zeile Klasse `kind-smoke`, `kind-flash`, `kind-he`, `kind-molly`, `kind-decoy` und Dialog-Variable `row_i_meta`. Die Tinte: Smoke `#9fb3c4`, Flash `#f7dd6a`, HE `#ef6461`, Molotov `#f58345`, Decoy `#ae8eff`, Seiten T `#de9a3a`, CT `#6aa9ec`.

**A5. Status raus aus dem Namen.** (C#; S, zusammen mit A4)
„★ “ wird zu einem Stern in der Meta-Spalte, „[Review]“ zu einer Meta in Warnfarbe `#e7bb6c`, „Offiziell“ zu einem Häkchen in `#86d394`. Zähler wie „Smokes (12)“ wandern ebenfalls rechts in Mono. Der Name bleibt links und bricht erst dann mit Auslassung um, wenn er wirklich zu lang ist.

**A6. Fokuszustand sichtbar machen.** (CSS; S)
Die Panelkante wird im Zustand `editing` Mint (`#80cabc`), sonst `#334253`. Oben rechts steht ein Punkt mit „Maus“ (editing) oder „Spiel“ (frei), gesteuert über dieselbe Klasse. Damit ist auf einen Blick klar, ob KP_0 gerade nötig ist.

**A7. Hinweise mit Ton.** (CSS, C#; S)
`training_detail` erhält zusätzlich die Klasse `notice-info`, `notice-success` oder `notice-error`, wenn ein `Notice` statt einer Beschreibung gezeigt wird. Erfolg grün, Fehler rot, Hinweis gedämpft, jeweils mit einer 2 px Leiste links. C#: `Notice` wird zum Record mit Text und Ton; `PlaybookPlugin.cs:194` und `InGameMenu.cs:110` setzen den Ton.

**A8. Statuszeile über der Beschreibung.** (XML, CSS, C#; S)
Die Zeile „BESCHREIBUNG“ sagt nichts. Stattdessen eine Statuszeile zur gewählten Zeile: „Offiziell · Smoke · T · Jumpthrow · 3,1 s“, in 11 px Mono, in Radar-Tinte für Typ und Seite. Die Beschreibung darunter behält ihre feste Höhe. Die gewonnene Zeile bleibt in der Beschreibung, damit nichts unter dem Text hinzukommt.

**A9. Übergänge.** (CSS; S)
`transition-property: background-color, border-color; transition-duration: 0.12s` auf Zeilen und Buttons. Mehr nicht. Panorama unterstützt das; es nimmt dem Panel die Härte beim Scrollen durch Zeilen.

### B. Bedienung

**B1. Navigation nach Kontext.** (C#, CSS; S)
Auf der Startseite „Zurück“ und „Home“ ausblenden (Klasse `unavailable` wie bei den Seitenbuttons). Bei einer einzigen Seite „‹ Seite“ und „Seite ›“ ausblenden und die Seitenzahl weglassen. Die Leiste zeigt dann nur, was gerade wirkt. Die Plätze bleiben reserviert, damit nichts springt.

**B2. Erste Zeile ist eine Handlung, nicht eine Frage.** (C#; S)
In Lineup-Seiten steht „Lineup laden & trainieren“ bereits an erster Stelle. Dasselbe Prinzip auf alle Seiten anwenden: Das Wahrscheinlichste zuerst, Zerstörendes zuletzt, „Abbrechen“ in Bestätigungsseiten zuerst (ist bereits so). Auf der Startseite „Must Know“ vor „Granaten-Bibliothek“, weil das der schnellste Weg in ein sinnvolles Training ist.

**B3. Zuletzt verwendet.** (C#; M)
Eine Startseiten-Zeile „Zuletzt trainiert“ mit den letzten fünf geladenen Lineups dieser Map pro Spieler, gespeichert in `PlayerPanelSettingsStore`. Spieler wiederholen in einer Session dieselben Würfe; heute sind das jedes Mal drei bis vier Klicks.

**B4. Favorit direkt in der Liste.** (C#, XML; M)
Ein zweiter Button pro Zeile rechts (Stern, 24 px), der `ToggleFavorite` auslöst, ohne die Lineup-Seite zu öffnen. Panorama-Buttons können verschachtelt sein; der Stern bekommt eine eigene ID `row_i_fav`, die `PanelControls` wie die Zeilen-IDs routet.

**B5. Deaktivierte Zeilen erklären sich.** (C#; S)
Wenn eine Zeile `Enabled = false` ist, zeigt die Statuszeile (A8) den Grund schon bei Auswahl, nicht erst nach dem Klick. `InGameMenu.cs:110` setzt den Hinweis heute erst beim Aktivieren.

**B6. Fortschritt bei Aufnahme und Review.** (XML, CSS, C#; M)
Während einer laufenden Aufnahme (drei Minuten) oder eines Medien-Reviews zeigt die Statuszeile einen Schritt-Indikator: „Aufnahme · Wurf 0/1 · 2:41“. Die Zeit läuft serverseitig, das Panel wird nur bei Schrittwechseln und einmal pro Sekunde für die Restzeit aktualisiert. Das ersetzt heute Chat-Nachrichten, die unter Spielgeschehen untergehen.

**B7. Bestätigungsseiten mit Tonfall.** (C#, CSS; S)
Seiten wie „Aufnahme löschen“ bekommen die Klasse `danger` am Panel, die die Panelkante rot färbt und die letzte Zeile („Aufnahme endgültig löschen“) in Gefahrfarbe setzt. Die Reihenfolge mit „Abbrechen“ zuerst bleibt.

**B8. Seitenwechsel mit Mausrad.** (C#; S, Abnahme nötig)
Wenn Panorama das Rad-Ereignis an `custom_hud_layout` liefert, blättert es durch die Seiten. Die Zifferntasten und Buttons bleiben. Im Spiel prüfen; falls das Ereignis nicht ankommt, entfällt der Punkt ohne Ersatz.

**B9. Ein Wort pro Begriff.** (C#; S)
Im Spiel heißt es „Nade“, „Granate“ und „Lineup“ für dasselbe Ding. Gemäß Design System: „Lineup“ für den gespeicherten Wurf, „Granate“ für den Typ, „Aufnahme“ für den Vorgang und das noch nicht offizielle Ergebnis. Labels in `TrainingMenu.cs` entsprechend vereinheitlichen.

### C. Reihenfolge

1. A2, A3, A6, A9, B1: nur CSS und zwei Klassen, in einer Sitzung im Spiel abnehmbar.
2. A1, A5, A8, A7, B5, B7: Kopf, Status und Hinweise. Braucht neue Dialog-Variablen und einen Ton am Notice.
3. A4, B4: Zeilenanatomie mit Tinte und Stern. Größte Wirkung, größter Umbau von `ScreenPanel`.
4. B3, B6, B8: neue Funktionen, jeweils einzeln abnehmbar.

## Umgesetzte Dateien

- `training-hud/styles/playbook_training.css` und `training-hud/layout/playbook_training.xml`: Kopfzeile mit Marke, Map und Fokuszustand, Seitentitel, neun Zeilen mit Nummer, Typpunkt, Name, Meta, Statusglyphe und Stern, kontextabhängige Navigation, Statuszeile, Beschreibung mit Ton.
- `server-plugin/Playbook/InGameMenu.cs`: `MenuItem` trägt `Meta`, `Kind`, `Side`, `Favorite`, `Review`, `Official`, `Status` und `Lineup`; `MenuPage` trägt `Danger`; `InGameMenu` kennt `NoticeTone`, `SetNotice` und `Status`.
- `server-plugin/Playbook/ScreenPanel.cs`: setzt die Texte `training_map`, `training_title`, `training_focus`, `training_status`, `row_i_meta`, `row_i_state`, `row_i_fav_text` und die Klassen `kind-*`, `side-*`, `favorite`, `review`, `official`, `lineup`, `notice-*`, `danger`, `unavailable`.
- `server-plugin/Playbook/PanelControls.cs`: Klicks auf `row_i_fav` schalten den Favoriten der sichtbaren Zeile um, ohne die Lineup-Seite zu öffnen.
- `server-plugin/Playbook/PlayerPanelSettings.cs`: `Recent` mit den fünf zuletzt geladenen Lineups, gespeichert neben den Favoriten.

Im Spiel zu prüfen: ob Panorama den Klick auf den Stern zusätzlich an die Zeile weiterreicht (dann öffnet sich die Lineup-Seite mit), ob `Stratum2` als Schriftname aufgelöst wird, ob `visibility: collapse` auf dem Stern die Zeilenbreite korrekt freigibt, ob die Icon-Pfade `s2r://panorama/images/icons/equipment/*.vsvg_c` existieren und `wash-color` sie einfärbt, ob `transform: translateX` beim Einblenden animiert und ob `CompTeammateColor` die Radarfarbe des Spielers liefert. Nach Layoutänderungen CS2 vollständig neu starten.

## D. Weitere Gestaltungsideen

Umgesetzt in Layout, Stylesheet und Plugin; Abnahme im Spiel steht aus. Alle halten die neun Plätze und die kompakte Breite ein.

**D1. Typ-Icons statt Punkte.** Jede Zeile zeigt das Ausrüstungsicon von CS2 selbst (`s2r://panorama/images/icons/equipment/*.vsvg_c`) als Hintergrundbild, über `wash-color` in Radar-Tinte eingefärbt. Das Addon braucht dafür keine eigenen Texturen. Unbekannte Typen behalten den Punkt. Im Spiel prüfen: Pfade der Icons und ob `wash-color` auf Hintergrundbilder wirkt.

**D2. Farbleiste nach Kontext.** Ein 3 px Streifen oben im Panel (`.rail`) trägt die Tinte des Granatentyps, sobald eine Seite nur einen Typ zeigt (`MenuPage.Kind`, Klasse `page-kind-*`). Auf allen anderen Seiten bleibt der Streifen transparent, damit nichts springt.

**D3. Ein- und Ausblenden mit Bewegung.** Das Panel kommt mit `opacity` und `transform: translateX` über 160 ms aus dem Rand. Das Ausblenden entfernt die Entity sofort, daher gibt es nur die Einblendung.

**D4. Fortschrittsbalken bei Aufnahme.** Während der drei Minuten zeigt die Statuszeile „Aufnahme läuft · 2:41 · eine Granate werfen“ und ein 3 px Balken darunter leert sich in 5-%-Schritten (Klassen `p-0` bis `p-20`), die letzten 30 Sekunden in Warnfarbe. Der Server liefert nur die Restsekunden aus `_saveRequests`.

**D5. Seitenpunkte statt Zahl.** Bei zwei bis fünf Seiten erscheinen Punkte, der aktive in Mint (`page_dot_0` bis `page_dot_4`, Klassen `shown` und `active`). Ab sechs Seiten steht wieder „2/7“.

**D6. Bestätigungsseiten mit roter Schattierung.** Die zerstörende Zeile trägt `MenuItem.Danger` und wird rot getönt, ihr Name rot, die Auswahlleiste rot.

**D7. Hervorgehobene Must-Know-Zeilen.** Must-Know-Lineups (`MenuItem.MustKnow`) färben ihr Typicon Mint statt in Typfarbe, passend zum gefüllten Badge der Website. Die Form des Icons zeigt weiter den Typ.

**D8. Tastenhinweise als Chips.** In der Keybinds-Seite steht die Taste rechts als Mono-Chip mit Rahmen (`MenuItem.MetaChip`), die Beschriftung links.

**D9. Leere Plätze andeuten.** Leere Zeilen zeigen eine sehr schwache Linie (`#334253` zu 30 %) ohne Nummer und Icon. Wirkt es im Spiel unruhig, genügt `.row.empty { border-bottom: 0px; }`.

**D10. Spielerfarbe.** Der Punkt oben rechts trägt die CS2-Teamfarbe des Spielers (`CompTeammateColor`, Klassen `player-0` bis `player-4`). Den Eingabezustand zeigen weiterhin Panelkante und das Wort „Maus“ oder „Spiel“.
