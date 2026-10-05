import { ACTIONS, ROLE_CATALOG } from "../../../shared/authorization";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Feedback, useResource, WorkspaceHeader } from "./workspace-ui";

export function RolesPage() {
  const { data, error } = useResource<any>("/api/access");
  return (
    <>
      <WorkspaceHeader
        title="Rollen und Rechte"
        description="Feste Rollen mit getrennten Zuständigkeiten für Plattform, Server und jedes einzelne Team."
      />
      <Feedback error={error} />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Geltungsbereiche</CardTitle>
            <CardDescription>
              Ein Plattform-Admin sieht keine fremden Strats. Teamrollen
              verleihen keine Serverrechte. Nur ein Team-Owner verwaltet seine
              Mitglieder und vergibt Teamrollen.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <p>
              Match Admin und Server-Admin erhalten uneingeschränkten
              RCON-Zugriff. Vergib diese Serverrollen nur an Personen, denen du
              die volle Serverkonsole anvertrauen möchtest.
            </p>
            <p className="mt-2 text-muted-foreground">
              Bei Nades gelten zusätzlich Eigentum und Freigabestatus. Aufnahme
              im Spiel setzt sowohl die Plattformberechtigung zum Erstellen als
              auch einen Trainingszugang voraus.
            </p>
          </CardContent>
        </Card>
        {(["platform", "server", "team"] as const).map((scope) => {
          const roles = ROLE_CATALOG.filter((role) => role.scope === scope);
          const actions = Object.entries(ACTIONS).filter(([action]) =>
            roles.some((role) => role.permissions.includes(action as any)),
          );
          return (
            <Card key={scope}>
              <CardHeader>
                <CardTitle>
                  {
                    {
                      platform: "Plattform",
                      server: "Server · primary",
                      team: "Team · jeweils nur das zugewiesene Team",
                    }[scope]
                  }
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">
                    Rechtematrix für {scope}
                  </caption>
                  <thead>
                    <tr>
                      <th className="p-3 font-medium">Berechtigung</th>
                      {roles.map((role) => (
                        <th
                          key={role.id}
                          className="p-3 text-center font-medium"
                        >
                          {role.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {actions.map(([action, label]) => (
                      <tr key={action} className="border-t">
                        <th scope="row" className="p-3 font-normal">
                          {label}
                        </th>
                        {roles.map((role) => (
                          <td key={role.id} className="p-3 text-center">
                            {role.permissions.includes(action as any)
                              ? "Ja"
                              : "Nein"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          );
        })}
        <Card>
          <CardHeader>
            <CardTitle>Abgleich mit dem Spielserver</CardTitle>
            <CardDescription>
              {data?.runtime?.synchronized
                ? "Das Plugin hat den aktuellen Berechtigungsstand übernommen."
                : "Die Website verwendet die aktuellen Rechte. Die Bestätigung des Spielserver-Plugins steht noch aus."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-xs">
              <div>
                <dt className="font-medium">Veröffentlicht</dt>
                <dd className="break-all font-mono text-muted-foreground">
                  {data?.runtime?.publishedRevision || "Noch kein Export"}
                </dd>
              </div>
              <div>
                <dt className="font-medium">Vom Plugin bestätigt</dt>
                <dd className="break-all font-mono text-muted-foreground">
                  {data?.runtime?.appliedRevision || "Noch keine Bestätigung"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Letzte Rechteänderungen</CardTitle>
            <CardDescription>
              Zuletzt protokollierte Benutzer-, Team- und Einladungsaktionen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data?.history?.length ? (
              <ol className="divide-y">
                {data.history.map((entry, index) => (
                  <li key={entry._id || index} className="py-3 text-sm">
                    <p>
                      {new Date(entry.createdAt).toLocaleString("de-AT")} ·{" "}
                      {entry.type === "user_role"
                        ? "Benutzerrechte geändert"
                        : entry.type === "team_invite"
                          ? "Einladung erstellt"
                          : entry.type === "team_join"
                            ? "Teambeitritt"
                            : "Team geändert"}
                    </p>
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      Ausgeführt von {entry.details?.actor} · Betrifft{" "}
                      {entry.details?.subject}
                    </p>
                    {entry.details?.access && (
                      <p className="mt-1 text-xs">
                        {entry.details.access.platform} ·{" "}
                        {entry.details.access.server}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">
                Noch keine Änderungen protokolliert.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
