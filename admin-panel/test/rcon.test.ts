import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { currentMapFromStatus, executeRcon, mapChangeCommand } from "../src/rcon.js";

function response(id, type, body = "") {
  const buffer = Buffer.alloc(Buffer.byteLength(body) + 14);
  buffer.writeInt32LE(buffer.length - 4, 0);
  buffer.writeInt32LE(id, 4);
  buffer.writeInt32LE(type, 8);
  buffer.write(body, 12);
  return buffer;
}

test("map commands reject console injection and support Workshop IDs", () => {
  assert.equal(mapChangeCommand({ map: "de_mirage" }), "changelevel de_mirage");
  assert.equal(mapChangeCommand({ workshopId: "3070244462" }), "host_workshop_map 3070244462");
  for (const map of ["de_mirage_vanity", "warehouse_vanity", "graphics_settings", "workshop_preview_dust2", "de_mirage;quit", "de_mirage\nquit", "../de_mirage", "", null, ["de_mirage"]]) {
    assert.throws(() => mapChangeCommand({ map }));
  }
  assert.throws(() => mapChangeCommand({ workshopId: "123;quit" }));
  assert.equal(currentMapFromStatus("hostname: Test\nmap     : de_mirage at: 0 x, 0 y, 0 z"), "de_mirage");
  assert.equal(currentMapFromStatus('Server: Running [map: "de_inferno"]'), "de_inferno");
  assert.equal(currentMapFromStatus("Server still booting"), null);
});

test("RCON authenticates, handles fragmented packets and collects the full response", async () => {
  const commands = [];
  const server = createServer((socket) => {
    let pending = Buffer.alloc(0);
    socket.on("data", (data: Buffer) => {
      pending = Buffer.concat([pending, data]);
      while (pending.length >= 4 && pending.length >= pending.readInt32LE(0) + 4) {
        const size = pending.readInt32LE(0);
        const id = pending.readInt32LE(4);
        const type = pending.readInt32LE(8);
        const body = pending.toString("utf8", 12, size + 2);
        pending = pending.subarray(size + 4);
        if (type === 3) {
          assert.equal(body, "test-password");
          const auth = Buffer.concat([response(id, 0), response(id, 2)]);
          socket.write(auth.subarray(0, 3));
          setImmediate(() => socket.write(auth.subarray(3)));
        } else if (type === 2) {
          commands.push(body);
          socket.write(response(id, 0, "map : de_"));
          socket.write(response(id, 0, "mirage\n"));
        } else {
          socket.write(response(id, 0));
        }
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as { port: number };
    assert.equal(await executeRcon({ host: "127.0.0.1", port: address.port, password: "test-password", command: "status" }), "map : de_mirage");
    assert.deepEqual(commands, ["status"]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

for (const scenario of ["authentication", "invalid packet", "disconnect", "timeout"]) {
  test(`RCON reports ${scenario} failures`, async () => {
    const server = createServer((socket) => {
      socket.on("data", () => {
        if (scenario === "authentication") socket.write(response(-1, 2));
        if (scenario === "invalid packet") socket.write(Buffer.from([255, 255, 255, 127]));
        if (scenario === "disconnect") socket.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address() as { port: number };
      await assert.rejects(executeRcon({ host: "127.0.0.1", port: address.port, password: "secret", command: "status", timeoutMs: 100 }), /authentication failed|Invalid RCON|closed the connection|did not respond/);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
}
