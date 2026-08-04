const test = require("node:test");
const assert = require("node:assert/strict");
const {
    normalizeIp,
    normalizeTarget,
    resolveServerTarget,
    serverMatchesIp,
    clearDnsCache
} = require("../server-whitelist");

test("normalizes proxy and IPv6 address forms", () => {
    assert.equal(normalizeIp("::ffff:203.0.113.9"), "203.0.113.9");
    assert.equal(normalizeIp("2001:0DB8:0:0:0:0:0:1"), "2001:db8::1");
    assert.equal(normalizeIp("invalid"), "");
});

test("accepts IPs and hostnames but rejects URLs and ports", () => {
    assert.equal(normalizeTarget("FFAPRAC.DE."), "ffaprac.de");
    assert.equal(normalizeTarget("203.0.113.10"), "203.0.113.10");
    assert.equal(normalizeTarget("https://ffaprac.de"), "");
    assert.equal(normalizeTarget("ffaprac.de:25565"), "");
});

test("resolves and matches all addresses of a hostname", async () => {
    clearDnsCache();
    const lookup = async () => [
        { address: "203.0.113.10", family: 4 },
        { address: "2001:db8::10", family: 6 }
    ];
    const resolved = await resolveServerTarget("ffaprac.de", { lookup, resolveSrv: async () => [] });
    assert.deepEqual(resolved.ips, ["203.0.113.10", "2001:db8::10"]);
    const match = await serverMatchesIp("ffaprac.de", "::ffff:203.0.113.10", { lookup, resolveSrv: async () => [] });
    assert.equal(match.matches, true);
});

test("resolves Minecraft domains that only use an SRV record", async () => {
    clearDnsCache();
    const lookup = async hostname => {
        if (hostname === "ffaprac.de") throw Object.assign(new Error("no A record"), { code: "ENODATA" });
        assert.equal(hostname, "play.example.net");
        return [{ address: "198.51.100.42", family: 4 }];
    };
    const resolveSrv = async hostname => {
        assert.equal(hostname, "_minecraft._tcp.ffaprac.de");
        return [{ name: "play.example.net", port: 25565, priority: 10, weight: 0 }];
    };
    const resolved = await resolveServerTarget("ffaprac.de", { lookup, resolveSrv });
    assert.deepEqual(resolved.hosts, ["play.example.net"]);
    assert.deepEqual(resolved.ips, ["198.51.100.42"]);
});
