import { createReadStream, createWriteStream } from "node:fs";
import { open, rm, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { createGunzip } from "node:zlib";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import { DEMO_EXPANDED_LIMIT } from "../shared/demos.js";
import { parseDemo } from "./demo-parser.js";

const directory = process.argv[2];
const source = join(directory, "source");
const expanded = join(directory, "expanded.dem");
let unzip: ReturnType<typeof spawn> | undefined;
try {
  const handle = await open(source, "r");
  const magic = Buffer.alloc(8);
  await handle.read(magic, 0, 8, 0);
  await handle.close();
  let path = source;
  let bytes = 0;
  const limit = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      callback(
        bytes > DEMO_EXPANDED_LIMIT
          ? new Error("Die entpackte Demo ist größer als 2 GiB.")
          : null,
        chunk,
      );
    },
  });
  if (magic[0] === 0x1f && magic[1] === 0x8b) {
    await pipeline(
      createReadStream(source),
      createGunzip(),
      limit,
      createWriteStream(expanded),
    );
    path = expanded;
  } else if (magic.subarray(0, 3).toString() === "BZh") {
    unzip = spawn("bzip2", ["-dc", source], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    const closed = once(unzip, "close");
    const [result] = await Promise.all([
      closed,
      pipeline(unzip.stdout!, limit, createWriteStream(expanded)),
    ]);
    if (result[0] !== 0)
      throw new Error("Die komprimierte Demo konnte nicht gelesen werden.");
    path = expanded;
  } else if (magic.toString() !== "PBDEMS2\0")
    throw new Error("Die Datei ist keine unterstützte CS2-Demo.");
  if ((await stat(path)).size > DEMO_EXPANDED_LIMIT)
    throw new Error("Die Demo ist zu groß.");
  const demoHandle = await open(path, "r");
  await demoHandle.read(magic, 0, 8, 0);
  await demoHandle.close();
  if (magic.toString() !== "PBDEMS2\0")
    throw new Error("Die Datei enthält keine CS2-Demo.");
  await parseDemo(path, directory);
  process.send?.({ ok: true });
} catch (error) {
  process.send?.({
    ok: false,
    error: String(
      error.message || "Die Demo konnte nicht verarbeitet werden.",
    ).slice(0, 500),
  });
  process.exitCode = 1;
} finally {
  unzip?.kill();
  await rm(expanded, { force: true }).catch(() => {});
  process.disconnect?.();
}
