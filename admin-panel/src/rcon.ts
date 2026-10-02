import { createConnection } from "node:net";

function packet(id: number, type: number, body: string) {
  const text = Buffer.from(body, "utf8");
  const buffer = Buffer.alloc(text.length + 14);
  buffer.writeInt32LE(text.length + 10, 0);
  buffer.writeInt32LE(id, 4);
  buffer.writeInt32LE(type, 8);
  text.copy(buffer, 12);
  return buffer;
}

// Source RCON uses a second request as a fence for multi-packet responses.
export function executeRcon({ host, port = 27015, password, command, timeoutMs = 8000 }): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    let pending = Buffer.alloc(0);
    let authenticated = false;
    let output = "";
    let finished = false;
    const deadline = setTimeout(() => finish(new Error("CS2 did not respond. Check that the game server and RCON are ready.")), timeoutMs);

    function finish(error?: Error) {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      socket.destroy();
      if (error) reject(error);
      else resolve(output.trim());
    }

    socket.on("connect", () => socket.write(packet(1, 3, password)));
    socket.on("error", () => finish(new Error("Cannot reach CS2 RCON. Check that the game server is running.")));
    socket.on("close", () => finish(new Error("CS2 closed the connection before confirming the command. Refresh the live map before trying again.")));
    socket.on("data", (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]);
      while (!finished && pending.length >= 4) {
        const size = pending.readInt32LE(0);
        if (size < 10 || size > 4096) return finish(new Error("Invalid RCON response."));
        if (pending.length < size + 4) break;
        const id = pending.readInt32LE(4);
        const type = pending.readInt32LE(8);
        const body = pending.toString("utf8", 12, size + 2);
        pending = pending.subarray(size + 4);
        if (!authenticated) {
          if (type !== 2) continue;
          if (id !== 1) return finish(new Error("RCON authentication failed. Apply the configured RCON password and restart CS2."));
          authenticated = true;
          socket.write(packet(2, 2, command));
          socket.write(packet(3, 0, ""));
        } else if (id === 2) {
          output += body;
          if (output.length > 1024 * 1024) return finish(new Error("RCON response is too large."));
        } else if (id === 3) {
          finish();
        }
      }
    });
  });
}

export function humanPlayersFromStatus(output: string): number | null {
  const legacy = output.match(/^\s*(?:\[[^\]]+\]\s*)?players\s*:\s*(\d+)\s+humans\s*,\s*\d+\s+bots\b/im);
  if (legacy) return Number(legacy[1]);
  const current = output.match(/^\s*(?:\[[^\]]+\]\s*)?players\s*:\s*(\d+)\s*\((\d+)\s+bots?\)/im);
  if (!current) return null;
  const humans = Number(current[1]) - Number(current[2]);
  return humans >= 0 ? humans : null;
}

export function currentMapFromStatus(output: string) {
  return output.match(/^\s*map\s*:\s*([a-z0-9_\/-]+)/im)?.[1]
    || output.match(/\bmap\s*:\s*"([a-z0-9_\/-]+)"/i)?.[1]
    || null;
}

export function mapChangeCommand(input) {
  if (input?.workshopId !== undefined) {
    if (typeof input.workshopId !== "string" || !/^[1-9][0-9]{0,19}$/.test(input.workshopId)) throw new Error("Invalid Workshop ID.");
    return `host_workshop_map ${input.workshopId}`;
  }
  if (typeof input?.map !== "string" || !/^[a-z0-9_]{1,64}$/i.test(input.map)) throw new Error("Map names may contain only letters, numbers and underscores.");
  if (/vanity|^workshop_preview_|^graphics_settings$|^lobby_mapveto$/i.test(input.map)) throw new Error("Diese Map ist nur eine Vorschau oder Kulisse und kann nicht geladen werden.");
  return `changelevel ${input.map}`;
}
