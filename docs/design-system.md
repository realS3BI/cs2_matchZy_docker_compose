# Playbook Design System

Playbook ist ein Werkzeug für Spieler, Captains und Server-Admins, das neben einem laufenden Counter-Strike 2 benutzt wird. Das Design System beschreibt, wie das Web-Dashboard und das Ingame-Panel aussehen, sich anfühlen und sprechen. Die Werte liegen in [`tokens.css`](../admin-panel/client/src/styles/tokens.css); Komponenten greifen nur über diese Tokens auf Farben, Schrift und Abstände zu.

Die Vorschläge für das Ingame-Panel stehen in [Ingame-Panel: Gestaltung und UX](ingame-panel-ux.md).

## Haltung

Playbook sieht aus wie ein Taktikboard neben dem Spiel, nicht wie ein Marketing-Dashboard. Vier Grundsätze:

1. **Radar zuerst.** Die Karte ist die Bühne. Alles andere ist Steuerung am Rand und bleibt visuell ruhig.
2. **Eine Tinte pro Bedeutung.** Granatentyp, Seite und Status haben feste Farben. Dieselbe Farbe bedeutet auf dem Radar, in Listen, in Badges und im Ingame-Panel dasselbe.
3. **Dicht, aber lesbar.** Spieler vergleichen viele Lineups. Zeilen sind kompakt, Hierarchie entsteht über Schriftgewicht und Farbe statt über Leerraum.
4. **Ein Wort, eine Bedeutung.** „Offiziell“, „Must Know“, „Aufnahme“, „Review“ heißen überall gleich, im Web wie im Spiel.

Die Website ist ausschließlich dunkel. Sie wird neben einem dunklen Spiel genutzt; ein helles Thema ist nicht vorgesehen.

## Farbe

### Flächen

Sieben Stufen von der tiefsten Konsole bis zur schwebenden Ebene. Tiefe entsteht durch die Stufe, nicht durch Schatten.

| Token | Wert | Verwendung |
| --- | --- | --- |
| `--surface-0` | `#080e15` | Konsole, Radar-Bühne, Medienhintergrund |
| `--surface-1` | `#0b1118` | Seitenhintergrund |
| `--surface-2` | `#111923` | Sidebar, Login |
| `--surface-3` | `#151e29` | Karten |
| `--surface-4` | `#1b2633` | Popover, Hover auf Karten |
| `--surface-5` | `#263341` | Sekundäre Buttons, Chips |
| `--surface-6` | `#304052` | Akzentfläche bei Hover |

Regel: Ein Element liegt genau eine Stufe über seinem Container. Karten auf der Seite sind Stufe 3, Popover über Karten Stufe 4. Zwei Karten ineinander sind ein Hinweis auf zu viel Struktur.

### Text

| Token | Wert | Verwendung |
| --- | --- | --- |
| `--text-strong` | `#f5f8fb` | Überschriften in Karten, aktive Sidebar-Einträge |
| `--text-default` | `#edf3f8` | Fließtext, Labels |
| `--text-secondary` | `#bbcada` | Sidebar, Zweitzeilen |
| `--text-muted` | `#a3b3c3` | Beschreibungen, Captions, Metadaten |

Alle Kombinationen mit Flächen 1 bis 3 erreichen mindestens 7:1. Text unter 0,75 rem nur in `--text-default` oder `--text-muted`, nie in Statusfarben auf Statusflächen.

### Marke

Das Mint `#80cabc` (`--brand`) ist die einzige interaktive Farbe. Es markiert, was man anklicken kann, was ausgewählt ist und was Playbook selbst ist (Logo, Primärbutton, Auswahlrahmen, Link). Mint wird nicht als Dekoration eingesetzt: keine Verläufe, keine Mint-Flächen hinter Text, außer beim Primärbutton und beim „Must Know“-Badge.

| Token | Wert | Verwendung |
| --- | --- | --- |
| `--brand` | `#80cabc` | Primärbutton, Links, Auswahl |
| `--brand-strong` | `#a0ddd2` | Fokusring |
| `--brand-ink` | `#102b2a` | Text auf Mint |

### Status

| Token | Wert | Bedeutung |
| --- | --- | --- |
| `--status-success` | `#86d394` | Erledigt, verbunden, Offiziell, Plugin aktiv |
| `--status-warning` | `#e7bb6c` | Aufmerksamkeit, ungespeichert, Review ausstehend |
| `--status-danger` | `#f6747e` | Fehler, Löschen, Verbindung verloren |

