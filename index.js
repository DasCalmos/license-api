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
