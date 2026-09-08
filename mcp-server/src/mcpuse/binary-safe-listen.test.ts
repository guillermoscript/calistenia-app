import { describe, it, expect, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { Hono } from "hono";
import { installBinarySafeListen, type BinarySafeListenTarget } from "./binary-safe-listen.js";

// Un "JPEG": cabecera real + los 256 valores de byte, que es justo lo que un
// TextDecoder no puede representar sin pérdida.
function fakeJpeg(): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(4 + 256 * 8);
  bytes.set([0xff, 0xd8, 0xff, 0xe0], 0);
  for (let i = 4; i < bytes.length; i++) bytes[i] = (i * 7) & 0xff;
  return bytes;
}

function sha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function fakeServer(app: Hono): BinarySafeListenTarget {
  return {
    fetch: (request) => Promise.resolve(app.fetch(request)),
    listen: async () => {
      throw new Error("el listen() original de mcp-use no debe ejecutarse");
    },
  };
}

describe("installBinarySafeListen", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it("entrega un multipart con imagen byte a byte (lo que rompe el listen() de mcp-use)", async () => {
    const app = new Hono();
    app.post("/api/echo", async (c) => {
      const form = await c.req.formData();
      const file = form.get("images") as File;
      const bytes = new Uint8Array(await file.arrayBuffer());
      return c.json({ size: bytes.length, type: file.type, sha: sha256(bytes), meal: form.get("meal_type") });
    });

    const server = fakeServer(app);
    ({ close } = installBinarySafeListen(server, { defaultHost: "127.0.0.1", defaultPort: 0 }));
    const { port, url } = await server.listen(0, { host: "127.0.0.1" });
    expect(port).toBeGreaterThan(0);
    expect(url).toBe(`http://localhost:${port}/mcp`);

    const jpeg = fakeJpeg();
    const form = new FormData();
    form.append("images", new Blob([jpeg], { type: "image/jpeg" }), "pan.jpg");
    form.append("meal_type", "desayuno");
    const res = await fetch(`http://127.0.0.1:${port}/api/echo`, { method: "POST", body: form });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      size: jpeg.length,
      type: "image/jpeg",
      sha: sha256(jpeg),
      meal: "desayuno",
    });
  });

  it("sigue sirviendo JSON normal y usa host/puerto por defecto si listen() no los recibe", async () => {
    const app = new Hono();
    app.post("/mcp", async (c) => c.json({ echo: await c.req.json() }));

    const server = fakeServer(app);
    ({ close } = installBinarySafeListen(server, { defaultHost: "127.0.0.1", defaultPort: 0, basePath: "/mcp" }));
    const { port } = await server.listen();

    const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ echo: { jsonrpc: "2.0", method: "ping", id: 1 } });
  });
});