Erfolg ist bewusst grüner als das Marken-Mint, damit „ausgewählt“ und „freigegeben“ unterscheidbar bleiben. Status erscheint als Text plus Icon oder als Badge mit 10 % Fläche, nie als vollflächiger Hintergrund hinter langen Texten.

### Spielwelt: Radar-Tinte

Das ist die Signatur von Playbook. Jeder Granatentyp und jede Seite hat eine feste Farbe, die auf dem Radar, in Listen, in Badges, in der Legende und im Ingame-Panel identisch ist.

| Token | Wert | Element |
| --- | --- | --- |
| `--nade-smoke` | `#9fb3c4` | Smoke |
| `--nade-flash` | `#f7dd6a` | Flash |
| `--nade-he` | `#ef6461` | HE |
| `--nade-molly` | `#f58345` | Molotov |
| `--nade-decoy` | `#ae8eff` | Decoy |
| `--nade-other` | `#a5f3c6` | Unbekannter Typ |
| `--side-t` | `#de9a3a` | Terroristen |
| `--side-ct` | `#6aa9ec` | Counter-Terroristen |

Die Seitenfarben folgen dem Radar von CS2 (T orange, CT blau), damit Spieler nichts Neues lernen müssen. Flash und T liegen beide im Gelbbereich; sie treten nie ohne Icon oder Label auf, Farbe ist Verstärkung und nie der einzige Träger der Information.

Als Tailwind-Utilities: `text-nade-smoke`, `bg-side-ct/10`, `border-nade-he/40` und so weiter.

## Typografie

Zwei Schriften, drei Rollen.

- **IBM Plex Sans Variable** trägt Überschriften und Fließtext. Überschriften laufen eng (negatives Tracking), Fließtext bleibt neutral.
- **IBM Plex Mono** ist die Datenschrift: Kicker, Zähler, Koordinaten, Flugzeiten, Hostnames, Konsole, Tastenkürzel. Alles, was gemessen oder getippt wurde, steht in Mono.

Plex ist eine Ingenieursschrift mit sichtbarem Charakter in der Kursiven und im Mono. Sie wirkt wie ein Datenblatt neben dem Spiel und gleichzeitig nicht wie ein Standard-Admin-Template.

### Skala

| Rolle | Token | Größe | Gewicht | Tracking | Verwendung |
| --- | --- | --- | --- | --- | --- |
| Display | `--type-display` | clamp(2 rem, 3,7 vw, 3,4 rem) | 580 | −0,055 em | Seitentitel auf Bibliotheksseiten („Alle Maps“) |
| Titel 1 | `--type-2xl` | 1,75 rem | 650 | −0,04 em | Seitentitel in Arbeitsbereichen |
| Titel 2 | `--type-xl` | 1,5 rem | 600 | −0,025 em | Mapname im Explorer, Lineup-Name |
| Titel 3 | `--type-md` | 1 rem | 600 | −0,01 em | Kartentitel |
| Body | `--type-base` | 0,875 rem | 400 | 0 | Fließtext, Formulare |
| Body klein | `--type-sm` | 0,8125 rem | 400 | 0 | Listenzeilen, Sidebar |
| Caption | `--type-xs` | 0,75 rem | 400 | 0 | Beschreibungen, Hilfetexte |
| Micro | `--type-2xs` | 0,6875 rem | 500 | 0 | Metadaten, Badges in Listen |
| Label | `--type-2xs` | 0,6875 rem | 600, Mono, Versalien | +0,1 em | Kicker, Abschnittslabel, Tastenkürzel |

Zeilenhöhen: Überschriften 1,15, Listen 1,35, Fließtext 1,55. Zahlen in Tabellen und Metriken mit `font-variant-numeric: tabular-nums`.

Regeln:

- Keine Schriftgröße außerhalb der Skala. Eine neue Größe ist ein neuer Token, kein Inline-Wert.
- Pro Karte höchstens drei Größen.
- Versalien nur in der Label-Rolle, nie in Überschriften.
- Kursiv ist der Mapkarte vorbehalten (Mapname als Plakatschrift).

## Abstände und Raster

Basis 4 px, Tailwind-Spacing. Richtwerte:

| Beziehung | Abstand |
| --- | --- |
| Icon zu Text | 0,5 rem |
| Elemente in einer Zeile | 0,5 bis 0,75 rem |
| Felder in einem Formular | 1,25 rem |
| Karteninnenraum | 1,25 rem, ab 640 px 1,5 rem |
| Karten zueinander | 1 rem |
| Abschnitte auf einer Seite | 2 rem bis 2,4 rem |
| Seitenrand | 1 rem mobil, 1,5 rem ab 640 px, 2,25 rem ab 1024 px |

