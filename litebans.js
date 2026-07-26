"use strict";

const config = {
    host: process.env.LITEBANS_DB_HOST || "62.72.177.23",
    port: Number(process.env.LITEBANS_DB_PORT) || 3306,
    database: process.env.LITEBANS_DB_NAME || "s6538_litebans",
    user: process.env.LITEBANS_DB_USER || "u6538_obShyClfxu",
    password: process.env.LITEBANS_DB_PASSWORD || "",
    prefix: process.env.LITEBANS_TABLE_PREFIX || "litebans_",
    ssl: process.env.LITEBANS_DB_SSL === "true"
};

const TYPES = Object.freeze(["bans", "mutes", "warnings", "kicks"]);
let pool;

function safePrefix(value) {
    return /^[A-Za-z0-9_]{1,32}$/.test(value) ? value : "litebans_";
}

function bitValue(value) {
    if (Buffer.isBuffer(value)) return value[0] !== 0;
    return Number(value) !== 0;
}

function getPool() {
    if (!config.password) return null;
    if (!pool) {
        // Loaded only after a password is configured, so local development and
        // the license API continue to work without LiteBans credentials.
        const mysql = require("mysql2/promise");
        pool = mysql.createPool({
            host: config.host,
            port: config.port,
            database: config.database,
            user: config.user,
            password: config.password,
            ssl: config.ssl ? {} : undefined,
            charset: "utf8mb4",
            timezone: "Z",
            connectTimeout: 5000,
            enableKeepAlive: true,
            waitForConnections: true,
            connectionLimit: 3,
            queueLimit: 0
        });
    }
    return pool;
}

async function fetchType(db, type, prefix, now) {
    const table = `\`${prefix}${type}\``;
    const history = `\`${prefix}history\``;
    const [rows] = await db.query(`
        SELECT
            p.id,
            p.uuid,
            COALESCE(
                (SELECT h.name FROM ${history} h WHERE h.uuid = p.uuid ORDER BY h.date DESC LIMIT 1),
                p.uuid
            ) AS player,
            p.reason,
            p.banned_by_name AS staff,
            p.time,
            p.until,
            p.active,
            p.server_origin
        FROM ${table} p
        WHERE p.uuid <> '#offline#' AND p.uuid IS NOT NULL
        ORDER BY p.time DESC
        LIMIT 25
    `);

    const activeWhere = type === "kicks"
        ? "p.uuid <> '#offline#' AND p.uuid IS NOT NULL"
        : "p.active = 1 AND (p.until < 1 OR p.until > ?) AND p.uuid <> '#offline#' AND p.uuid IS NOT NULL";
    const parameters = type === "kicks" ? [] : [now];
    const [[countRow]] = await db.query(
        `SELECT COUNT(*) AS count FROM ${table} p WHERE ${activeWhere}`,
        parameters
    );

    return {
        count: Number(countRow.count) || 0,
        records: rows.map(row => ({
            id: String(row.id),
            type,
            uuid: String(row.uuid || ""),
            player: String(row.player || "Unknown"),
            reason: String(row.reason || "No reason provided"),
            staff: String(row.staff || "Console"),
            time: Number(row.time) || 0,
            until: Number(row.until) || 0,
            server: String(row.server_origin || "Global"),
            active: type !== "kicks"
                && bitValue(row.active)
                && (Number(row.until) < 1 || Number(row.until) > now)
        }))
    };
}

async function getLiteBansSnapshot() {
    const db = getPool();
    if (!db) {
        return {
            configured: false,
            connected: false,
            stats: { bans: 0, mutes: 0, warnings: 0, kicks: 0 },
            records: [],
            error: "Add LITEBANS_DB_PASSWORD in Render to connect."
        };
    }

    try {
        const prefix = safePrefix(config.prefix);
        const now = Date.now();
        const results = await Promise.all(TYPES.map(type => fetchType(db, type, prefix, now)));
        const stats = {};
        const records = [];
        TYPES.forEach((type, index) => {
            stats[type] = results[index].count;
            records.push(...results[index].records);
        });
        records.sort((a, b) => b.time - a.time);
        return { configured: true, connected: true, stats, records, error: "" };
    } catch (error) {
        console.error("LiteBans database query failed:", error.code || error.message);
        return {
            configured: true,
            connected: false,
            stats: { bans: 0, mutes: 0, warnings: 0, kicks: 0 },
            records: [],
            error: "The LiteBans database could not be reached."
        };
    }
}

module.exports = { getLiteBansSnapshot };
