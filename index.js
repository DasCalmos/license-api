const express = require("express");
const app = express();

app.use(express.json());

// 🔑 IN-MEMORY LICENSE KEYS
let keys = [
    "CALMO-AB12-CD34",
    "CALMO-X9F2-KL88",
    "CALMO-9999-AAAA"
];


// =========================
// 🔐 LICENSE CHECK (PLUGIN)
// =========================
app.get("/license", (req, res) => {
    const key = req.query.key;

    if (!key) return res.send("INVALID");

    if (keys.includes(key)) {
        return res.send("VALID");
    }

    res.send("INVALID");
});


// =========================
// ➕ ADD KEY
// =========================
app.post("/api/add", (req, res) => {
    const key = req.body.key;

    if (!key) return res.send("NO KEY");

    if (!keys.includes(key)) {
        keys.push(key);
    }

    res.send("ADDED");
});


// =========================
// ❌ REMOVE KEY
// =========================
app.post("/api/remove", (req, res) => {
    const key = req.body.key;

    if (!key) return res.send("NO KEY");

    keys = keys.filter(k => k !== key);

    res.send("REMOVED");
});


// =========================
// 📋 GET ALL KEYS
// =========================
app.get("/api/keys", (req, res) => {
    res.json(keys);
});


// =========================
// 🖥️ SIMPLE ADMIN PANEL
// =========================
app.get("/admin", (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>License Admin</title>
</head>
<body style="font-family:Arial;background:#111;color:#fff;text-align:center;">

<h1>License Admin Panel</h1>

<input id="key" placeholder="CALMO-XXXX-XXXX" />
<br><br>

<button onclick="add()">Add Key</button>
<button onclick="remove()">Remove Key</button>

<h2>Keys:</h2>
<pre id="list"></pre>

<script>

async function load() {
    const res = await fetch('/api/keys');
    const data = await res.json();
    document.getElementById('list').innerText = data.join('\\n');
}

async function add() {
    const key = document.getElementById('key').value;

    await fetch('/api/add', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({key})
    });

    load();
}

async function remove() {
    const key = document.getElementById('key').value;

    await fetch('/api/remove', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({key})
    });

    load();
}

load();

</script>

</body>
</html>
    `);
});


// =========================
// 🚀 START SERVER
// =========================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("License API + Admin Panel läuft auf Port " + PORT);
});