Inhaltsbreite maximal 1440 px (`--content-max`). Radar- und Medienbühnen (Map-Explorer, Lineup-Detail, Demo-Player) heben die Begrenzung auf.

Layouts sind Container-Queries auf `workspace`, nicht Viewport-Queries, damit sich Seiten an die Breite neben der Sidebar anpassen.

## Radien, Kanten, Elevation

| Token | Wert | Verwendung |
| --- | --- | --- |
| `--radius-sm` | 8 px | Badges, Kbd, kleine Buttons |
| `--radius-md` | 10 px | Buttons, Inputs, Mapkarten |
| `--radius-lg` | 12 px | Karten, Dialoge, Panels |
| `--radius-xl` | 16 px | Große Bühnen |
| `--radius-pill` | 999 px | Status-Badges, Zähler |

Auf dunkler Fläche trägt die Kante die Tiefe: 1 px `--line-default`, bei Hover `--brand` zu 50 % gemischt. Schatten gibt es nur in drei Stufen:

- `shadow-raised` (Karte): kaum sichtbar, 1 px Lichtkante innen.
- `shadow-hover` (Karte bei Hover): weicher Schatten, 1 px Anheben.
- `shadow-overlay` (Dialog, Popover, Sheet): kräftig, mit 1 px Lichtkante.

Keine Schatten auf Buttons außer `shadow-xs` beim Primärbutton.

## Bewegung

| Token | Dauer | Verwendung |
| --- | --- | --- |
| `--motion-fast` | 140 ms | Farbe, Rahmen, Hintergrund bei Hover |
| `--motion-base` | 180 ms | Chevrons, Karten anheben, Bild-Zoom |
| `--motion-slow` | 240 ms | Dialoge, Sheets |

Easing `--ease-out` (cubic-bezier 0.2, 0.7, 0.2, 1). Bewegung bestätigt eine Handlung und erklärt einen Zustandswechsel; sie dekoriert nicht. Bei `prefers-reduced-motion` sind alle Übergänge aus, Spinner laufen weiter, weil sie Information sind.

## Fokus und Zustände

- Fokus: 2 px Ring in `--ring`, 2 px Offset, auf jeder interaktiven Fläche gleich. Innerhalb dunkler Bühnen (Radar) Offset −3 px.
- Hover: Fläche eine Stufe heller oder Kante zu Mint.
- Ausgewählt: Mint-Kante oder 3 px Mint-Leiste links (Modus-Auswahl, Sidebar, Ingame-Zeile).
- Deaktiviert: 50 % Deckkraft, Cursor normal, keine Hover-Reaktion.
- Beschäftigt: Spinner im Button, Label wechselt zu „Wird … “, `aria-busy`.
- Erledigt: Häkchen und Label „Erledigt“ für 2,5 s, dann zurück.

## Icons

Lucide, 1 rem in Text und Buttons, 1,25 rem in Listen-Spalten, Strichstärke 2. Granaten- und Seitenicons sind die eigenen Bitmaps und SVGs unter `assets/nades`, immer mit `aria-hidden` und einem Textlabel daneben. Ein Icon allein ist nur bei Icon-Buttons mit `aria-label` erlaubt.

## Komponenten

Die Basis sind shadcn-Komponenten unter `client/src/components/ui`. Playbook ergänzt Varianten, keine Parallelwelt.

### Button

| Variante | Aufgabe |
| --- | --- |
| `default` | Die eine Hauptaktion einer Ansicht (Mint) |
| `secondary` | Gleichwertige Alternativen (Karte mit Kante) |
| `outline` | Abbrechen, sekundäre Aktionen in Dialogen |
| `ghost` | Werkzeuge in Listen, Favoriten, Icon-Buttons |
| `destructive` | Löschen, Neustart, Zurücknehmen |
| `sidebar` | Nur in der Sidebar |

Größen `sm` (36 px), `default` (40 px), `lg` (44 px), `icon`, `icon-sm`. Pro Kartenfuß höchstens ein `default`. Lange Operationen laufen über `ActionButton`, der Pending, Erfolg und Fehler am Button selbst zeigt.

### Badge

Badges sind Zustände, keine Buttons.

| Variante | Bedeutung |
| --- | --- |
| `default` | Mint-Fläche 10 %, Mint-Text: hervorgehobene Zugehörigkeit |
| `highlight` | Mint gefüllt: „Must Know“, das höchste Signal in Listen |
| `success` | Offiziell, aktiv, verbunden |
| `warning` | Review ausstehend, ungespeichert |
| `destructive` | Fehler, abgelehnt |
| `secondary` | Neutraler Chip („Live verbunden“) |
| `outline` | Schwache Zugehörigkeit („Aufnahme“, „Grundkomponente“) |

