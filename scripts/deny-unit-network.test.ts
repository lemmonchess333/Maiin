import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("unit test network isolation", () => {
  it("blocks TCP and TLS in child processes before sockets open", () => {
    const result = spawnSync(process.execPath, ["-e", `
      const assert = require('node:assert/strict');
      const net = require('node:net');
      const tls = require('node:tls');
      for (const attempt of [
        () => net.connect({ host: '127.0.0.1', port: 9 }),
        () => new net.Socket().connect(9, '127.0.0.1'),
        () => tls.connect({ host: '127.0.0.1', port: 9 }),
      ]) assert.throws(attempt, { code: 'ERR_TEST_NETWORK_DISABLED' });
    `], { encoding: "utf8" });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});
