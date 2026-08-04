const path = require("path");
const express = require("express");
const { renderAdmin } = require("../views");

const permissions = {
    viewKeys: true,
    addKeys: true,
    deleteKeys: true,
    manageUsers: true,
    viewLiteBans: false,
    viewServers: true,
    manageServers: true
};
const keys = [
    { _id: "66a000000000000000000001", key: "CALMO-FFA1-2026-PROD", createdAt: new Date(), legacyEnabled: true, legacyChecks: 182, secureChecks: 11, lastLegacyCheckAt: new Date() },
    { _id: "66a000000000000000000002", key: "CALMO-LOBBY-2026-PROD", createdAt: new Date(), legacyEnabled: false, legacyChecks: 52, secureChecks: 847, lastLegacyCheckAt: new Date(Date.now() - 86400000 * 8) }
];
const servers = [
    { _id: "66b000000000000000000001", name: "FFA Practice", target: "ffaprac.de", license: { _id: keys[0]._id, key: keys[0].key }, enabled: true, resolvedIps: [], lastSeenAt: null },
    { _id: "66b000000000000000000002", name: "Lobby Network", target: "203.0.113.24", license: { _id: keys[1]._id, key: keys[1].key }, enabled: true, resolvedIps: ["203.0.113.24"], lastSeenAt: new Date(), lastSeenIp: "203.0.113.24" }
];

const app = express();
app.use("/assets", express.static(path.join(__dirname, "..", "public")));
app.get("/", (req, res) => res.send(renderAdmin({
    currentUser: { _id: "u1", username: "admin", isOwner: true, permissions },
    keys,
    users: [],
    servers,
    totalKeys: keys.length,
    totalUsers: 1,
    totalServers: servers.length,
    csrfToken: "preview"
})));
app.listen(4173, "127.0.0.1", () => console.log("PREVIEW_READY"));