Das Attribut `tone` färbt ein Badge mit Radar-Tinte: `tone="t"`, `tone="ct"`, `tone="smoke"` und so weiter. Es gilt für Seiten und Granatentypen und sonst nichts.

### Card

Fläche Stufe 3 mit Kante, Kopf aus Titel 3 und Beschreibung in Caption, Inhalt, optional Fuß mit Aktionen. Metrik-Karten tragen eine 3 px Mint-Leiste links und eine tabellarische Zahl in 1,9 rem.

### Alert

Eine Zeile Titel, eine bis zwei Zeilen Beschreibung. Varianten `default`, `success`, `warning`, `destructive`. Alerts erklären, was passiert ist und was man jetzt tun kann. Sie entschuldigen sich nicht.

### Feld und Input

`Field` fasst Label, Eingabe und Beschreibung zusammen. Inputs 40 px, ab 760 px Breite abwärts 44 px und 1 rem Schrift, damit sie auf dem Handy neben dem Spiel bedienbar bleiben. Fehler stehen unter dem Feld, in `--status-danger`, nicht als Rahmen allein.

### Filter (ToggleGroup)

Filter sind ToggleGroups, keine Tabs und keine Selects. Eine Gruppe pro Dimension (Typ, Seite, Sammlung). Jede Option trägt Icon, Label und, wenn sinnvoll, Zähler in Mono. Der Zustand steht in der URL, damit Links teilbar sind.

### Tabs

Nur für gleichrangige Ansichten desselben Objekts (Einstellungsbereiche, Demo-Ansichten). Variante `line`. Nie für Filter.

### Dialog und Sheet

Dialog für Bestätigungen und kurze Formulare, Sheet für Bearbeitung mit Radar-Vorschau. Titel ist ein Verb-Satz („Workshop-Map hinzufügen“), Hauptbutton wiederholt das Verb („Hinzufügen“), Abbrechen ist `outline`.

### Empty

Leerzustände sind Einladungen: Titel, ein Satz, warum hier nichts ist, und, wenn möglich, die Aktion, die das ändert. In Listen klein (0,85 rem Titel), auf Seiten normal.

### Kbd

Tastenkürzel immer in `Kbd`, Mono, 10 px, als Gruppe für Kombinationen. Im Spiel gelten feste Belegungen; die Website nennt sie nur, wenn sie wirklich gelten.

### Sidebar

Links, einklappbar, Stufe 2. Sektion mit Icon und Titel, Unterpunkte 28 px hoch. Aktive Einträge erhalten `--text-strong` und eine 2 px Mint-Leiste links. Fuß mit Serverstatus, Live-Status und Konto. Die Marke ist ein 32 px Mint-Quadrat mit Fadenkreuz.

### Topbar

56 px bis 60 px hoch, klebrig, Stufe 1 mit 92 % Deckkraft und Blur. Links Sidebar-Schalter und Breadcrumb, rechts die Live-Verbindung als Badge. Bei immersiven Ansichten (Live-Workspace) entfällt sie.

### Seitenkopf

Eine Komponente `PageHeader` für alle Seiten: optionaler Kicker in Label-Schrift, Titel, Beschreibung bis 42 rem, Aktionen rechts unten. Bibliotheksseiten verwenden `size="display"`, Arbeitsbereiche `size="default"`, Unterseiten mit Zurück-Pfeil `size="compact"`.

### Lineup-Zeile

Die wichtigste Liste von Playbook. Anatomie von links nach rechts: Granatenicon (1,25 rem, Radar-Tinte), Name (Body klein, 550), Zweitzeile „Start → Ziel“ (Micro, muted), Technik und Flugzeit (Micro, Mono), Badges (Seite mit Tinte, Must Know, Offiziell oder Aufnahme), Favoritenstern als Ghost-Icon-Button. Zeilen trennen sich mit 1 px `--line-default`, Hover hebt auf Stufe 3.

### Mapkarte

Hochkant 8:9, Mapbild als Hintergrund, Emblem oben, Mapname als kursive Plakatschrift unten. Hover zoomt das Bild um 4 % und färbt die Kante Mint. Das ist der eine Ort, an dem Playbook laut sein darf.

### Radar-Bühne

Stufe 0 mit 1 px Kante, Radarbild zentriert. Zielpunkte sind Kreise in `--status-warning` mit Mono-Zähler, Startpunkte kleinere Kreise in Mint. Routen gestrichelt in Radar-Tinte des Typs mit dunklem Halo. Level-Schalter (Nuke oben/unten) oben rechts als Mono-Buttons.

