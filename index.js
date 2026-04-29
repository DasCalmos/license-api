const express = require("express");
const app = express();

const validKeys = [
    "MannoxPvP-1",
    "7012-9412-5324",
    "9623-3912-1648",
    "1296-8312-9126"
];

app.get("/license", (req, res) => {

    const key = req.query.key;

    if (validKeys.includes(key)) {
        return res.send("VALID");
    }

    res.send("INVALID");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("License API läuft auf Port " + PORT);
});
const express = require("express");
const app = express();

app.use(express.json());

// 🔑 IN MEMORY KEYS
let keys = [
    "CALMO-AB12-CD34",
    "CALMO-X9F2-KL88"
];

// 🌐 LICENSE CHECK (für Plugin)
app.get("/license", (req, res) => {
    const key = req.query.key;

    if (keys.includes(key)) {
        return res.send("VALID");
    }

    res.send("INVALID");
});

// 📋 GET ALL KEYS (ADMIN)
app.get("/api/keys", (req, res) => {
    res.json(keys);
});

// ➕ ADD KEY
app.post("/api/add", (req, res) => {
    const key = req.body.key;

    if (!key) return res.send("NO KEY");

    keys.push(key);
    res.send("ADDED");
});

// ❌ REMOVE KEY
app.post("/api/remove", (req, res) => {
    const key = req.body.key;

    keys = keys.filter(k => k !== key);
    res.send("REMOVED");
});

// 🖥️ ADMIN PANEL UI
app.get("/admin", (req, res) => {

    res.send(`
    <html>
    <body style="font-family:Arial;background:#111;color:#fff;text-align:center;">

        <h1>License Admin Panel</h1>

        <input id="key" placeholder="CALMO-XXXX-XXXX" />
        <button onclick="add()">Add</button>
        <button onclick="remove()">Remove</button>

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
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body: JSON.stringify({key})
            });

            load();
        }

        async function remove() {
            const key = document.getElementById('key').value;

            await fetch('/api/remove', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
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

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("License API + Admin Panel läuft");
});
