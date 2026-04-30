const express = require("express");
const mongoose = require("mongoose");

const app = express();
app.use(express.json());

// 🔐 LOGIN DATEN
const ADMIN_USER = "admin";
const ADMIN_PASS = "1234"; // später ändern!

// 🌐 MONGODB CONNECT
mongoose.connect("DEINE_MONGO_URL");

const KeySchema = new mongoose.Schema({
    key: String
});

const Key = mongoose.model("Key", KeySchema);

// 🔐 LOGIN CHECK
function auth(req, res, next) {
    const { user, pass } = req.query;

    if (user === ADMIN_USER && pass === ADMIN_PASS) {
        return next();
    }

    res.send("Login required");
}

// =====================
// LICENSE CHECK
// =====================
app.get("/license", async (req, res) => {
    const key = req.query.key;

    const exists = await Key.findOne({ key });

    if (exists) return res.send("VALID");

    res.send("INVALID");
});

// =====================
// ADMIN PANEL
// =====================
app.get("/admin", auth, async (req, res) => {

    const keys = await Key.find();

    res.send(`
    <html>
    <body style="background:#0f172a;color:white;font-family:sans-serif;text-align:center">
    
    <h1>🔐 License Panel</h1>

    <input id="key" placeholder="New Key"/>
    <br><br>

    <button onclick="add()">Add</button>

    <h2>Keys</h2>
    <ul>
        ${keys.map(k => `
            <li>
                ${k.key}
                <button onclick="del('${k.key}')">❌</button>
            </li>
        `).join("")}
    </ul>

    <script>
    async function add(){
        const key = document.getElementById('key').value;

        await fetch('/api/add?user=${ADMIN_USER}&pass=${ADMIN_PASS}',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({key})
        });

        location.reload();
    }

    async function del(key){
        await fetch('/api/remove?user=${ADMIN_USER}&pass=${ADMIN_PASS}',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({key})
        });

        location.reload();
    }
    </script>

    </body>
    </html>
    `);
});

// =====================
// ADD KEY
// =====================
app.post("/api/add", auth, async (req, res) => {

    const key = req.body.key;

    if (!key) return res.send("NO KEY");

    await Key.create({ key });

    res.send("ADDED");
});

// =====================
// REMOVE KEY
// =====================
app.post("/api/remove", auth, async (req, res) => {

    const key = req.body.key;

    await Key.deleteOne({ key });

    res.send("REMOVED");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("API läuft"));
