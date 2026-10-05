import { mkdir, statfs } from "node:fs/promises";
import type { Collection, Db } from "mongodb";
import { problem } from "./strats.js";

export class AnalysisStorage {
  readonly reservations: Collection<any>;
  constructor(
    readonly db: Db,
    readonly directory: string,
    readonly config: any,
  ) {
    this.reservations = db.collection("analysisReservations");
  }
  async initialize() {
    await this.reservations.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 },
    );
  }
  async usage(scope?: string) {
    const filter = scope ? { scope } : {};
    const demos = await this.db
      .collection("demoAssets")
      .find(filter, {
        projection: { bytes: 1, derivedBytes: 1, originalRetained: 1 },
      })
      .toArray();
    const tracks = await this.db
      .collection("audioTracks")
      .find(
        scope
          ? scope.startsWith("team:")
            ? { teamId: scope.slice(5) }
            : { ownerId: scope.slice(5), teamId: null }
          : {},
        { projection: { bytes: 1, status: 1 } },
      )
      .toArray();
    const reservations = await this.reservations
      .find({ ...filter, expiresAt: { $gt: new Date() } })
      .toArray();
    return {
      originals: demos.reduce(
        (n, d) => n + (d.originalRetained === false ? 0 : Number(d.bytes || 0)),
        0,
      ),
      replays: demos.reduce((n, d) => n + Number(d.derivedBytes || 0), 0),
      audio: tracks.reduce((n, t) => n + Number(t.bytes || 0), 0),
      reserved: reservations.reduce((n, r) => n + r.bytes, 0),
    };
  }
  async reserve(scope: string, key: string, bytes: number) {
    if (!Number.isSafeInteger(bytes) || bytes < 0)
      problem(400, "Ungültige Speicherreservierung.");
    const existing = await this.reservations.findOne({ _id: key });
    if (existing) return;
    const all = await this.usage(),
      own = await this.usage(scope);
    const sum = (value) =>
      value.originals + value.replays + value.audio + value.reserved;
    if (
      sum(all) + bytes >
        (this.config.analysisStorageLimit || 100 * 1024 ** 3) ||
      sum(own) + bytes > (this.config.analysisScopeLimit || 20 * 1024 ** 3)
    )
      problem(
        507,
        "Das Speicherkontingent ist ausgeschöpft. Entferne ungenutzte Inhalte oder erhöhe die Quote.",
      );
    await mkdir(this.directory, { recursive: true });
    const disk = await statfs(this.directory);
    if (
      disk.bavail * disk.bsize <
      bytes + (this.config.analysisMinimumFree || 2 * 1024 ** 3)
    )
      problem(
        507,
        "Auf dem Server fehlt freier Arbeitsraum. Der Dateinachschub wurde angehalten.",
      );
    await this.reservations.insertOne({
      _id: key,
      scope,
      bytes,
      expiresAt: new Date(Date.now() + 24 * 3600_000),
    });
  }
  async release(key: string) {
    await this.reservations.deleteOne({ _id: key });
  }
}
