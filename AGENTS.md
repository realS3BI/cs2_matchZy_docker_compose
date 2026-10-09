# Projektregeln

- Deutsche Texte in Oberflächen, Meldungen und Dokumentation verwenden die korrekte Schreibweise mit ä, ö, ü, Ä, Ö, Ü und ß. Keine Ersatzschreibweisen wie „Zurueck“, „auswaehlen“ oder „Groesse“ verwenden.
- Textdateien als UTF-8 erhalten. Technische Bezeichner, Befehle, Dateipfade und nutzerdefinierte Daten nicht durch pauschale Umlaut-Ersetzungen verändern.
- Das Ingame-Panel hat ausschließlich die kompakte Größe und reserviert immer neun Listenplätze pro Seite.
- Persönliche Favoriten anhand von Steam-ID sowie Owner, Map und internem Lineup-Namen speichern. Unter „Alle“ sind alle Aufnahmen sichtbar. Nur der Ersteller darf seine noch nicht offiziellen Aufnahmen bearbeiten, löschen oder zum Review einreichen; Startposition und Endposition (`throwFromTitle`, `throwToTitle`) noch nicht offizieller Aufnahmen dürfen zusätzlich Plattform-Admins als Reviewer ergänzen, ohne die Review-Anfrage zurückzusetzen; Plattform-Admins dürfen auf der Website alle Aufnahmen löschen, auch importierte und offizielle. Nur Plattform-Admins geben „Offiziell“ und „Must Know“ frei.
- Kartenpositionen (`radarFrom`, `radarTo`) sind unabhängig vom Review-Status: Ersteller und Plattform-Admins dürfen sie auch bei offiziellen Aufnahmen setzen und korrigieren. Dabei bleiben Wurfdaten und Freigaben erhalten. Ersteller und Plattform-Admins dürfen Review oder Freigabe zurücknehmen; die Aufnahme bleibt unter „Alle“, „Offiziell“ und „Must Know“ werden entfernt.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
