# Planentwurf für Team-Management und Strats

Stand: 5. Oktober 2026. Die erste Web-Version ist umgesetzt. Dieses Dokument bewahrt die gemeinsame Planungsgrundlage und die Untersuchung von `cs-playbook`; die Bedienung steht in [README.md](../README.md#team-management-und-strats).

Die Implementierung verwendet `shared/authorization.ts` als Rollenkatalog, `src/workspace-routes.ts` für Team- und Strat-Aktionen und `src/workspace-store.ts` für die atomaren MongoDB-Schreibvorgänge. Einladungen gelten sieben Tage. Live-Ansichten erhalten den aktuellen Teamstand sofort über die gemeinsame WebSocket-Verbindung. Die Bibliothek speichert den letzten veröffentlichten Stand; das Team hält zusätzlich seine aktive Fassung. Archivieren ändert diese aktive Fassung nicht. Nade-Verknüpfungen verwenden die vorhandenen kurzen IDs und zeigen bei gelöschten Nades einen allgemeinen Hinweis. Ein eigener Medien- oder Versionshistorienbereich gehört nicht zu diesem Stand.

Das Ziel sind zwei eigene Sidebar-Bereiche `Team-Management` und `Strats` neben der Nade-Bibliothek. Strats enthält die Strategiebibliothek, persönliche Aufgaben, Teamübersicht und Live-Ansicht. Die erste Umsetzung läuft vollständig im Web. Eine gemeinsame Benutzerverwaltung mit zentralem RBAC verbindet Plattform-, Server- und Teamrechte; der Entwurf dazu steht in [rbac-plan.md](rbac-plan.md).

## Bereits vereinbart

- Mehrere unabhängige Teams sind vorgesehen. Ein Spieler kann mehreren Teams angehören.
- Taktiken enthalten Rollen oder Spielerplätze. Die tatsächlichen Spieler werden je Taktik zugewiesen.
- Eigene Aufgaben sind die Standardansicht. Eine zusätzliche Teamübersicht zeigt bei Bedarf auch die anderen Aufgaben.
- Die erste Web-Version enthält eine gemeinsame aktive Taktik je Team. Die Teamleitung wählt sie aus, die geöffneten Live-Ansichten wechseln automatisch.
- Nur Owner und Captains erstellen und bearbeiten Taktiken. Gewöhnliche Mitglieder reichen keine eigenen Entwürfe ein.
- `Team-Management` und `Strats` sind getrennte Kategorien in der Sidebar.
- Nach Steam-Anmeldung darf ein Benutzer frei ein Team gründen. Der Beitritt erfolgt über einen Einladungslink.
- Ausschließlich der Owner verwaltet Mitglieder, Einladungen und Teamrechte.
- Plattform-, Server- und Teamrechte erhalten ein gemeinsames RBAC und eine gemeinsame Benutzerverwaltung.
- Das RBAC verwendet feste, zentral gepflegte Rollen und eine sichtbare Rechtematrix. Frei konfigurierbare Rollen sind für die erste Version nicht vorgesehen.
- Es werden keine Benutzer, Teams, Strats oder Medien aus dem alten Projekt importiert.
- Die Nade-Bibliothek ist der bestehende Nachbarbereich.
- Zunächst planen wir gemeinsam die Webintegration. Ingame-Funktionen werden später betrachtet.

Die Produktentscheidungen oben sind abgestimmt und bilden den Umfang der ersten Implementierung. Die folgenden Abschnitte enthalten die ursprünglichen Begründungen und Erweiterungsmöglichkeiten.

## Empfohlenes Verhalten

Die Seitenleiste führt `Team-Management` und `Strats` als gleichrangige Kategorien. Die bestehende Kategorie `Maps` mit der Nade-Bibliothek bleibt daneben stehen. Für die zentrale Benutzerverwaltung ist zusätzlich `Verwaltung` vorgesehen; sie gehört fachlich nicht mehr unter `Server`.

| Sidebar-Kategorie | Inhalte |
| --- | --- |
| Maps | Bestehende Nade-Bibliothek und Lineup-Anleitungen |
| Team-Management | Meine Teams, Team erstellen, Mitglieder; Einladungen und Teamrechte nur für den Owner |
| Strats | Alle zugänglichen Strategien, Filter nach Team, Map und Seite, Detailansicht mit eigenen Aufgaben und Teamübersicht, Live-Ansicht |
| Server | Bestehende Serverfunktionen entsprechend den Serverrechten |
| Verwaltung | Zentrale Benutzer, Rollenzuweisungen, Rechtematrix und Änderungsverlauf für Plattform-Admins |

`Alle Strategien` zeigt ausschließlich Inhalte aus den eigenen Teams. Mitglieder sehen veröffentlichte Fassungen; Owner und Captains zusätzlich die Entwürfe ihrer Teams. Jede Strat zeigt ihr zugehöriges Team. Ein Teamfilter erleichtert das Lesen bei mehreren Mitgliedschaften.

Die Live-Ansicht benötigt immer ein konkretes Team. Ein Wechsel des Teamfilters ändert keine Mitgliedschaft und aktiviert keine Strat. Bei mehreren offenen Tabs behält jeder Tab sein Team aus der URL. Ohne Mitgliedschaft bietet `Strats` einen Hinweis auf Teamgründung oder Einladung. Bestehende Map- und Lineup-Links bleiben erreichbar.

Eine Taktik enthält Name, Map, T- oder CT-Seite, eine kurze gemeinsame Erklärung und fünf frei benennbare Spielerplätze. Jeder Platz hat eine stabile ID, einen Namen wie `Entry`, `Support A` oder `AWP` und eine geordnete Liste von Schritten. Doppelte Rollentypen sind erlaubt. Änderungen am Namen verändern keine Zuordnungen.

Die Besetzung verbindet diese Plätze mit Mitgliedern des jeweiligen Teams. Ein Team darf mehr als fünf Mitglieder haben. Ersatzspieler und Coaches gehören zur Mitgliederliste, ohne automatisch einen aktiven Platz zu besetzen. Ein Platz hat höchstens einen Spieler; ein Spieler besetzt innerhalb einer Taktik höchstens einen Platz. Diese Beschränkung gilt nicht über verschiedene Taktiken oder Teams hinweg.

Ein Schritt enthält eine konkrete Anweisung, optional einen Callout, einen Auslöser oder Zeitpunkt und Links zu passenden Nades. Timing beginnt als lesbarer Text, beispielsweise `Auf den Go-Call` oder `Nach der CT-Smoke`. Ein synchron laufender Timer ist dafür nicht nötig.

Beispiel für eine Mirage-Taktik:

| Platz | Besetzung | Schritt | Zeitpunkt |
| --- | --- | --- | --- |
| Support A | Sebastian | CT-Smoke werfen, verknüpftes Lineup öffnen | Auf Go |
| Entry | Spieler B | Aus der Rampe gehen und unter Balkon prüfen | Sobald die Smoke steht |
| Support B | Ersatzspieler C | Über den Palast flashen | Auf den Entry-Call |

Sebastian sieht in `Meine Aufgaben` die gemeinsame Erklärung und die Schritte von Support A. Über `Teamübersicht` kann er die anderen Aufgaben ansehen. Ein Spieler ohne Besetzung erhält einen klaren Hinweis und kann die Teamübersicht öffnen. Es werden ihm keine Aufgaben von Platz 1 als Ersatz angezeigt.

## Teamverwaltung und Rechte

Ein angemeldeter Steam-Benutzer erstellt ein Team und wird dessen Owner. Ausschließlich der Owner erstellt und widerruft Einladungslinks. Eingeladene Spieler bestätigen den Beitritt nach ihrer Anmeldung und erhalten zunächst die Rolle Mitglied. Vorgeschlagen sind zeitlich begrenzte Links; Rollen stehen nicht frei im Einladungstoken zur Auswahl. Ein Teamwechsel im Browser ändert keine Mitgliedschaften.

| Teamrecht | Möglichkeiten |
| --- | --- |
| Owner | Team verwalten, einladen, Mitglieder und Teamrechte verwalten, Eigentum übertragen, Taktiken erstellen, bearbeiten, veröffentlichen und aktivieren |
| Captain | Taktiken erstellen, bearbeiten und veröffentlichen, Besetzungen ändern und veröffentlichte Taktiken aktivieren |
| Mitglied | Veröffentlichte Taktiken, eigene Aufgaben und die Teamübersicht lesen, der Live-Ansicht folgen, Team verlassen |

Teamrechte werden über das zentrale RBAC pro Team zugeordnet. Derselbe Spieler kann in Team A Captain und in Team B Mitglied sein. Ein aktives Team hat genau einen Owner. Er kann das Team erst verlassen, nachdem er das Eigentum an ein Mitglied übertragen hat. Entfernte Mitglieder verlieren bei folgenden Anfragen ihren Teamzugriff. Bestehende Besetzungen mit ausgeschiedenen Spielern erscheinen als unbesetzt. Das Detailmodell einschließlich atomarer Owner-Übertragung steht im [RBAC-Entwurf](rbac-plan.md).

Plattformrechte, Teamrechte und taktische Rollen bleiben getrennt. Ein Captain erhält dadurch weder Serverrechte noch Nade-Freigaberechte. Als Vorschlag erhalten Plattform-Admins auch keinen automatischen Einblick in private Taktiken fremder Teams. Eine spätere Support-Funktion wäre eine eigene Entscheidung.

## Taktiken erstellen und verwenden

Vorgeschlagen sind zunächst Entwurf, veröffentlicht und archiviert. Ausschließlich Owner und Captains erstellen und bearbeiten Taktiken. Mitglieder lesen veröffentlichte Fassungen. Ein Einreichungs- oder Review-Ablauf für Taktikvorschläge ist nicht vorgesehen. Die Veröffentlichung ist eine Entscheidung innerhalb des Teams und hat keine Verbindung zu `Offiziell` oder `Must Know` bei Nades.

Der Editor bietet zuerst Stammdaten, fünf Rollen mit Besetzung und deren Schritte. Schritte lassen sich hinzufügen, umsortieren und entfernen. Taktiken lassen sich duplizieren. Ein sichtbarer Speicherbutton und eine Revisionsprüfung verhindern unbemerkte Überschreibungen durch zwei Bearbeiter.

Die Spieleransicht legt den Schwerpunkt auf gut lesbare Aufgaben und die dazugehörigen Lineups. Eine gemeinsame Erklärung bleibt für alle sichtbar. Eine zusätzliche Teamübersicht zeigt alle Rollen und ihre Aufgaben. Separate Bilder, ein Zeichenbrett, komplexe Abläufe und ein umfangreiches Mediensystem gehören nicht zum vorgeschlagenen ersten Umfang.

Ein Owner oder Captain aktiviert genau eine veröffentlichte Taktik je Team. Alle geöffneten Live-Seiten dieses Teams zeigen automatisch die jeweils eigenen Aufgaben. Andere Teams bleiben davon unabhängig. Der automatische Wechsel betrifft die Live-Ansicht; ein geöffneter Editor wird nicht umgeleitet.

Die Aktivierung hält die veröffentlichte Fassung und Besetzung fest. Spätere Entwürfe verändern den laufenden Ablauf erst beim bewussten erneuten Aktivieren. Der Server prüft weiterhin die aktuelle Mitgliedschaft. Beim Entfernen eines besetzten Mitglieds muss die Teamleitung die betroffene Besetzung korrigieren.

Die aktive Taktik wird über die gemeinsame WebSocket-Verbindung unter `/api/live` aktualisiert. Nach einer Wiederverbindung erhält die Ansicht den aktuellen Stand. Die Seite zeigt Verbindungsprobleme und unterscheidet einen gespeicherten Stand von einer verbundenen Live-Ansicht. Eine gemeinsame Schrittschaltung ist eine gesonderte spätere Funktion.

## Verbindung zu Nades

Taktikschritte referenzieren vorhandene Lineups. Sie besitzen keine Kopie der Wurfdaten, Medien oder Freigaben. Zur Auswahl dient die vorhandene Bibliothek, auf die Map der Taktik begrenzt. Auch noch nicht offizielle Lineups dürfen ausgewählt werden, ihr Status bleibt sichtbar.

Die Referenz enthält die bestehende Lineup-ID. Owner, Map und interner Name können zur Prüfung und Zuordnung mitgeführt werden. Ein kurzer gespeicherter Anzeigename dient nur als verständlicher Hinweis, wenn ein Lineup später gelöscht wurde. Eine fehlende Referenz wird niemals stillschweigend durch ein anderes Lineup ersetzt.

Neue Anzeigenamen oder korrigierte Radarpositionen erscheinen aus der Bibliothek. Wird eine Freigabe zurückgenommen oder das Lineup gelöscht, zeigt der Schritt das entsprechend an. Die Taktikanweisung bleibt erhalten. Teamrechte erlauben keine Änderung an einer verknüpften Nade.

Die bisherigen Favoriten bleiben an Steam-ID sowie Owner, Map und internem Namen gebunden. Die bestehenden Regeln zu Eigentum, Review, Freigabe und Radarpositionen gelten unverändert. Für eine spätere taktische Kartenansicht lassen sich die vorhandenen Radargrundlagen verwenden.

## Einbau in das bestehende Projekt

Die aktuelle Anwendung nutzt React und Vite im Frontend, Express im Backend und MongoDB. Steam-Identität und Sitzungen sind bereits vorhanden. Die aktuelle Anwendung ist in [README.md](../README.md) beschrieben; die Abhängigkeiten stehen in [package.json](../admin-panel/package.json).

Empfohlen sind neue Module für Autorisierung, Teams und Strats innerhalb von `admin-panel`. Das Autorisierungsmodul entscheidet über Plattform-, Server-, Team- und Ressourcenrechte. Teams verwaltet Mitgliedschaften und Einladungen; Strats verwaltet Aufgaben, Besetzungen und Veröffentlichungen. Die Seiten verwenden deren Interface. Eine zweite Anwendung und ein Wechsel zu Next.js oder Convex sind dafür nicht vorgesehen.

| Bereich | Vorschlag |
| --- | --- |
| Gemeinsame Typen und Regeln | `admin-panel/shared/authorization/`, `teams.ts` und `strats.ts` |
| Backend | Eigene Verzeichnisse `admin-panel/src/authorization/`, `teams/` und `strats/` mit Express-Routern und Zugriff auf MongoDB |
| Frontend | Eigene Verzeichnisse für Team- und Taktikseiten, Nutzung des vorhandenen Layouts und der vorhandenen UI-Elemente |
| Webrouten | Teamverwaltung unter `/teams` und `/teams/:teamId`; Bibliothek unter `/strats`, Details unter `/strats/:stratId`, Live-Ansicht unter `/strats/live/:teamId`; zentrale Verwaltung unter `/admin/users` und `/admin/roles` |
| Daten | Teams mit verbindlichen Mitgliedschaften, Einladungen und Strats; zentrale Rollenzuweisungen ohne zweite Kopie der Teamrollen; veröffentlichte Fassungen und aktiver Stand separat vom bearbeiteten Entwurf |
| Identität | Bestehende Steam64-ID, keine neue Anmeldung und kein einzelnes `teamId` am Benutzer |

Die Datenhaltung verwendet eine eindeutige Mitgliedschaft pro Team und Steam-ID. Taktiken gehören genau einem Team. Schritte und Plätze besitzen stabile IDs; die Reihenfolge wird ausdrücklich gespeichert. Teamfremde Mitglieder, Taktiken und Rollen können nicht durch eingereichte IDs zugewiesen werden.

Zwei Stellen erfordern beim Einbau besondere Aufmerksamkeit:

- [app.ts](../admin-panel/src/app.ts) hat nach der Anmeldung eine globale Allowlist mit einem allgemeinen Admin-Zugang. Diese wird schrittweise durch Aktionsprüfungen des zentralen RBAC ersetzt. Alle Router verwenden dieselbe Autorisierung; die neuen Bereiche erhalten keine unabhängige zweite Rechteverwaltung. Ein allgemeiner Admin-Bypass darf private Teamrechte und Erstellerregeln nicht umgehen.
- [main.tsx](../admin-panel/client/src/main.tsx) lädt Benutzer und Bereiche derzeit gemeinsam über `/api/control`. Neue Teamseiten sollen über `/api/auth/me` und eigene Teamabfragen laden. Ein unerreichbarer CS2-Server darf den Teamzugang nicht verhindern. Navigation, Login-Rücksprung, Seitentitel und Fehlerzustände werden für die neuen Routen ergänzt.

Die vorhandenen [Steam-Sitzungen](../admin-panel/src/auth.ts), [Benutzer in MongoDB](../admin-panel/src/store.ts), [Navigation](../admin-panel/client/src/components/app-sidebar.tsx), [Lineup-Links](../admin-panel/client/src/lib/lineups.ts) und [Kartenmodelle](../admin-panel/client/src/lib/maps.ts) bilden die Anschlüsse. Der Spielserver erhält aus dem RBAC abgeleitete Serverberechtigungen. Teammitgliedschaften und Strats werden nicht an das Plugin übertragen.

## Sinnvolle Umsetzungsschritte

1. **RBAC als Grundlage einführen.** Bestehende Rechte erfassen, zentral prüfen und die Benutzer dieses Projekts umstellen. Website und Server-Plugin erhalten abgestimmte Regeln. Benutzerverwaltung und Rechtematrix zusammenführen.
2. **Team-Management nutzbar machen.** Team erstellen, einladen, beitreten, zwischen Teams wechseln und Mitglieder als Owner verwalten. Teamrechte auf jeder Anfrage zentral prüfen.
3. **Strats nutzbar machen.** Eigene Sidebar-Kategorie und Bibliothek einführen, Rollen und Spieler zuweisen, Schritte schreiben, Nades verlinken und veröffentlichen. Ein Mitglied öffnet die Strat und liest seine Aufgaben oder die Teamübersicht.
4. **Den gemeinsamen Ablauf ergänzen.** Eine veröffentlichte Strat pro Team aktivieren und automatisch in mehreren Browsern anzeigen. Dieser Schritt gehört zur ersten Web-Version.
5. **Mit einem echten Team prüfen.** Eine Strat gemeinsam eingeben, einen Ersatzspieler zuweisen und die Ansichten mit mehreren Konten vergleichen.

Der feste Rollenkatalog und die Umstellung der bestehenden Serverrechte sind im [RBAC-Entwurf](rbac-plan.md) konkretisiert. Er beschreibt Rollen, Geltungsbereiche, Vergaberechte und die Reihenfolge der Umstellung. Der Import aus dem alten Projekt entfällt vollständig.

## Woran wir die erste Version prüfen

- Ein Spieler ist in zwei Teams Mitglied und erhält in beiden die richtige Besetzung und die jeweiligen Rechte.
- `Team-Management` und `Strats` sind getrennte Sidebar-Kategorien. Die Strategiebibliothek enthält nur zugängliche Strats; die Live-Ansicht bleibt an das in der URL gewählte Team gebunden.
- Nur der Owner kann Einladungen, Mitglieder und Teamrollen verwalten. Ein Captain kann Strats bearbeiten, ohne diese Verwaltungsrechte zu erhalten.
- Die zentrale Benutzerverwaltung, die Teamverwaltung und der Spielserver erhalten ihre Rechte aus demselben RBAC. Eine Teamrolle erzeugt keine Serverrechte.
- Nur Owner und Captains können Taktiken erstellen, bearbeiten, veröffentlichen oder aktivieren. Mitglieder erhalten auch bei direkten schreibenden Anfragen keine Bearbeitungsrechte.
- Anfragen für fremde Team-IDs geben keine privaten Taktiken zurück und erlauben keine Änderungen. Das gilt auch für Einladungen und die Live-Ansicht.
- Ein Ersatzspieler übernimmt einen Platz, ohne dass Schritte neu geschrieben werden. Fehlende oder doppelte Besetzungen sind erkennbar und werden beim Aktivieren geprüft.
- Zwei gleichzeitige Bearbeitungen überschreiben sich nicht unbemerkt. Entwurfsänderungen verändern keine bereits veröffentlichte oder aktive Fassung.
- Ein entferntes Mitglied kann keine weiteren Teamdaten abrufen.
- Ein verknüpftes Lineup lässt sich öffnen. Eine Löschung oder zurückgenommene Freigabe erzeugt einen verständlichen Zustand und beschädigt keine Taktik.
- Eine Aktivierung wechselt nur die Live-Ansichten des zugehörigen Teams. Nach einem Verbindungsabbruch wird der aktuelle Stand neu geladen.
- Teams und Taktiken funktionieren in der bestehenden lokalen Umgebung ohne laufenden CS2-Server. Die vorhandenen Nade- und Anmeldetests bleiben erfolgreich.

Die Umsetzung erhält Tests an den neuen Modul-Interfaces und über die authentifizierten Routen. Browserprüfungen decken Einladung nach Steam-Login, Teamwechsel, Bearbeitung, eigene Aufgaben, Teamübersicht und den Live-Wechsel ab. Für diesen Dokumententwurf wurden keine Anwendungstests ausgeführt.

## Später zu entscheiden

Taktische Zeichnungen, zusätzliche Bilder, Eco-Filter, öffentliche Vorlagen, gemeinsame Schrittschaltung und Anbindung an HUD oder MatchZy können folgen. Die erste Webintegration benötigt diese Erweiterungen nicht. Ein Datenimport aus `cs-playbook` ist ausdrücklich ausgeschlossen.


## Recherche zum alten Projekt

Untersucht wurde das private Repository `realS3BI/cs-playbook`, Branch `master`, Commit `62bd2945a1205a87e0f49537d3179170beee2d4b`, am 5. Oktober 2026. Die Aussagen beruhen auf dem Quellcode dieses Stands. Die alte Anwendung und ihre produktive Convex-Datenbank wurden nicht ausgeführt oder ausgelesen.

### Persönliche Ansicht und Spielrollen

Die README verspricht Rollen wie Entry, Lurker, IGL, AWPer und Support. Das tatsächliche Modell speichert jedoch fünf feste Aufgabenlisten `player1` bis `player5`. Ein Benutzer hat eine `playerNumber` zwischen 0 und 5. Seine Verwaltungsrolle `superadmin`, `leader` oder `player` ist ein anderes Feld. Frei definierbare Spielrollen oder eine unterschiedliche Besetzung je Taktik sind darin nicht vorgesehen. [README](https://github.com/realS3BI/cs-playbook/blob/62bd2945a1205a87e0f49537d3179170beee2d4b/README.md#L9-L16), [Benutzerschema](https://github.com/realS3BI/cs-playbook/blob/62bd2945a1205a87e0f49537d3179170beee2d4b/convex/schemas/users.ts#L6-L31), [Taktikschema](https://github.com/realS3BI/cs-playbook/blob/62bd2945a1205a87e0f49537d3179170beee2d4b/convex/schemas/strats.ts#L27-L49).

Die Seite `/live` ermittelt Team und Spielernummer über den angemeldeten Benutzer und öffnet zunächst dessen Tab. `canViewOtherPlayers` steht fest auf `true`. Jeder Spieler kann damit alle fünf Aufgabenlisten ansehen. Auch `ActiveStrat` zeigt alle fünf Tabs. Der vorhandene Nutzen ist die persönliche Vorauswahl; eine Beschränkung auf ausschließlich eigene Schritte gibt es im untersuchten Stand nicht. Die alte Dokumentation beschreibt dagegen noch einen abweichenden Ablauf mit Eingabe von Team-ID und Spielernummer. [Live-Ansicht](https://github.com/realS3BI/cs-playbook/blob/62bd2945a1205a87e0f49537d3179170beee2d4b/app/live/page.tsx#L19-L36), [Tabauswahl](https://github.com/realS3BI/cs-playbook/blob/62bd2945a1205a87e0f49537d3179170beee2d4b/app/live/page.tsx#L120-L195), [Dashboardansicht](https://github.com/realS3BI/cs-playbook/blob/62bd2945a1205a87e0f49537d3179170beee2d4b/components/active-strat.tsx#L42-L86), [abweichende Beschreibung](https://github.com/realS3BI/cs-playbook/blob/62bd2945a1205a87e0f49537d3179170beee2d4b/docs/LIVE_VIEW.md#L11-L32).

Die Aufgaben erscheinen als geordnete Karten mit Beschreibung, optionaler Position, Timing und optionalem Bild. Timing ist freier Text, etwa eine Uhrzeit oder "nach Flash". Einen laufenden Rundentimer oder eine automatische Schrittsteuerung bildet diese Ansicht nicht ab. [Aufgabendarstellung](https://github.com/realS3BI/cs-playbook/blob/62bd2945a1205a87e0f49537d3179170beee2d4b/app/live/page.tsx#L219-L267), [Timing-Eingabe](https://github.com/realS3BI/cs-playbook/blob/62bd2945a1205a87e0f49537d3179170beee2d4b/app/player/submit/strat/step3/page.tsx#L295-L305).

### Teamverwaltung und Taktikablauf

| Bereich | Im Quellcode vorhanden | Grenze für die Übernahme |
| --- | --- | --- |
| Mitgliedschaft | Ein `teamId` und eine Spielernummer direkt am Benutzer | Keine eigenständigen Mitgliedschaften für mehrere Teams. |
| Teamgründung | Team mit Status `pending`; Genehmigung setzt den Ersteller als `leader` ins Team | Die Freigabe durch Plattform-Admins ist eine alte Produktentscheidung. |
| Beitritt | Anfrage mit Team-ID und gewünschter Spielernummer; Annahme oder Ablehnung | Kein Einladungslinksystem. Die Annahme überschreibt die Teamzuordnung des Benutzers. |
| Mitgliederverwaltung | Spielernummer ändern und Mitglied entfernen | Die Mutationen prüfen keine eindeutige Belegung der fünf Nummern. |
| Taktiken | Teambezogene Datensätze mit Map, Seite, Beschreibung und Aufgaben | Keine unabhängige Besetzung pro Taktik oder Trainingseinheit. |

Quellen zur Tabelle: [Benutzerschema](https://github.com/realS3BI/cs-playbook/blob/62bd2945a1205a87e0f49537d3179170beee2d4b/convex/schemas/users.ts#L22-L31), [Teamgründung und Freigabe](https://github.com/realS3BI/cs-playbook/blob/62bd2945a1205a87e0f49537d3179170beee2d4b/convex/teams.ts#L30-L99), [Beitritt](https://github.com/realS3BI/cs-playbook/blob/62bd2945a1205a87e0f49537d3179170beee2d4b/convex/teamJoinRequests.ts#L50-L103), [Mitgliederverwaltung](https://github.com/realS3BI/cs-playbook/blob/62bd2945a1205a87e0f49537d3179170beee2d4b/components/team-members-manager.tsx#L48-L78), [Nummernzuweisung](https://github.com/realS3BI/cs-playbook/blob/62bd2945a1205a87e0f49537d3179170beee2d4b/convex/users.ts#L64-L72), [Taktikschema](https://github.com/realS3BI/cs-playbook/blob/62bd2945a1205a87e0f49537d3179170beee2d4b/convex/schemas/strats.ts#L27-L49).

Der Editor hat drei Stationen: Grunddaten einschließlich Team- und Gegner-Eco, bis zu drei Übersichtsbilder, anschließend Aufgaben je Spieler. Entwürfe zwischen den Stationen liegen im `sessionStorage`. Erst beim Einreichen legt `addStrat` einen Datensatz mit Status `draft` an. Die Aufgabenfelder im Editor umfassen Beschreibung, Position und Timing. [Grunddaten](https://github.com/realS3BI/cs-playbook/blob/62bd2945a1205a87e0f49537d3179170beee2d4b/app/player/submit/strat/step1/page.tsx#L63-L82), [Bilder](https://github.com/realS3BI/cs-playbook/blob/62bd2945a1205a87e0f49537d3179170beee2d4b/app/player/submit/strat/step2/page.tsx#L85-L93), [Einreichen](https://github.com/realS3BI/cs-playbook/blob/62bd2945a1205a87e0f49537d3179170beee2d4b/app/player/submit/strat/step3/page.tsx#L90-L134), [Aufgabenmodell des Editors](https://github.com/realS3BI/cs-playbook/blob/62bd2945a1205a87e0f49537d3179170beee2d4b/app/player/submit/strat/step3/page.tsx#L18-L30).

Freigeben und Aktivieren sind getrennte Vorgänge. `approveStrat` setzt `approved`; die Bibliothek fragt nur freigegebene Taktiken ab. "Aktivieren" schreibt eine einzige `activeStratId` ins Team. Die Live-Seite abonniert `getActiveStrat` über Convex und erhält den vollständigen Taktikdatensatz. Dieser Ablauf ist im Code verbunden. Es gibt dabei keinen separaten Sitzungsdatensatz, keinen eingefrorenen Veröffentlichungsstand und keine ausgewählte aktuelle Schrittnummer. `setActiveStrat` selbst prüft weder den Freigabestatus noch die Zugehörigkeit der Taktik zum Team. [Freigabe und Aktivierung](https://github.com/realS3BI/cs-playbook/blob/62bd2945a1205a87e0f49537d3179170beee2d4b/convex/strats.ts#L109-L141), [Bibliothek und aktiver Datensatz](https://github.com/realS3BI/cs-playbook/blob/62bd2945a1205a87e0f49537d3179170beee2d4b/convex/strats.ts#L6-L27), [Aktivierungsaufruf](https://github.com/realS3BI/cs-playbook/blob/62bd2945a1205a87e0f49537d3179170beee2d4b/components/strat-list.tsx#L65-L67).

### Teile, die neu umgesetzt werden müssen

Die geprüften Convex-Funktionen lesen und ändern Teams, Mitglieder und Taktiken anhand übergebener IDs ohne Prüfung der authentifizierten Identität oder Teammitgliedschaft. Auch `reviewedBy` kommt vom Aufrufer. Der Client verwendet einen gewöhnlichen `ConvexProvider` neben NextAuth. Die vorhandenen Rollenprüfungen in Seiten ersetzen deshalb keine abgesicherte Team-API. Diese Berechtigungsumsetzung sollte nicht übernommen werden. [Teamfunktionen](https://github.com/realS3BI/cs-playbook/blob/62bd2945a1205a87e0f49537d3179170beee2d4b/convex/teams.ts#L6-L78), [Taktikfunktionen](https://github.com/realS3BI/cs-playbook/blob/62bd2945a1205a87e0f49537d3179170beee2d4b/convex/strats.ts#L78-L141), [Provider](https://github.com/realS3BI/cs-playbook/blob/62bd2945a1205a87e0f49537d3179170beee2d4b/lib/providers.tsx#L8-L15).

Die Verknüpfung mit Nades ist nur teilweise vorbereitet. Das Schema erlaubt `nadeId` plus Timing pro Schritt, der Schritt-Editor bietet dafür aber keine Eingabe. `ActiveStrat` zeigt lediglich "Nade 1" und Timing; `/live` stellt diese Referenzen nicht dar. Für das neue Projekt sollte eine Aufgabe gezielt einen Eintrag aus der vorhandenen Nades-Bibliothek referenzieren und dessen Detailansicht öffnen können. [Nade-Felder](https://github.com/realS3BI/cs-playbook/blob/62bd2945a1205a87e0f49537d3179170beee2d4b/convex/schemas/strats.ts#L5-L16), [bisherige Ausgabe](https://github.com/realS3BI/cs-playbook/blob/62bd2945a1205a87e0f49537d3179170beee2d4b/components/active-strat.tsx#L120-L138), [Editor](https://github.com/realS3BI/cs-playbook/blob/62bd2945a1205a87e0f49537d3179170beee2d4b/app/player/submit/strat/step3/page.tsx#L264-L309).

Auch die Bildfelder sind uneinheitlich: Der Editor speichert `images[]`, die aktive Ansicht und die Live-Seite lesen `imageUrl`. Das ist ein konkreter Grund, den alten Ablauf als fachliche Vorlage zu verwenden und die Komponenten nicht unverändert zu kopieren. [Speichern](https://github.com/realS3BI/cs-playbook/blob/62bd2945a1205a87e0f49537d3179170beee2d4b/app/player/submit/strat/step3/page.tsx#L104-L126), [Lesen](https://github.com/realS3BI/cs-playbook/blob/62bd2945a1205a87e0f49537d3179170beee2d4b/app/live/page.tsx#L163-L174).

### Übernahme der bisherigen Ideen

Empfehlung für den neuen Entwurf:

- Die persönliche Aufgabenansicht, geordnete Schritte, Positionen und freie Timing-Angaben übernehmen.
- Fünf stabile Taktikplätze behalten, ihre Bezeichnungen und die zugeordneten Teammitglieder getrennt speichern. So kann ein Ersatzspieler denselben Ablauf übernehmen.
- Teamrechte, taktische Spielrollen und die bestehenden Plattformrechte ausdrücklich trennen.
- Die Teamübersicht und die persönliche Ansicht aus denselben Aufgaben ableiten. Die zusätzliche Teamansicht wurde für den neuen Entwurf bestätigt.
- Erstellen, teaminternes Veröffentlichen und eine gemeinsam aktive Taktik getrennt planen. Der alte `draft`-Status bezeichnet bereits einen eingereichten Vorschlag, keinen zuverlässig gespeicherten privaten Arbeitsstand.

Der alte Quellcode dient als Funktionsvorlage. Die alte Datenbank und ihre Medien werden nicht übernommen.
