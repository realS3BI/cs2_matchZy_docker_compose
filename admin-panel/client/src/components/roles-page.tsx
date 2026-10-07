import { Check, Minus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
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
        <Tabs className="workspace-tabs" defaultValue="platform">
          <div className="overflow-x-auto pb-2">
            <TabsList
              variant="line"
              className="mb-3"
              aria-label="Geltungsbereich der Rechte"
            >
              <TabsTrigger value="platform">Plattform</TabsTrigger>
              <TabsTrigger value="server">Server</TabsTrigger>
              <TabsTrigger value="team">Im Team</TabsTrigger>
            </TabsList>
          </div>
          {(["platform", "server", "team"] as const).map((scope) => {
            const roles = ROLE_CATALOG.filter((role) => role.scope === scope);
            const actions = Object.entries(ACTIONS).filter(([action]) =>
              roles.some((role) => role.permissions.includes(action as any)),
            );
            return (
              <TabsContent key={scope} value={scope}>
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {
                        {
                          platform: "Plattform",
                          server: "Server",
                          team: "Team",
                        }[scope]
                      }
                    </CardTitle>
                    <CardDescription>
                      {
                        {
                          platform:
                            "Diese Rechte gelten für Inhalte und Benutzer auf der Website.",
                          server:
                            "Diese Rechte gelten für Training, Spielbetrieb und Servereinstellungen.",
                          team: "Diese Rechte gelten ausschließlich innerhalb des jeweiligen Teams.",
                        }[scope]
                      }
                    </CardDescription>
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
                                {role.permissions.includes(action as any) ? (
                                  <span className="inline-flex text-primary">
                                    <Check
                                      className="size-4"
                                      aria-hidden="true"
                                    />
                                    <span className="sr-only">Ja</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex text-muted-foreground">
                                    <Minus
                                      className="size-4"
                                      aria-hidden="true"
                                    />
                                    <span className="sr-only">Nein</span>
                                  </span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </TabsContent>
            );
          })}
        </Tabs>
        <details className="disclosure-panel">
          <summary>Spielserver-Abgleich und Änderungsverlauf</summary>
          <div className="flex flex-col gap-5 p-4">
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
                      {data?.runtime?.appliedRevision ||
                        "Noch keine Bestätigung"}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Letzte Rechteänderungen</CardTitle>
                <CardDescription>
                  Zuletzt protokollierte Benutzer-, Team- und
                  Einladungsaktionen.
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
        </details>
      </div>
    </>
  );
}
