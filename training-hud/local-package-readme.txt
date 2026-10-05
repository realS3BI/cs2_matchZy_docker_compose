Playbook Trainings-HUD für Windows

1. CS2 vollständig beenden.
2. ZIP entpacken und Installieren.cmd doppelklicken.
   Der Installer erkennt CS2 in den Steam-Bibliotheken oder fragt den Ordner ab.
3. CS2 normal über Steam starten, mit dem Trainingsserver verbinden und .nades eingeben.

Du brauchst keine Workshop Tools, kein Git, kein Node.js und keine Playbook-App.
Windows PowerShell ist bereits in Windows enthalten.
Der Installer sichert vorhandene lokale HUD-Dateien unter
<CS2>/playbook-hud-backups und verändert keine Keybinds.

Alternativ ohne Installer:
Den enthaltenen game-Ordner in den CS2-Installationsordner kopieren und zusammenführen.
Den Ordner findest du in Steam unter CS2 → Eigenschaften → Installierte Dateien → Durchsuchen.
Die beiden Dateien müssen danach hier liegen:
game/csgo/panorama/layout/custom_game/playbook_training.vxml_c
game/csgo/panorama/styles/custom_game/playbook_training.vcss_c
Vorhandene gleichnamige Dateien vorher sichern. Alte matchzy_training.vxml_c
und matchzy_training.vcss_c ebenfalls sichern und entfernen, falls vorhanden.

Der Server braucht das passende Playbook-Plugin und ein aktiviertes Trainings-HUD.
Für Training ohne HUD-Workshop-Download muss der Betreiber in den Servereinstellungen
"HUD über Workshop ausliefern" ausschalten und "Apply & restart" ausführen.
Das gilt für alle Spieler. Jeder braucht dann diese lokalen Dateien.
Andere Workshop-Maps oder Server-Addons werden dadurch nicht ersetzt.

Das lokale Panel bleibt installiert, bis du es ersetzt oder entfernst.
Es kann eine Workshop-Version überdecken. Neue Stände erneut installieren und CS2 neu starten.
Eine Aktualisierung während einer laufenden CS2-Sitzung reicht wegen des Panorama-Caches nicht.

Zur Workshop-Version zurückwechseln:
CS2 beenden, dann im entpackten Paket in PowerShell ausführen:
./install-local.ps1 -Mode live
Der Server muss das HUD dann wieder über Workshop bereitstellen.
