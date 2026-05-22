require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const helmet = require("helmet");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet());

app.use(session({
    secret: process.env.SESSION_SECRET || "change-this-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: 1000 * 60 * 60 * 4
    }
}));

const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
const MONGO_URI = process.env.MONGO_URI;

if (!ADMIN_USER || !ADMIN_PASS || !MONGO_URI) {
    console.error("Missing .env values");
    process.exit(1);
}

mongoose.connect(MONGO_URI)
    .then(() => console.log("Database Connected"))
    .catch(err => console.error("Database Error:", err));

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
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>License Login</title>
</head>
<body style="margin:0;background:#0f172a;color:white;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh">

    <form method="POST" action="/login" style="background:#111827;padding:32px;border-radius:12px;width:320px;box-shadow:0 20px 50px rgba(0,0,0,.35)">
        <h1 style="margin-top:0;text-align:center">License Panel</h1>

        <label>Username</label>
        <input name="user" autocomplete="username" style="width:100%;padding:12px;margin:8px 0 16px;border-radius:8px;border:0" required>

        <label>Password</label>
        <input name="pass" type="password" autocomplete="current-password" style="width:100%;padding:12px;margin:8px 0 20px;border-radius:8px;border:0" required>

        <button style="width:100%;padding:12px;border:0;border-radius:8px;background:#38bdf8;color:#020617;font-weight:bold;cursor:pointer">
            Login
        </button>
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
</head>
<body style="margin:0;background:#0f172a;color:white;font-family:Arial,sans-serif">

    <div style="max-width:800px;margin:40px auto;padding:24px">
        <div style="display:flex;justify-content:space-between;align-items:center">
            <h1>License Panel</h1>

            <form method="POST" action="/logout">
                <button style="padding:10px 14px;border:0;border-radius:8px;background:#ef4444;color:white;cursor:pointer">
                    Logout
                </button>
            </form>
        </div>

        <div style="background:#111827;padding:20px;border-radius:12px;margin-bottom:24px">
            <h2>Add Key</h2>

            <input id="key" placeholder="New license key" maxlength="64" style="width:100%;padding:12px;border-radius:8px;border:0;margin-bottom:12px">

            <button onclick="addKey()" style="padding:12px 16px;border:0;border-radius:8px;background:#22c55e;color:#052e16;font-weight:bold;cursor:pointer">
                Add
            </button>
        </div>

        <div style="background:#111827;padding:20px;border-radius:12px">
            <h2>Keys</h2>

            ${keys.length === 0 ? "<p>No keys found.</p>" : ""}

            ${keys.map(k => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid #334155">
                    <code>${escapeHtml(k.key)}</code>

                    <button onclick="removeKey('${escapeHtml(k.key)}')" style="padding:8px 12px;border:0;border-radius:8px;background:#ef4444;color:white;cursor:pointer">
                        Delete
                    </button>
                </div>
            `).join("")}
        </div>
    </div>

    <script>
        async function addKey() {
            const key = document.getElementById("key").value.trim();

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
