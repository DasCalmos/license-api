require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");

const app = express();

app.set("trust proxy", 1);

app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(helmet({ contentSecurityPolicy: false }));

const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
const MONGO_URI = process.env.MONGO_URI;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!ADMIN_USER || !ADMIN_PASS || !MONGO_URI || !SESSION_SECRET) {
    console.error("Missing environment variables: MONGO_URI, ADMIN_USER, ADMIN_PASS, SESSION_SECRET");
    process.exit(1);
}

mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log("Database Connected");
        await createFirstOwner();
    })
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

const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 32
    },
    passwordHash: {
        type: String,
        required: true
    },
    permissions: {
        viewKeys: { type: Boolean, default: true },
        addKeys: { type: Boolean, default: false },
        deleteKeys: { type: Boolean, default: false },
        manageUsers: { type: Boolean, default: false }
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const Key = mongoose.model("Key", KeySchema);
const User = mongoose.model("User", UserSchema);

async function createFirstOwner() {
    const count = await User.countDocuments();

    if (count > 0) {
        return;
    }

    const passwordHash = await bcrypt.hash(ADMIN_PASS, 12);

    await User.create({
        username: ADMIN_USER,
        passwordHash,
        permissions: {
            viewKeys: true,
            addKeys: true,
            deleteKeys: true,
            manageUsers: true
        }
    });

    console.log("First owner user created from ADMIN_USER / ADMIN_PASS");
}

async function requireLogin(req, res, next) {
    try {
        if (!req.session.userId) {
            return res.redirect("/login");
        }

        const user = await User.findById(req.session.userId);

        if (!user) {
            req.session.destroy(() => {});
            return res.redirect("/login");
        }

        req.currentUser = user;
        next();
    } catch (err) {
        console.error(err);
        res.status(500).send("ERROR");
    }
}

function requirePermission(permission) {
    return (req, res, next) => {
        if (!req.currentUser || !req.currentUser.permissions[permission]) {
            return res.status(403).send("No permission");
        }

        next();
    };
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

function isValidUsername(username) {
    return typeof username === "string"
        && username.length >= 3
        && username.length <= 32
        && /^[A-Za-z0-9_-]+$/.test(username);
}

function normalizePermissions(value) {
    return {
        viewKeys: Boolean(value && value.viewKeys),
        addKeys: Boolean(value && value.addKeys),
        deleteKeys: Boolean(value && value.deleteKeys),
        manageUsers: Boolean(value && value.manageUsers)
    };
}

app.get("/ping", (req, res) => {
    res.status(200).send("OK");
});

app.get("/", (req, res) => {
    res.redirect("/admin");
});

app.get("/login", (req, res) => {
    if (req.session.userId) {
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
        h1 { margin: 0 0 6px; font-size: 26px; text-align: center; }
        p { margin: 0 0 24px; text-align: center; color: #94a3b8; font-size: 14px; }
        label { display: block; margin: 14px 0 7px; color: #cbd5e1; font-size: 13px; }
        input {
            width: 100%;
            padding: 13px 14px;
            border: 1px solid #334155;
            border-radius: 10px;
            background: #020617;
            color: white;
            outline: none;
        }
        input:focus { border-color: #38bdf8; box-shadow: 0 0 0 3px rgba(56, 189, 248, .14); }
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
    </style>
</head>
<body>
    <form class="login" method="POST" action="/login">
        <div class="brand"></div>
        <h1>License Panel</h1>
        <p>Sign in to manage your license system</p>

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

app.post("/login", async (req, res) => {
    try {
        const username = String(req.body.user || "").trim();
        const password = String(req.body.pass || "");

        const user = await User.findOne({ username });

        if (!user) {
            return res.status(401).send("Invalid login");
        }

        const valid = await bcrypt.compare(password, user.passwordHash);

        if (!valid) {
            return res.status(401).send("Invalid login");
        }

        req.session.userId = user._id.toString();
        res.redirect("/admin");
    } catch (err) {
        console.error(err);
        res.status(500).send("ERROR");
    }
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
        const currentUser = req.currentUser;
        const perms = currentUser.permissions;

        const keys = perms.viewKeys
            ? await Key.find().sort({ createdAt: -1 })
            : [];

        const users = perms.manageUsers
            ? await User.find().sort({ createdAt: -1 })
            : [];

        res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>License Panel</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Inter, Arial, sans-serif; background: #020617; color: #e5e7eb; }
        header {
            border-bottom: 1px solid #1e293b;
            background: #0f172a;
            padding: 18px 28px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
        }
        main { max-width: 1050px; margin: 0 auto; padding: 28px; }
        h1, h2, h3 { margin: 0; }
        h1 { font-size: 22px; }
        h2 { font-size: 17px; margin-bottom: 16px; }
        h3 { font-size: 15px; margin-bottom: 12px; }
        .muted { color: #94a3b8; font-size: 14px; margin-top: 4px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 20px; }
        .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 14px; padding: 20px; margin-bottom: 20px; }
        .number { font-size: 34px; font-weight: 800; color: #38bdf8; line-height: 1; }
        .row { display: flex; justify-content: space-between; align-items: center; gap: 14px; padding: 13px 0; border-bottom: 1px solid #1e293b; }
        .row:last-child { border-bottom: 0; }
        .form-row { display: flex; gap: 10px; flex-wrap: wrap; }
        input {
            flex: 1;
            min-width: 180px;
            padding: 13px 14px;
            border: 1px solid #334155;
            border-radius: 10px;
            background: #020617;
            color: white;
            outline: none;
        }
        input:focus { border-color: #38bdf8; box-shadow: 0 0 0 3px rgba(56, 189, 248, .14); }
        button {
            padding: 11px 14px;
            border: 0;
            border-radius: 10px;
            font-weight: 700;
            cursor: pointer;
            white-space: nowrap;
        }
        .add { background: #22c55e; color: #052e16; }
        .delete { background: #ef4444; color: white; }
        .save { background: #38bdf8; color: #082f49; }
        .logout { background: #1e293b; color: #e5e7eb; }
        code { color: #bae6fd; word-break: break-all; }
        .checks { display: flex; gap: 12px; flex-wrap: wrap; margin: 12px 0; }
        .check {
            display: flex;
            align-items: center;
            gap: 7px;
            color: #cbd5e1;
            font-size: 14px;
        }
        .check input { min-width: auto; flex: none; }
        .pill { color: #bae6fd; background: #082f49; border-radius: 999px; padding: 5px 9px; font-size: 12px; }
        @media (max-width: 680px) {
            header, .row { align-items: stretch; flex-direction: column; }
            main { padding: 18px; }
            button { width: 100%; }
        }
    </style>
</head>
<body>
    <header>
        <div>
            <h1>License Panel</h1>
            <div class="muted">Logged in as ${escapeHtml(currentUser.username)}</div>
        </div>

        <form method="POST" action="/logout">
            <button class="logout">Logout</button>
        </form>
    </header>

    <main>
        <section class="grid">
            <div class="card">
                <div class="number">${keys.length}</div>
                <div class="muted">Visible keys</div>
            </div>
            <div class="card">
                <div class="number">${users.length || "-"}</div>
                <div class="muted">Manageable users</div>
            </div>
        </section>

        ${perms.addKeys ? `
        <section class="card">
            <h2>Add License Key</h2>
            <div class="form-row">
                <input id="key" placeholder="CALMO-XXXX-XXXX" maxlength="64">
                <button class="add" onclick="addKey()">Add Key</button>
            </div>
        </section>
        ` : ""}

        ${perms.viewKeys ? `
        <section class="card">
            <h2>License Keys</h2>

            ${keys.length === 0 ? `<div class="muted">No keys created yet.</div>` : ""}

            ${keys.map(k => `
                <div class="row">
                    <code>${escapeHtml(k.key)}</code>
                    ${perms.deleteKeys ? `<button class="delete key-delete" data-key="${escapeHtml(k.key)}">Delete</button>` : ""}
                </div>
            `).join("")}
        </section>
        ` : `
        <section class="card">
            <h2>License Keys</h2>
            <div class="muted">You do not have permission to view keys.</div>
        </section>
        `}

        ${perms.manageUsers ? `
        <section class="card">
            <h2>User Management</h2>

            <div class="card" style="background:#020617;margin-bottom:18px">
                <h3>Create User</h3>

                <div class="form-row">
                    <input id="newUsername" placeholder="Username">
                    <input id="newPassword" type="password" placeholder="Password">
                </div>

                <div class="checks">
                    <label class="check"><input id="permView" type="checkbox" checked> View keys</label>
                    <label class="check"><input id="permAdd" type="checkbox"> Add keys</label>
                    <label class="check"><input id="permDelete" type="checkbox"> Delete keys</label>
                    <label class="check"><input id="permUsers" type="checkbox"> Manage users</label>
                </div>

                <button class="add" onclick="createUser()">Create User</button>
            </div>

            ${users.map(u => `
                <div class="row user-row" data-id="${u._id}">
                    <div>
                        <strong>${escapeHtml(u.username)}</strong>
                        ${String(u._id) === String(currentUser._id) ? `<span class="pill">You</span>` : ""}
                        <div class="checks">
                            <label class="check"><input class="p-viewKeys" type="checkbox" ${u.permissions.viewKeys ? "checked" : ""}> View</label>
                            <label class="check"><input class="p-addKeys" type="checkbox" ${u.permissions.addKeys ? "checked" : ""}> Add</label>
                            <label class="check"><input class="p-deleteKeys" type="checkbox" ${u.permissions.deleteKeys ? "checked" : ""}> Delete</label>
                            <label class="check"><input class="p-manageUsers" type="checkbox" ${u.permissions.manageUsers ? "checked" : ""}> Users</label>
                        </div>
                    </div>

                    <div>
                        <button class="save user-save">Save</button>
                        ${String(u._id) !== String(currentUser._id) ? `<button class="delete user-delete">Delete</button>` : ""}
                    </div>
                </div>
            `).join("")}
        </section>
        ` : ""}
    </main>

    <script>
        async function request(url, body) {
            const res = await fetch(url, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                alert(await res.text());
                return false;
            }

            location.reload();
            return true;
        }

        async function addKey() {
            const input = document.getElementById("key");
            const key = input.value.trim();

            if (!key) {
                alert("Please enter a key.");
                return;
            }

            await request("/api/add", { key });
        }

        async function removeKey(key) {
            if (!confirm("Delete this key?")) return;
            await request("/api/remove", { key });
        }

        async function createUser() {
            const username = document.getElementById("newUsername").value.trim();
            const password = document.getElementById("newPassword").value;

            if (!username || !password) {
                alert("Username and password required.");
                return;
            }

            await request("/api/users/add", {
                username,
                password,
                permissions: {
                    viewKeys: document.getElementById("permView").checked,
                    addKeys: document.getElementById("permAdd").checked,
                    deleteKeys: document.getElementById("permDelete").checked,
                    manageUsers: document.getElementById("permUsers").checked
                }
            });
        }

        async function saveUser(row) {
            await request("/api/users/update", {
                id: row.dataset.id,
                permissions: {
                    viewKeys: row.querySelector(".p-viewKeys").checked,
                    addKeys: row.querySelector(".p-addKeys").checked,
                    deleteKeys: row.querySelector(".p-deleteKeys").checked,
                    manageUsers: row.querySelector(".p-manageUsers").checked
                }
            });
        }

        async function deleteUser(row) {
            if (!confirm("Delete this user?")) return;
            await request("/api/users/remove", { id: row.dataset.id });
        }

        document.querySelectorAll(".key-delete").forEach(button => {
            button.addEventListener("click", () => removeKey(button.dataset.key));
        });

        document.querySelectorAll(".user-save").forEach(button => {
            button.addEventListener("click", () => saveUser(button.closest(".user-row")));
        });

        document.querySelectorAll(".user-delete").forEach(button => {
            button.addEventListener("click", () => deleteUser(button.closest(".user-row")));
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

app.post("/api/add", requireLogin, requirePermission("addKeys"), async (req, res) => {
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

app.post("/api/remove", requireLogin, requirePermission("deleteKeys"), async (req, res) => {
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

app.post("/api/users/add", requireLogin, requirePermission("manageUsers"), async (req, res) => {
    try {
        const username = String(req.body.username || "").trim();
        const password = String(req.body.password || "");
        const permissions = normalizePermissions(req.body.permissions);

        if (!isValidUsername(username)) {
            return res.status(400).send("Invalid username");
        }

        if (password.length < 8 || password.length > 128) {
            return res.status(400).send("Password must be 8-128 characters");
        }

        const passwordHash = await bcrypt.hash(password, 12);

        await User.create({
            username,
            passwordHash,
            permissions
        });

        res.send("USER CREATED");
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).send("User already exists");
        }

        console.error(err);
        res.status(500).send("ERROR");
    }
});

app.post("/api/users/update", requireLogin, requirePermission("manageUsers"), async (req, res) => {
    try {
        const id = String(req.body.id || "");
        const permissions = normalizePermissions(req.body.permissions);

        const target = await User.findById(id);

        if (!target) {
            return res.status(404).send("User not found");
        }

        if (target.permissions.manageUsers && !permissions.manageUsers) {
            const managerCount = await User.countDocuments({ "permissions.manageUsers": true });

            if (managerCount <= 1) {
                return res.status(400).send("At least one user must keep manage users permission");
            }
        }

        target.permissions = permissions;
        await target.save();

        res.send("USER UPDATED");
    } catch (err) {
        console.error(err);
        res.status(500).send("ERROR");
    }
});

app.post("/api/users/remove", requireLogin, requirePermission("manageUsers"), async (req, res) => {
    try {
        const id = String(req.body.id || "");

        if (id === String(req.currentUser._id)) {
            return res.status(400).send("You cannot delete yourself");
        }

        const target = await User.findById(id);

        if (!target) {
            return res.status(404).send("User not found");
        }

        if (target.permissions.manageUsers) {
            const managerCount = await User.countDocuments({ "permissions.manageUsers": true });

            if (managerCount <= 1) {
                return res.status(400).send("At least one user must keep manage users permission");
            }
        }

        await User.deleteOne({ _id: id });

        res.send("USER REMOVED");
    } catch (err) {
        console.error(err);
        res.status(500).send("ERROR");
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("API läuft auf Port " + PORT);
});
