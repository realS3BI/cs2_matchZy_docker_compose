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
| Stehende und duckende Bots platzieren und entfernen | Playbook | MatchZy in Practice |
| Letzten Wurf wiederholen, `.rethrow` / `.rt` | Playbook | MatchZy in Practice |
| Wurfhistorie, Colored Smokes | Noch nicht implementiert, ausgeblendet bzw. gesperrt | MatchZy in Practice |
| Ready, Matchstart, Pausen, Knife, Veto, Demos, Statistiken | Nicht verfügbar | MatchZy |

Playbook erzeugt Rethrow-Projektile über die CounterStrikeSharp-Entity-API, entsprechend [MatchZys Fallback zur Projektilerzeugung](https://github.com/shobhit-pathak/MatchZy/blob/dev/GrenadeThrownData.cs). Der Nades-Modus ruft keine fehlenden MatchZy-Werkzeuge auf. Im Scrim-Modus bleibt MatchZy als externes Plugin installiert.

## Befehle im Nades-Modus

`.rethrow`, `.rt` und `css_rethrow` wiederholen die eigene zuletzt geworfene Granate. Im `.nades`-Panel liegt dieselbe Aktion unter Trainingswerkzeuge → Letzten Wurf wiederholen. Abwurfposition, Geschwindigkeit, Rotation und Granatentyp werden vom echten Projektil gespeichert, einschließlich der Unterscheidung zwischen Molotov und CT-Brandgranate. Der Spieler bleibt an seiner aktuellen Position und kann die Wirkung von dort beobachten.

Ohne vorherigen Wurf erscheint ein Hinweis. Disconnect und Mapwechsel löschen den gespeicherten Wurf. Wiederholungen ersetzen ihn nicht und zählen nicht als neue Aufnahme oder Flugzeitmessung. Im eigenständigen Nades-Modus haben die erzeugten Projektile keinen Spieler als Werfer, damit ihre Explosion keine parallele Aufnahme abschließt. Ihr Schaden wird daher keinem Spieler zugeordnet.

Der Nades-Modus startet direkt eine 60-Minuten-Trainingsrunde. Automatisches Online-/Offline-Warmup, Freezezeit, Map-Zeitlimit und Rundenlimit sind ausgeschaltet. Ignorierte Siegbedingungen verhindern automatische Rundenenden auch nach Ablauf der Rundenzeit. Ein später beitretender Spieler löst keinen Neustart für die anderen aus. Beim Mapstart werden die Einstellungen auch während der Server-Hibernation angewendet und nach dem Laden der Map-Konfiguration erneut gesetzt. Bei Rundenstart und Spawn wird ein noch aktives Warmup beendet.

Die automatische Teamzuweisung erfolgt im Nades-Modus nach einer Sekunde statt nach 15 Sekunden. Das Plugin setzt `mp_force_pick_time 1` automatisch bei Serverstart, Mapwechsel und Rundenstart, auch nach einem Wechsel zurück in den Nades-Modus. Die Einstellung verkürzt die Wartezeit vor dem Teambeitritt; die Ursache einer zuvor verschwindenden Teamauswahl ist damit noch nicht behoben.

Beide Teams spawnen mit SSG 08, ihrer Standardpistole, Messer und allen fünf Granatentypen. CT erhalten eine Brandgranate, T einen Molotov. Ohne God Mode bleibt normaler Schaden messbar. CS2s `buddha 1` mit `buddha_reset_hp 100` verhindert den Tod und setzt Spieler beim tödlichen Treffer sofort auf 100 HP zurück. Das entspricht [MatchZys Practice-Konfiguration](https://github.com/shobhit-pathak/MatchZy/blob/main/PracticeMode.cs). God Mode verhindert Schaden vollständig. Bots bleiben durch `buddha_ignore_bots 1` verwundbar und respawnen an ihrer gespeicherten Position.

Spieler können im Nades-Modus durch Teamkollegen und Gegner hindurchlaufen. `mp_solid_teammates 2` erlaubt weiterhin, auf den Köpfen von Teamkollegen zu stehen und sich zu boosten. Für Gegner gilt `mp_solid_enemies 0`; Boosts über Teamgrenzen hinweg sind damit nicht möglich. Beim Entladen des Plugins werden die vorherigen Einstellungen wiederhergestellt.

Chatbefehle funktionieren mit `.`, `!` und `/`. Die entsprechende Konsole verwendet `css_`, beispielsweise `.loadnade smoke` und `css_loadnade smoke`.

| Befehl | Funktion |
| --- | --- |
| `.nades` / `css_training` | Trainingspanel öffnen |
| `.nades save` | Aufnahme eines neuen Wurfs starten, danach über das Panel speichern |
| `.nades last` | Zuletzt ausgewähltes Lineup laden |
| `.loadnade <Name>` / `.ln <Name>` | Gespeichertes Lineup laden; bei mehrdeutigen Namen das Panel verwenden |
| `.listnades [Filter]` / `.lin [Filter]` | Bis zu zwölf interne Namen anzeigen; vollständige Liste im Panel |
| `.last` | Zum eigenen letzten Abwurfpunkt zurückkehren |
| `.rethrow` / `.rt` | Die eigene zuletzt geworfene Granate erneut vom ursprünglichen Abwurfpunkt starten |
| `.savepos` / `.loadpos` | Eigene Position und Blickwinkel merken bzw. laden |
| `.noclip` / `noclip` | Fliegen ein- oder ausschalten |
| `.bot` | Stehenden Bot im gegnerischen Team an der eigenen Position mit der eigenen Blickrichtung platzieren; beim Ducken ebenfalls duckend |
| `.crouchbot` / `.cbot` | Duckenden Bot platzieren |
| `.nobots` | Alle Trainingsbots für alle Spieler entfernen, auch eine noch laufende Platzierung abbrechen |
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
3. Ein Lineup aufnehmen, speichern, laden und favorisieren. Unter Trainingswerkzeuge bleiben Rethrow und Bots verfügbar. Smoke, Flash, HE, Decoy, Molotov und CT-Brandgranate werfen und jeweils über den Menüpunkt sowie `.rethrow`, `.rt` und `css_rethrow` wiederholen. Wirkung und Flugbahn vergleichen, der Spieler darf nicht teleportiert werden. Wiederholungen dürfen keine Aufnahme oder Flugzeitmessung abschließen. Eigene und fremde Aufnahmen bleiben korrekt getrennt.
4. Mit zwei Spielern `.last` und `.savepos` prüfen. Positionen und Schutzoptionen dürfen sich nicht gegenseitig überschreiben. Nach Disconnect, Mapwechsel und Rollenentzug dürfen keine alten Spielerzustände weiterwirken.
5. Im Nades-Modus `.ready`, `!start` und `/exitprac` prüfen. Sie dürfen weder Match noch Trainingszustand verändern. Mit zwei Spielern Rethrow prüfen, jeder wiederholt ausschließlich seinen eigenen letzten Wurf. Ohne vorherigen Wurf, nach Disconnect oder Mapwechsel darf kein alter Wurf erscheinen.
6. Auf MatchZy wechseln und einen Scrim mit Ready, Start und Pause prüfen. `.prac` aktiviert dessen Trainingswerkzeuge; `.exitprac` schließt das Panel. Beide Plugins melden sich mit demselben Präfix.
7. Zurück zu Nades wechseln. MatchZy wird entfernt, die Bibliothek und Favoriten bleiben erhalten.
8. Einen leeren Nades-Server starten, erstmals beitreten und anschließend die Map wechseln. Ohne zweiminütiges Warmup oder Freezezeit mit SSG 08, Standardpistole und allen Granaten spawnen. Ein zweiter Join darf die laufende Runde nicht neu starten.
9. Ohne God Mode HE, Molotov, Fallschaden und einen tödlichen Schuss prüfen. HP sinken bei gewöhnlichen Treffern und springen beim tödlichen Treffer auf 100, ohne Tod oder Teleport. Granatenschaden im Chat bleibt messbar. God Mode blockiert Schaden weiterhin vollständig.
10. Über das HUD und `.bot`, `.cbot`, `.crouchbot` stehende und duckende Ziele platzieren. Danach wegbewegen, Flash- und HE-Schaden prüfen, Bots töten und Respawn an gleicher Position mit gleichem Duckzustand prüfen. `.nobots`, volle Teams, Disconnect während der Platzierung und Mapwechsel dürfen keine verspäteten Platzierungen verursachen.
11. Mit zwei Spielern im selben Team durcheinanderlaufen und einen stehenden sowie duckenden Boost prüfen. Danach einen Spieler ins gegnerische Team wechseln und weiterhin durcheinanderlaufen. Nach Mapwechsel müssen beide Einstellungen erhalten bleiben.

Quellen für die Abgrenzung: [MatchZy-Funktionen](https://shobhit-pathak.github.io/MatchZy/), [MatchZy-Befehle](https://shobhit-pathak.github.io/MatchZy/commands/), [CounterStrikeSharp-Spieler-API](https://docs.cssharp.dev/api/CounterStrikeSharp.API.Core.CCSPlayerPawn.html).

## Medien-Review mit UploadThing

Der Review ist ein Modul des bestehenden Playbook-Plugins. Es verwendet dessen Lineup-IDs, Rollen, Trainingszustand und kompaktes Panel mit neun Listenplätzen. Ein zweites Plugin ist dafür nicht nötig. Der dedizierte CS2-Server rendert kein Spielbild: Die Fotos und Videos entstehen im freigegebenen CS2-Fenster auf deinem Windows-Rechner. Der Server sendet Aufnahmebefehle an die offene Review-Seite.

### Einrichten

1. In [UploadThing](https://uploadthing.com/dashboard) eine App anlegen und deren `UPLOADTHING_TOKEN` in der `.env` des Deployments hinterlegen. Der Token bleibt ausschließlich im Webpanel-Backend; er gehört weder in den Browser noch ins CS2-Plugin.
2. Webpanel und CS2-Image neu bauen und starten. `ADMIN_PANEL_PUBLIC_URL` muss auf die öffentlich erreichbare HTTPS-Adresse des Panels zeigen. UploadThing muss `/api/uploadthing` für signierte Upload-Bestätigungen erreichen können. Ein vorgeschalteter Login-Proxy darf diese Bestätigungen nicht blockieren; die SDK-Signaturprüfung schützt den Callback.
3. Die Detailseite eines noch nicht offiziellen Lineups öffnen. Ist UploadThing eingerichtet, sind Datei-Uploads und „Spielbild verbinden“ verfügbar. Ohne Token zeigt die Seite den fehlenden Einrichtungsschritt an.

Die Dateien liegen bei UploadThing, die Zuordnung zum Lineup in MongoDB. Die Medien verwenden öffentliche Datei-URLs und sind für Leser der Lineup-Anleitung sichtbar. Hochladen dürfen der Ersteller seiner noch nicht offiziellen Aufnahme sowie Plattform-Admins. Änderungen am Lineup werden während eines Uploads über die Versionsprüfung erkannt. Die Freigabe ist erst mit allen fünf Medien möglich; eine Review-Anfrage darf schon vorher gestellt werden, damit ein Admin die Aufnahmen ergänzen kann.

Vor jedem Upload, auch beim erneuten Versuch, lädt die Seite die aktuelle Lineup-Version. Dadurch blockieren zwischenzeitliche Wurfmessungen aus CS2 keine bereits aufgenommenen Fotos. Haben sich Startposition, Ausrichtung oder Wurfattribute geändert, aktualisiert die Seite die Daten und verlangt vor dem erneuten Upload eine Prüfung der Aufnahme. Änderungen während des eigentlichen Uploads werden weiterhin abgewiesen.

Die Sitzungsordner unter `savednades.review` übernehmen im Docker-Betrieb den Besitzer des übergeordneten Spielverzeichnisses. So kann der CS2-Benutzer dort Aufnahmesignale schreiben, obwohl das Webpanel als root läuft. Ältere, als root angelegte Ordner werden beim Verbinden oder beim nächsten Abruf einer bestehenden Sitzung korrigiert. Für diese Korrektur genügt ein neu gebautes Webpanel; danach die Review-Seite neu laden und das Spielbild erneut verbinden. Der Testlogin bleibt technisch auf die Rolle Spieler beschränkt, auch wenn der Testbenutzer in der Benutzerverwaltung zum Admin gemacht wird. Für das Ingame-Review ist die Steam-Anmeldung mit dem tatsächlich spielenden Plattform-Admin nötig.

### Aufnahme mit der Windows-App

[Playbook für Windows](../playbook-desktop/README.md) enthält die gesamte Website und übernimmt die lokale CS2-Steuerung. CS2 über den Startbutton der App starten, den Trainingsserver betreten und im Review das Spielbild verbinden. Die App wählt das CS2-Fenster automatisch und entfernt bei Fotos und Videos den Fensterrahmen anhand der Windows-Fenstergeometrie. Sie sichert die veränderten lokalen Einstellungen, stellt bei Fotos HUD, Waffe und ein einheitliches echtes CS2-Fadenkreuz ein und stellt die bisherigen Werte unmittelbar nach der Aufnahme wieder her. Die Frontansicht hat kein Fadenkreuz; im Video bleibt die Waffe sichtbar. F8 stoppt das Video ohne Einrichtung eines Binds.

Das bestehende Server-Plugin steuert weiterhin Lineup, Frontkamera, Panel und Freigaben. Playbook bleibt während des Reviews geöffnet. Der bisherige Browser-Ablauf ist ebenfalls verfügbar. Die Windows-App ergänzt keine eigene Benutzerverwaltung und verändert keine Berechtigungen.

Website-Updates werden beim Laden automatisch übernommen. Updates des Windows-Helfers werden über GitHub-Releases angeboten und erst nach dem Review per Button installiert. Installer, Build-Workflow, Wiederherstellung und die nötige Prüfung mit einem echten Windows-CS2 stehen in der [Desktop-Dokumentation](../playbook-desktop/README.md).

### Aufnahme im Browser auf Windows

1. Chrome oder Edge öffnen, mit demselben Steam-Konto wie im Spiel anmelden und die Lineup-Detailseite öffnen. Als Plattform-Admin „Spielbild verbinden“ wählen und das CS2-Fenster freigeben. Die Browserseite während des Reviews offen lassen. Unter „Fotoausschnitt festlegen“ die Fensterränder in Pixeln ausschneiden und die Vorschau bestätigen. Bei randlosem CS2 bleiben die Ränder auf 0. Der Ausschnitt gilt für Fotos dieser Freigabe; nach einer Änderung der Aufnahmegröße muss er neu bestätigt werden. Videos verwenden weiterhin die ganze Freigabe, deshalb dafür CS2 randlos freigeben. Bei schwarzer Vorschau die Bildschirmfreigabe erneut einrichten; bei Freigabe des ganzen Bildschirms werden auch andere sichtbare Fenster aufgenommen.
2. Den auf der Website angezeigten Review-Crosshair-Code in CS2 unter Einstellungen → Spiel → Fadenkreuz → Teilen oder importieren einfügen. Der vorgegebene Code lautet `CSKBTrLqOGX2ztECdjH7rsZaUPwtosk7jjPtSRje8xvSyF`. Nach dem Review den eigenen, selbst aufbewahrten Code wieder importieren. Die Website speichert den persönlichen Code nicht und kontrolliert den Import nicht. Für Fotos vorab in der lokalen CS2-Konsole `cl_draw_only_deathnotices 1; r_drawviewmodel 0` ausführen. Das blendet den HUD einschließlich Geld und das Viewmodel aus und lässt das echte Fadenkreuz stehen. Diese lokalen Optionen bleiben bis zum manuellen Zurückschalten aktiv. Im Trainingspanel das Lineup öffnen und „Medien-Review“ wählen. Unter der Bibliothek gibt es für Plattform-Admins zusätzlich „Medien-Reviews“. Die Sitzung gehört genau zu diesem Lineup und diesem Steam-Konto; nur eine Browserseite kann sie gleichzeitig steuern.
3. **Ausrichtung:** Lineup laden und das Fadenkreuz auf den gespeicherten Orientierungspunkt richten. „Foto aufnehmen & hochladen“ blendet Chat und Panel aus und löst nach mindestens drei Sekunden aus. Das echte CS2-Fadenkreuz und das Ego-Sichtfeld bleiben erhalten. Der Browser zeichnet nichts ins Foto, sondern schneidet nur den bestätigten Ausschnitt aus. Sobald das Bild aufgenommen ist, werden der serverseitige HUD-Zustand und die vorherige Panel-Seite samt Auswahl wiederhergestellt. Der Upload läuft danach weiter. Alternativ löst „Foto mit Spielserver aufnehmen“ im Browser denselben Ablauf aus.
4. **Standposition:** Den Boden und die Kanten zeigen, an denen der Spieler steht. Den Bildausschnitt selbst einstellen und das nächste Foto auslösen.
5. **Vorderansicht:** Der Server lädt automatisch den gespeicherten Start und setzt eine Kamera 120 Spieleinheiten vor den Spieler. Die Kamera blickt horizontal zurück; ihre Höhe beträgt 48 Einheiten über dem Boden, beim Ducken 32. Diese Kamera verwendet ein Sichtfeld von 90 Grad; Ego-Fotos behalten ihr bisheriges Sichtfeld. Die Vorderansicht enthält kein Fadenkreuz. Nach dem Foto werden die vorherige Kamera und das Sichtfeld wiederhergestellt. Konsolenbefehle für Third Person sind dafür nicht nötig.
6. **Wirkung:** Die Granate werfen, mit Noclip zum Ziel fliegen und die entfaltete Smoke bzw. Granatenwirkung aufnehmen.
7. **Video:** „Video starten“ wählen und die Chat-Bestätigung abwarten. Zum Startpunkt laufen, ausrichten, werfen, mit Noclip zum Ziel fliegen und die Wirkung zeigen. Einmal lokal `bind "F8" "css_training_review_stop"` in der CS2-Konsole eingeben. Danach stoppt F8 das Review-Video auch bei verborgenem Panel und startet den Upload. Der Bind wird zusätzlich mit `css_training_binds` ausgegeben. Alternativ im Panel „Video stoppen & hochladen“ oder den Stopp-Button im Browser wählen. Die Browseraufnahme hat keinen Ton und endet spätestens nach zwei Minuten. Die Freigabe erst nach dem Upload beenden; wird das Teilen oder die Seite vorher geschlossen, wird die laufende Aufnahme verworfen.
8. **Prüfung:** Alle vier Fotos und das Video auf der Website ansehen. Anschließend dort oder über die Bestätigung im Ingame-Panel offiziell freigeben. Rolle, Lineup-Version und Vollständigkeit werden im Backend erneut geprüft. „Must Know“ bleibt Plattform-Admins vorbehalten.

Die fünf Medienslots lassen sich auch einzeln per Dateiauswahl oder Drag-and-drop füllen: JPEG/PNG/WebP bis 8 MB pro Foto, MP4/WebM bis 128 MB pro Video. Bei einem fehlgeschlagenen Upload bleibt die Aufnahme auf der geöffneten Seite für einen erneuten Versuch erhalten. Ein bereits offizielles Lineup benötigt vor Änderungen am Review eine zurückgenommene Freigabe.

Der Ablauf führt durch die Aufnahmen und automatisiert deren Auslösung, Panel-Rückkehr, Vorderansicht, Upload und Zuordnung. Crosshair-Import, vollständiger Fotomodus und das spätere Zurückschalten erfolgen lokal durch den Reviewer. `cl_draw_only_deathnotices 0; r_drawviewmodel 1` schaltet vor dem Video oder nach dem Review HUD und Waffe wieder ein; bei abweichenden persönlichen Einstellungen die eigenen vorherigen Werte verwenden. FPS-, Netzwerk- und Steam-Anzeigen bei Bedarf separat deaktivieren. Den Bildausschnitt für Standposition und Wirkung sowie Laufweg, Wurf und Noclip-Flug steuert der Reviewer. Eine vollständig autonome Kamerafahrt ist hier nicht implementiert. Browser können Hintergrundseiten verzögert ausführen; deshalb immer die Aufnahmebestätigung abwarten.

Technische Grundlage: [UploadThing-Express-Adapter](https://docs.uploadthing.com/backend-adapters/express), [Browser-Bildschirmfreigabe](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia), [MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder).


Für den automatischen Fotoablauf müssen Webpanel und CS2-Plugin gemeinsam aktualisiert werden. Ältere Plugins liefern keine Bestätigung der vorbereiteten Kamera; die neue Website lehnt solche Fotos ab. Während eines Fotos wird die Bewegung kurz gesperrt. Nach Aufnahme, Fehler, Ablauf des 30-Sekunden-Limits, Verbindungsverlust, Tod, Mapwechsel oder Plugin-Unload gibt das Plugin seine HUD- und Kameraeinstellungen wieder frei. Persönliche Crosshair-Cvars werden serverseitig nicht verändert. Die Präsentationsversion `review-v2` erhält das echte Fadenkreuz bei Ego-Fotos; die Website lehnt ältere Plugins ab, die es noch ausblenden. Ein Server-Plugin kann lokale Grafik- und Crosshair-Einstellungen nicht zuverlässig auslesen, umstellen und exakt wiederherstellen. In der Windows-App übernimmt der lokale Helfer diese Einstellungen samt Wiederherstellung. Im Browser sind dafür die manuellen Schritte auf der Website vorgesehen. Der Browser ergänzt kein Fadenkreuz. Der Fensterrahmen wird durch den bestätigten Fotoausschnitt entfernt, ohne die Szene oder den Zielpunkt unabhängig voneinander zu verschieben.

Zur Abnahme auf Windows jeweils ein Ego-Foto und eine Vorderansicht auslösen, auch über den Browser. HUD-Freiheit, Kamera, Fadenkreuz, Rückkehr zur vorherigen Panel-Auswahl sowie Abbruch durch Ende der Bildschirmfreigabe prüfen. Das Video einmal über F8 stoppen, während das Panel verborgen ist. Diese Spielbild- und Eingabeprüfung benötigt einen echten CS2-Client; die automatisierten Tests prüfen Protokoll, Reihenfolge, Kamerageometrie, Randbeschnitt und Erhalt der Originalpixel. Die Wirkung der lokalen CS2-Befehle ist zusätzlich am echten Windows-Client zu prüfen.

API-Grundlage: [Serverseitiger HUD-Zustand](https://docs.cssharp.dev/api/CounterStrikeSharp.API.Core.CBasePlayerPawn.html#CounterStrikeSharp_API_Core_CBasePlayerPawn_HideHUD), [Kameradienste](https://docs.cssharp.dev/api/CounterStrikeSharp.API.Core.CCSPlayer_CameraServices.html), [Grenzen von Client-Befehlen](https://docs.cssharp.dev/api/CounterStrikeSharp.API.Core.CCSPlayerController.html#CounterStrikeSharp_API_Core_CCSPlayerController_ExecuteClientCommand_System_String_).

Der Review-Code wird als vorgegebener Text verwendet, nicht nach einem alten Format validiert. Valve hat das Share-Code-Format mit dem [Update vom 30. September 2026](https://steamcommunity.com/app/730/allnews/?l=german) erneut geändert.