### Konsole und Logs

Stufe 0, Mono 0,75 rem, Zeilenhöhe 1,6, `--console-foreground`. Keine Syntaxfarben außer Status-Präfixen.

## Muster

### Seitenaufbau

```
┌ Topbar ───────────────────────────────────────┐
│ ☰  Maps › Mirage                   ● Live     │
├───────────────────────────────────────────────┤
│ KICKER                                         │
│ Titel                              [Aktionen] │
│ Beschreibung in Caption                        │
│                                                │
│ ┌ Karte ─────────┐ ┌ Karte ─────────┐          │
│ │                │ │                │          │
│ └────────────────┘ └────────────────┘          │
└────────────────────────────────────────────────┘
```

Bühnenseiten (Explorer, Lineup, Demo) drehen das: Bühne links oder mittig, Steuerung als schmale Spalte rechts, die bei weniger als 800 px Container-Breite unter die Bühne rutscht.

### Filtern und Suchen

Reihenfolge in der Steuerspalte: Ansicht (Ziele/Starts), Typ, Seite, Sammlung, Suche, Ergebnisliste. Jeder Filter zeigt die Treffer, die er allein hätte, damit niemand in eine leere Liste filtert.

### Aktionen und Rückmeldung

Rückmeldung gehört zur Handlung, nicht zur Seite. `ActionButton` zeigt Pending, Erfolg und Fehler direkt am Button. Seitenweite Alerts nur für Zustände, die unabhängig von einer Handlung bestehen (Verbindung verloren, ungespeicherte Änderungen).

### Bestätigen

Zerstörende Aktionen (Löschen, Neustart, Freigabe zurücknehmen) öffnen einen Dialog, dessen Hauptbutton das Verb wiederholt. Im Spiel ersetzt eine Zwischenseite mit „Abbrechen“ an erster Stelle den Dialog.

### Live-Status

Live-Daten zeigen ihren Verbindungszustand immer sichtbar (Badge in der Topbar, Punkt in der Sidebar). Ein Datum ohne Zustand ist kein Live-Datum.

## Sprache

Deutsch mit ä, ö, ü und ß, Sie-freie Du-Form, Satzschreibung. Buttons sind Verben und bleiben über den ganzen Ablauf gleich: „Speichern“ führt zu „Gespeichert“, nicht zu „Erfolg“. Fehlermeldungen sagen, was passiert ist und was als Nächstes hilft: „Steam-Anmeldung abgebrochen oder abgelaufen. Bitte erneut anmelden.“ Leerzustände laden ein: „Merke dir Lineups über den Stern. Deine Favoriten findest du anschließend hier.“

Feste Begriffe: Map, Lineup, Aufnahme, Review, Offiziell, Must Know, Favoriten, Strat, Team, Demo, Live, Prematch, Server, Trainings-HUD. Englische Spielbegriffe (Smoke, Flash, Jumpthrow, Spawn) bleiben englisch, weil Spieler sie so verwenden.

## Qualitätsschwelle

Jede neue Ansicht erfüllt vor dem Merge:

- Funktioniert ab 320 px Breite, Steuerspalten brechen über Container-Queries um.
- Jede interaktive Fläche hat sichtbaren Fokus und mindestens 40 px Zielgröße auf Touch.
- Kontrast mindestens 4,5:1 für Text, 3:1 für Icons und Kanten.
- Farbe ist nie der einzige Träger (Icon oder Label dazu).
- `prefers-reduced-motion` wird respektiert.
- Live-Daten tragen einen Verbindungszustand.
- Texte entsprechen der Sprache oben, keine Ersatzschreibweisen für Umlaute.

## Anwendung im Code

- Tokens: `client/src/styles/tokens.css`, importiert in `index.css`. Neue Farben oder Größen entstehen dort, nicht in Komponenten.
- Domänenfarben im TSX: `var(--nade-smoke)` oder Utility `text-nade-smoke`. Keine Hex-Werte in Komponenten.
- Seitenköpfe: `PageHeader` aus `components/page-header.tsx`.
- Badges mit Radar-Tinte: `<Badge tone="ct">CT</Badge>`, `<Badge variant="highlight">Must Know</Badge>`.
- Eigene CSS-Klassen in `index.css` verwenden `var(--type-*)`, `var(--motion-*)`, `var(--surface-*)`; keine freien Rem- oder Hex-Werte für Dinge, die ein Token haben.
- Panorama-Werte für das Ingame-Panel sind im Panel-Dokument abgeleitet; Panorama kennt keine CSS-Variablen, dort stehen die Hex-Werte mit Verweis auf den Token.
