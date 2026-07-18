require("dotenv").config();

const crypto = require("crypto");
const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const { renderLogin, renderAdmin } = require("./views");

const app = express();
const isProduction = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_USER = process.env.ADMIN_USER || "user";
const ADMIN_PASS = process.env.ADMIN_PASS;
const MONGO_URI = process.env.MONGO_URI;
const SESSION_SECRET = process.env.SESSION_SECRET;
const SESSION_IDLE_MS = 30 * 60 * 1000;
const SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const LOGIN_BUCKET_LIMIT = 10000;
const loginAttempts = new Map();
const dummyPasswordHash = bcrypt.hash("dummy-password-never-used", 12);

if (!ADMIN_PASS || !MONGO_URI || !SESSION_SECRET) {
    console.error("Missing environment variables: MONGO_URI, ADMIN_PASS, SESSION_SECRET");
    process.exit(1);
}

if (SESSION_SECRET.length < 32) {
    console.error("SESSION_SECRET must contain at least 32 characters");
    process.exit(1);
}

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'none'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"]
        }
    },
    crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: "20kb", strict: true }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));
app.use("/assets", express.static(path.join(__dirname, "public"), {
    etag: true,
    immutable: isProduction,
    maxAge: isProduction ? "1h" : 0,
    index: false
}));

app.use(session({
    name: isProduction ? "__Host-license.sid" : "license.sid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: MongoStore.create({
        mongoUrl: MONGO_URI,
        collectionName: "sessions",
        ttl: SESSION_IDLE_MS / 1000
    }),
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        path: "/",
        maxAge: SESSION_IDLE_MS
    }
}));

const KeySchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, trim: true, maxlength: 64 },
    createdAt: { type: Date, default: Date.now }
});

const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 32
    },
    passwordHash: { type: String, required: true },
    isOwner: { type: Boolean, default: false },
    permissions: {
        viewKeys: { type: Boolean, default: true },
        addKeys: { type: Boolean, default: false },
        deleteKeys: { type: Boolean, default: false },
        manageUsers: { type: Boolean, default: false }
    },
    createdAt: { type: Date, default: Date.now }
});

const Key = mongoose.model("Key", KeySchema);
const User = mongoose.model("User", UserSchema);

function isValidKey(key) {
    return typeof key === "string"
        && key.length >= 4
        && key.length <= 64
        && /^[A-Za-z0-9_-]+$/.test(key);
}

function isValidUsername(username) {
    return typeof username === "string"
        && username.length >= 3
        && username.length <= 32
        && /^[A-Za-z0-9_-]+$/.test(username);
}

function isValidPassword(password) {
    const bytes = Buffer.byteLength(password, "utf8");
    return password.length >= 10 && password.length <= 128 && bytes <= 72;
}

function normalizePermissions(value) {
    return {
        viewKeys: value?.viewKeys === true,
        addKeys: value?.addKeys === true,
        deleteKeys: value?.deleteKeys === true,
        manageUsers: value?.manageUsers === true
    };
}

function ensureCsrfToken(req) {
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString("hex");
    }
    return req.session.csrfToken;
}

function requireCsrf(req, res, next) {
    const expected = req.session?.csrfToken;
    const supplied = String(req.get("x-csrf-token") || req.body?._csrf || "");
    if (!expected || supplied.length !== expected.length) {
        return res.status(403).send("Invalid security token");
    }
    if (!crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
        return res.status(403).send("Invalid security token");
    }
    next();
}

function regenerateSession(req) {
    return new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
}

function saveSession(req) {
    return new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
}

async function requireLogin(req, res, next) {
    try {
        if (!req.session.userId || !req.session.authenticatedAt) {
            if (req.path.startsWith("/api/")) return res.status(401).send("Session expired");
            return res.redirect("/login");
        }
        if (Date.now() - req.session.authenticatedAt > SESSION_ABSOLUTE_MS) {
            if (req.path.startsWith("/api/")) {
                return req.session.destroy(() => res.status(401).send("Session expired"));
            }
            return req.session.destroy(() => res.redirect("/login?expired=1"));
        }
        const user = await User.findById(req.session.userId);
        if (!user) {
            return req.session.destroy(() => res.redirect("/login"));
        }
        if (user.isOwner) {
            user.permissions = { viewKeys: true, addKeys: true, deleteKeys: true, manageUsers: true };
        }
        req.currentUser = user;
        next();
    } catch (err) {
        next(err);
    }
}

function requirePermission(permission) {
    return (req, res, next) => {
        if (!req.currentUser?.permissions?.[permission]) {
            return res.status(403).send("No permission");
        }
        next();
    };
}

