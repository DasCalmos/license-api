require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const helmet = require("helmet");

const app = express();

app.set("trust proxy", 1);

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(helmet({
    contentSecurityPolicy: false
}));

const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
const MONGO_URI = process.env.MONGO_URI;
const SESSION_SECRET = process.env.SESSION_SECRET || "change-this-secret";

if (!ADMIN_USER || !ADMIN_PASS || !MONGO_URI) {
    console.error("Missing environment variables: MONGO_URI, ADMIN_USER, ADMIN_PASS");
    process.exit(1);
}

mongoose.connect(MONGO_URI)
    .then(() => console.log("Database Connected"))
    .catch(err => {
        console.error("Database Error:", err);
        process.exit(1);
    });

app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: MongoStore.create({
        mongoUrl: MONGO_URI,
        collectionName: "sessions",
        ttl: 30 * 60
    }),
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 30
    }
}));

const KeySchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        maxlength: 64
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Key = mongoose.model("Key", KeySchema);

function requireLogin(req, res, next) {
    if (req.session.loggedIn) {
        return next();
    }

    return res.redirect("/login");
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function isValidKey(key) {
    return typeof key === "string"
        && key.length >= 4
        && key.length <= 64
        && /^[A-Za-z0-9_-]+$/.test(key);
}

app.get("/ping", (req, res) => {
    res.status(200).send("OK");
});

app.get("/", (req, res) => {
    res.redirect("/admin");
});

app.get("/login", (req, res) => {
    if (req.session.loggedIn) {
        return res.redirect("/admin");
    }

    res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>License Login</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { box-sizing: border-box; }

        body {
            margin: 0;
            min-height: 100vh;
            font-family: Inter, Arial, sans-serif;
            background:
                radial-gradient(circle at top left, rgba(56,189,248,.22), transparent 34%),
                radial-gradient(circle at bottom right, rgba(34,197,94,.14), transparent 28%),
                #020617;
            color: #e5e7eb;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
        }

        .login {
            width: 100%;
            max-width: 380px;
            background: rgba(15, 23, 42, .94);
            border: 1px solid rgba(148, 163, 184, .18);
            border-radius: 18px;
            padding: 30px;
            box-shadow: 0 24px 80px rgba(0, 0, 0, .45);
        }

        .brand {
            width: 48px;
            height: 48px;
            border-radius: 14px;
            background: linear-gradient(135deg, #38bdf8, #22c55e);
            margin: 0 auto 18px;
        }

        h1 {
            margin: 0 0 6px;
            font-size: 26px;
            text-align: center;
        }

        p {
            margin: 0 0 24px;
            text-align: center;
            color: #94a3b8;
            font-size: 14px;
        }

        label {
            display: block;
            margin: 14px 0 7px;
            color: #cbd5e1;
            font-size: 13px;
        }

        input {
            width: 100%;
            padding: 13px 14px;
            border: 1px solid #334155;
            border-radius: 10px;
            background: #020617;
            color: white;
            outline: none;
        }

        input:focus {
            border-color: #38bdf8;
            box-shadow: 0 0 0 3px rgba(56, 189, 248, .14);
        }

        button {
            width: 100%;
            margin-top: 22px;
            padding: 13px;
            border: 0;
            border-radius: 10px;
            background: linear-gradient(135deg, #38bdf8, #22c55e);
            color: #020617;
            font-weight: 800;
            cursor: pointer;
        }

        button:hover {
            filter: brightness(1.05);
        }
    </style>
</head>
<body>
    <form class="login" method="POST" action="/login">
        <div class="brand"></div>

        <h1>License Panel</h1>
        <p>Sign in to manage your license keys</p>

        <label>Username</label>
        <input name="user" autocomplete="username" required>

        <label>Password</label>
        <input name="pass" type="password" autocomplete="current-password" required>

        <button>Login</button>
    </form>
</body>
</html>
    `);
});

app.post("/login", (req, res) => {
    const { user, pass } = req.body;

    if (user === ADMIN_USER && pass === ADMIN_PASS) {
        req.session.loggedIn = true;
        return res.redirect("/admin");
    }

    return res.status(401).send("Invalid login");
});

app.post("/logout", requireLogin, (req, res) => {
    req.session.destroy(() => {
        res.redirect("/login");
    });
});

app.get("/license", async (req, res) => {
    try {
        const key = String(req.query.key || "").trim();

        if (!isValidKey(key)) {
            return res.send("INVALID");
        }

        const exists = await Key.exists({ key });

        return res.send(exists ? "VALID" : "INVALID");
    } catch (err) {
        console.error(err);
        return res.send("ERROR");
    }
});

app.get("/admin", requireLogin, async (req, res) => {
    try {
        const keys = await Key.find().sort({ createdAt: -1 });

        res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>License Panel</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { box-sizing: border-box; }

        body {
            margin: 0;
            font-family: Inter, Arial, sans-serif;
            background: #020617;
            color: #e5e7eb;
        }

        header {
            border-bottom: 1px solid #1e293b;
            background: #0f172a;
            padding: 18px 28px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
        }

        h1, h2 { margin: 0; }

        h1 {
            font-size: 22px;
        }

        h2 {
            font-size: 17px;
            margin-bottom: 16px;
        }

        main {
            max-width: 980px;
            margin: 0 auto;
            padding: 28px;
        }

        .muted {
            color: #94a3b8;
            font-size: 14px;
            margin-top: 4px;
        }

        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 16px;
            margin-bottom: 20px;
        }

        .card {
            background: #0f172a;
            border: 1px solid #1e293b;
            border-radius: 14px;
            padding: 20px;
        }

        .number {
            font-size: 34px;
            font-weight: 800;
            color: #38bdf8;
            line-height: 1;
        }

        .add {
            display: flex;
            gap: 10px;
        }

        input {
            flex: 1;
            min-width: 0;
            padding: 13px 14px;
            border: 1px solid #334155;
            border-radius: 10px;
            background: #020617;
            color: white;
            outline: none;
        }

        input:focus {
            border-color: #38bdf8;
            box-shadow: 0 0 0 3px rgba(56, 189, 248, .14);
        }

        button {
            padding: 11px 14px;
            border: 0;
            border-radius: 10px;
            font-weight: 700;
            cursor: pointer;
            white-space: nowrap;
        }

        button:hover {
            filter: brightness(1.08);
        }

        .add-btn {
            background: #22c55e;
            color: #052e16;
        }

        .logout {
            background: #1e293b;
            color: #e5e7eb;
        }

        .delete {
            background: #ef4444;
            color: white;
        }

        .key-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 14px;
            padding: 13px 0;
            border-bottom: 1px solid #1e293b;
        }

        .key-row:last-child {
            border-bottom: 0;
        }

        code {
            color: #bae6fd;
            word-break: break-all;
        }

        .panel {
            margin-bottom: 20px;
        }

        @media (max-width: 640px) {
            header {
                align-items: stretch;
                flex-direction: column;
            }

            main {
                padding: 18px;
            }

            .add {
                flex-direction: column;
            }

            .key-row {
                align-items: stretch;
                flex-direction: column;
            }
        }
    </style>
</head>
<body>
    <header>
        <div>
            <h1>License Panel</h1>
            <div class="muted">Manage CalmoRestart license keys</div>
        </div>

        <form method="POST" action="/logout">
            <button class="logout">Logout</button>
        </form>
    </header>

    <main>
        <section class="stats">
            <div class="card">
                <div class="number">${keys.length}</div>
                <div class="muted">Active keys</div>
            </div>

            <div class="card">
                <div class="number">OK</div>
                <div class="muted">API status</div>
            </div>
        </section>

        <section class="card panel">
            <h2>Add License Key</h2>

            <div class="add">
                <input id="key" placeholder="CALMO-XXXX-XXXX" maxlength="64">
                <button class="add-btn" onclick="addKey()">Add Key</button>
            </div>
        </section>

        <section class="card">
            <h2>License Keys</h2>

            ${keys.length === 0 ? `<div class="muted">No keys created yet.</div>` : ""}

            ${keys.map(k => `
                <div class="key-row">
                    <code>${escapeHtml(k.key)}</code>
                    <button class="delete" data-key="${escapeHtml(k.key)}">Delete</button>
                </div>
            `).join("")}
        </section>
    </main>

    <script>
        async function addKey() {
            const input = document.getElementById("key");
            const key = input.value.trim();

            if (!key) {
                alert("Please enter a key.");
                return;
            }

            const res = await fetch("/api/add", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({ key })
            });

            if (!res.ok) {
                alert(await res.text());
                return;
            }

            location.reload();
        }

        async function removeKey(key) {
            if (!confirm("Delete this key?")) return;

            const res = await fetch("/api/remove", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({ key })
            });

            if (!res.ok) {
                alert(await res.text());
                return;
            }

            location.reload();
        }

        document.querySelectorAll(".delete").forEach(button => {
            button.addEventListener("click", () => {
                removeKey(button.dataset.key);
            });
        });
    </script>
</body>
</html>
        `);
    } catch (err) {
        console.error(err);
        res.status(500).send("ERROR");
    }
});

app.post("/api/add", requireLogin, async (req, res) => {
    try {
        const key = String(req.body.key || "").trim();

        if (!isValidKey(key)) {
            return res.status(400).send("Invalid key format");
        }

        await Key.updateOne(
            { key },
            { $setOnInsert: { key } },
            { upsert: true }
        );

        res.send("ADDED");
    } catch (err) {
        console.error(err);
        res.status(500).send("ERROR");
    }
});

app.post("/api/remove", requireLogin, async (req, res) => {
    try {
        const key = String(req.body.key || "").trim();

        if (!isValidKey(key)) {
            return res.status(400).send("Invalid key format");
        }

        await Key.deleteOne({ key });

        res.send("REMOVED");
    } catch (err) {
        console.error(err);
        res.status(500).send("ERROR");
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("API läuft auf Port " + PORT);
});
