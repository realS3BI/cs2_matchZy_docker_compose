import type { Collection, Db } from "mongodb";
import type { Access } from "../shared/authorization.js";
import type { Team, Strat } from "../shared/strats.js";

export class WorkspaceStore {
  private teams: Collection<any>;
  private strats: Collection<any>;
  private assignments: Collection<any>;
  constructor(db: Db, private changed: () => void = () => {}) {
    this.teams = db.collection("teams");
    this.strats = db.collection("strats");
    this.assignments = db.collection("roleAssignments");
  }
  async initialize(initialAccess: Record<string, Access>) {
    // One atomic document protects platform-admin transfers against concurrent demotions.
    await this.assignments.updateOne(
      { _id: "current" },
      { $setOnInsert: { users: initialAccess, revision: 1, schemaVersion: 1 } },
      { upsert: true },
    );
    await this.teams.createIndex({ "members.userId": 1 });
    await this.teams.createIndex({ "invitations.hash": 1 });
    await this.strats.createIndex({ teamId: 1, updatedAt: -1 });
  }
  async getAccessDocument(): Promise<{
    users: Record<string, Access>;
    revision: number;
  }> {
    return (await this.assignments.findOne(
      { _id: "current" },
      { projection: { _id: 0 } },
    )) as any;
  }
  async replaceAccess(revision: number, users: Record<string, Access>) {
    const changed = (
      (
        await this.assignments.updateOne(
          { _id: "current", revision },
          { $set: { users }, $inc: { revision: 1 } },
        )
      ).matchedCount === 1
    );
    if (changed) this.changed();
    return changed;
  }
  async listTeams(userId?: string): Promise<Team[]> {
    return this.teams
      .find(userId ? { "members.userId": userId } : {}, {
        projection: { _id: 0 },
      })
      .sort({ name: 1 })
      .toArray() as any;
  }
  async getTeam(id: string): Promise<Team | null> {
    return this.teams.findOne({ _id: id }, { projection: { _id: 0 } }) as any;
  }
  async findInvitation(hash: string): Promise<Team | null> {
    return this.teams.findOne(
      { "invitations.hash": hash },
      { projection: { _id: 0 } },
    ) as any;
  }
  async createTeam(team: Team) {
    await this.teams.insertOne({ _id: team.id, ...team });
    this.changed();
  }
  async replaceTeam(team: Team, revision: number) {
    const changed = (
      (
        await this.teams.replaceOne(
          { _id: team.id, revision },
          { _id: team.id, ...team, revision: revision + 1 },
        )
      ).matchedCount === 1
    );
    if (changed) this.changed();
    return changed;
  }
  async listStrats(teamIds: string[]): Promise<Strat[]> {
    return this.strats
      .find({ teamId: { $in: teamIds } }, { projection: { _id: 0 } })
      .sort({ updatedAt: -1 })
      .toArray() as any;
  }
  async getStrat(id: string): Promise<Strat | null> {
    return this.strats.findOne({ _id: id }, { projection: { _id: 0 } }) as any;
  }
  async createStrat(strat: Strat) {
    await this.strats.insertOne({ _id: strat.id, ...strat });
    this.changed();
  }
  async replaceStrat(strat: Strat, revision: number) {
    const changed = (
      (
        await this.strats.replaceOne(
          { _id: strat.id, revision },
          { _id: strat.id, ...strat, revision: revision + 1 },
        )
      ).matchedCount === 1
    );
    if (changed) this.changed();
    return changed;
  }
}