function loginBucket(req, username) {
    return `${req.ip}:${username.toLowerCase()}`;
}

function checkLoginLimit(key) {
    const now = Date.now();
    const record = loginAttempts.get(key);
    if (!record) return 0;
    if (record.blockedUntil > now) return record.blockedUntil - now;
    if (now - record.firstAttempt > LOGIN_WINDOW_MS) {
        loginAttempts.delete(key);
        return 0;
    }
    return 0;
}

function recordLoginFailure(key) {
    const now = Date.now();
    const record = loginAttempts.get(key);
    const next = !record || now - record.firstAttempt > LOGIN_WINDOW_MS
        ? { count: 1, firstAttempt: now, blockedUntil: 0 }
        : { ...record, count: record.count + 1 };
    if (next.count >= LOGIN_MAX_ATTEMPTS) next.blockedUntil = now + LOGIN_BLOCK_MS;
    loginAttempts.set(key, next);
    if (loginAttempts.size > LOGIN_BUCKET_LIMIT) {
        for (const [bucket, value] of loginAttempts) {
            if (now - value.firstAttempt > LOGIN_WINDOW_MS && value.blockedUntil <= now) {
                loginAttempts.delete(bucket);
            }
        }
        while (loginAttempts.size > LOGIN_BUCKET_LIMIT) {
            loginAttempts.delete(loginAttempts.keys().next().value);
        }
    }
}

async function createOrMigrateOwner() {
    const existingOwner = await User.findOne({ isOwner: true });
    if (existingOwner) {
        existingOwner.permissions = { viewKeys: true, addKeys: true, deleteKeys: true, manageUsers: true };
        await existingOwner.save();
        return;
    }

    const existingUser = await User.findOne().sort({ "permissions.manageUsers": -1, createdAt: 1 });
    if (existingUser) {
        existingUser.isOwner = true;
        existingUser.permissions = { viewKeys: true, addKeys: true, deleteKeys: true, manageUsers: true };
        await existingUser.save();
        console.log(`Owner protection assigned to ${existingUser.username}`);
        return;
    }

    const passwordHash = await bcrypt.hash(ADMIN_PASS, 12);
    await User.create({
        username: ADMIN_USER,
        passwordHash,
        isOwner: true,
        permissions: { viewKeys: true, addKeys: true, deleteKeys: true, manageUsers: true }
    });
    console.log("First owner user created from ADMIN_USER / ADMIN_PASS");
}

app.get("/ping", (req, res) => res.status(200).type("text/plain").send("OK"));
app.get("/", (req, res) => res.redirect("/admin"));

app.get("/login", (req, res) => {
    if (req.session.userId) return res.redirect("/admin");
    res.set("Cache-Control", "no-store");
    const message = req.query.expired === "1" ? "Your session expired. Please sign in again." : "";
    res.status(200).send(renderLogin({ csrfToken: ensureCsrfToken(req), message }));
});

app.post("/login", requireCsrf, async (req, res, next) => {
    try {
        const username = String(req.body.user || "").trim();
        const password = String(req.body.pass || "");
        const bucket = loginBucket(req, username);
        const waitMs = checkLoginLimit(bucket);
        if (waitMs > 0) {
            res.set("Retry-After", String(Math.ceil(waitMs / 1000)));
            return res.status(429).send(renderLogin({
                csrfToken: ensureCsrfToken(req),
                message: "Too many attempts. Please wait a few minutes."
            }));
        }

        const user = isValidUsername(username) ? await User.findOne({ username }) : null;
        const valid = await bcrypt.compare(password, user ? user.passwordHash : await dummyPasswordHash);
        if (!user || !valid) {
            recordLoginFailure(bucket);
            return res.status(401).send(renderLogin({
                csrfToken: ensureCsrfToken(req),
                message: "Username or password is incorrect."
            }));
        }

        loginAttempts.delete(bucket);
        await regenerateSession(req);
        req.session.userId = user._id.toString();
        req.session.authenticatedAt = Date.now();
        req.session.csrfToken = crypto.randomBytes(32).toString("hex");
        await saveSession(req);
        res.redirect("/admin");
    } catch (err) {
        next(err);
    }
});

app.post("/logout", requireLogin, requireCsrf, (req, res) => {
    req.session.destroy(() => {
        res.clearCookie(isProduction ? "__Host-license.sid" : "license.sid", { path: "/" });
        res.redirect("/login");
    });
});

