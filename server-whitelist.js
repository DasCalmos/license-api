const dns = require("dns").promises;
const net = require("net");

const DNS_CACHE_MS = 5 * 60 * 1000;
const DNS_FAILURE_CACHE_MS = 30 * 1000;
const DNS_TIMEOUT_MS = 4000;
const cache = new Map();

function normalizeIp(value) {
    let ip = String(value || "").trim().toLowerCase();
    if (ip.startsWith("[") && ip.endsWith("]")) ip = ip.slice(1, -1);
    if (ip.startsWith("::ffff:") && net.isIP(ip.slice(7)) === 4) ip = ip.slice(7);
    const version = net.isIP(ip);
    if (!version) return "";
    if (version === 6) {
        try {
            return new URL(`http://[${ip}]`).hostname.slice(1, -1).toLowerCase();
        } catch {
            return ip;
        }
    }
    return ip;
}

function normalizeTarget(value) {
    const raw = String(value || "").trim().toLowerCase().replace(/\.$/, "");
    const ip = normalizeIp(raw);
    if (ip) return ip;
    if (raw.length < 1 || raw.length > 253 || raw.includes(":") || raw.includes("/")) return "";
    const labels = raw.split(".");
    if (labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return "";
    return labels.length >= 2 ? raw : "";
}

async function lookupWithTimeout(hostname, lookup = dns.lookup) {
    let timer;
    try {
        return await Promise.race([
            lookup(hostname, { all: true, verbatim: true }),
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(Object.assign(new Error("DNS lookup timed out"), { code: "ETIMEOUT" })), DNS_TIMEOUT_MS);
            })
        ]);
    } finally {
        clearTimeout(timer);
    }
}

async function resolveSrvWithTimeout(hostname, resolveSrv = dns.resolveSrv) {
    let timer;
    try {
        return await Promise.race([
            resolveSrv(`_minecraft._tcp.${hostname}`),
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(Object.assign(new Error("SRV lookup timed out"), { code: "ETIMEOUT" })), DNS_TIMEOUT_MS);
            })
        ]);
    } finally {
        clearTimeout(timer);
    }
}

async function resolveServerTarget(value, options = {}) {
    const target = normalizeTarget(value);
    if (!target) throw Object.assign(new Error("Invalid server IP or hostname"), { code: "EINVAL" });
    const directIp = normalizeIp(target);
    if (directIp) return { target, ips: [directIp], hosts: [], cached: false };

    const now = Date.now();
    const cached = cache.get(target);
    if (!options.force && cached && cached.expiresAt > now) {
        if (cached.error) throw Object.assign(new Error(cached.error.message), { code: cached.error.code });
        return { target, ips: [...cached.ips], hosts: [...(cached.hosts || [])], cached: true };
    }

    try {
        const lookup = options.lookup || dns.lookup;
        const resolveSrv = options.resolveSrv || dns.resolveSrv;
        const [directResult, srvResult] = await Promise.allSettled([
            lookupWithTimeout(target, lookup),
            resolveSrvWithTimeout(target, resolveSrv)
        ]);
        const directRecords = directResult.status === "fulfilled" ? directResult.value : [];
        const srvRecords = srvResult.status === "fulfilled" ? srvResult.value : [];
        const hosts = [...new Set(srvRecords.map(record => normalizeTarget(record.name)).filter(Boolean))];
        const srvAddressResults = await Promise.allSettled(hosts.map(host => lookupWithTimeout(host, lookup)));
        const srvAddresses = srvAddressResults.flatMap(result => result.status === "fulfilled" ? result.value : []);
        const ips = [...new Set([...directRecords, ...srvAddresses].map(record => normalizeIp(record.address)).filter(Boolean))];
        if (!ips.length) throw Object.assign(new Error("Hostname has no usable IP address"), { code: "ENODATA" });
        cache.set(target, { ips, hosts, expiresAt: now + DNS_CACHE_MS });
        return { target, ips, hosts, cached: false };
    } catch (error) {
        cache.set(target, {
            error: { code: error.code || "EDNS", message: error.message || "DNS lookup failed" },
            expiresAt: now + DNS_FAILURE_CACHE_MS
        });
        throw error;
    }
}

async function serverMatchesIp(target, clientIp, options = {}) {
    const normalizedClientIp = normalizeIp(clientIp);
    if (!normalizedClientIp) return { matches: false, ips: [], hosts: [] };
    try {
        const result = await resolveServerTarget(target, options);
        return { matches: result.ips.includes(normalizedClientIp), ips: result.ips, hosts: result.hosts || [] };
    } catch (error) {
        return { matches: false, ips: [], hosts: [], error };
    }
}

function clearDnsCache() {
    cache.clear();
}

module.exports = {
    normalizeIp,
    normalizeTarget,
    resolveServerTarget,
    serverMatchesIp,
    clearDnsCache
};