// Public compatibility endpoint used by existing Java plugins. Keep route, method and responses stable.
app.get("/license", async (req, res) => {
    try {
        res.set("Cache-Control", "no-store");
        const key = String(req.query.key || "").trim();
        if (!isValidKey(key)) return res.type("text/plain").send("INVALID");
        const exists = await Key.exists({ key });
        return res.type("text/plain").send(exists ? "VALID" : "INVALID");
    } catch (err) {
        console.error("License check failed:", err.message);
        return res.type("text/plain").send("ERROR");
    }
});

app.get("/admin", requireLogin, async (req, res, next) => {
    try {
        res.set("Cache-Control", "no-store");
        const perms = req.currentUser.permissions;
        const [keys, users, totalKeys, totalUsers] = await Promise.all([
            perms.viewKeys ? Key.find().sort({ createdAt: -1 }).lean() : [],
            perms.manageUsers ? User.find().sort({ isOwner: -1, createdAt: 1 }).lean() : [],
            Key.countDocuments(),
            User.countDocuments()
        ]);
        res.send(renderAdmin({
            currentUser: req.currentUser.toObject(),
            keys,
            users,
            totalKeys,
            totalUsers,
            csrfToken: ensureCsrfToken(req)
        }));
    } catch (err) {
        next(err);
    }
});

app.post("/api/add", requireLogin, requireCsrf, requirePermission("addKeys"), async (req, res, next) => {
    try {
        const key = String(req.body.key || "").trim();
        if (!isValidKey(key)) return res.status(400).send("Invalid key format");
        await Key.updateOne({ key }, { $setOnInsert: { key } }, { upsert: true });
        res.send("ADDED");
    } catch (err) {
        next(err);
    }
});

app.post("/api/remove", requireLogin, requireCsrf, requirePermission("deleteKeys"), async (req, res, next) => {
    try {
        const key = String(req.body.key || "").trim();
        if (!isValidKey(key)) return res.status(400).send("Invalid key format");
        await Key.deleteOne({ key });
        res.send("REMOVED");
    } catch (err) {
        next(err);
    }
});

app.post("/api/users/add", requireLogin, requireCsrf, requirePermission("manageUsers"), async (req, res, next) => {
    try {
        const username = String(req.body.username || "").trim();
        const password = String(req.body.password || "");
        if (!isValidUsername(username)) return res.status(400).send("Invalid username");
        if (!isValidPassword(password)) {
            return res.status(400).send("Password must be 10-128 characters and at most 72 UTF-8 bytes");
        }
        await User.create({
            username,
            passwordHash: await bcrypt.hash(password, 12),
            permissions: normalizePermissions(req.body.permissions)
        });
        res.send("USER CREATED");
    } catch (err) {
        if (err.code === 11000) return res.status(409).send("User already exists");
        next(err);
    }
});

app.post("/api/users/update", requireLogin, requireCsrf, requirePermission("manageUsers"), async (req, res, next) => {
    try {
        const id = String(req.body.id || "");
        if (!mongoose.isValidObjectId(id)) return res.status(400).send("Invalid user ID");
        const target = await User.findById(id);
        if (!target) return res.status(404).send("User not found");
        if (target.isOwner) return res.status(400).send("Admin permissions are fixed");
        const permissions = normalizePermissions(req.body.permissions);
        target.permissions = permissions;
        await target.save();
        res.send("USER UPDATED");
    } catch (err) {
        next(err);
    }
});

app.post("/api/users/remove", requireLogin, requireCsrf, requirePermission("manageUsers"), async (req, res, next) => {
    try {
        const id = String(req.body.id || "");
        if (!mongoose.isValidObjectId(id)) return res.status(400).send("Invalid user ID");
        if (id === String(req.currentUser._id)) return res.status(400).send("You cannot delete yourself");
        const target = await User.findById(id);
        if (!target) return res.status(404).send("User not found");
        if (target.isOwner) return res.status(400).send("The owner account cannot be deleted");
        await User.deleteOne({ _id: id });
        res.send("USER REMOVED");
    } catch (err) {
        next(err);
    }
});

app.use((req, res) => res.status(404).send("Not found"));
app.use((err, req, res, next) => {
    console.error("Request failed:", err);
    if (res.headersSent) return next(err);
    if (err.type === "entity.parse.failed") return res.status(400).send("Invalid request body");
    res.status(500).send("ERROR");
});

mongoose.connect(MONGO_URI)
    .then(async () => {
        await createOrMigrateOwner();
        app.listen(PORT, () => console.log(`License API running on port ${PORT}`));
    })
    .catch(err => {
        console.error("Database connection failed:", err.message);
        process.exit(1);
    });
