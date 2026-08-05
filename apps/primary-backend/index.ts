import express from "express"
import router from "./routes/route";
import { client } from "@repo/db/client";
const app = express();
app.use(express.json());

// CORS — the web frontend is a different origin (dev: :3001). Permissive for now.
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
});

app.use(router)

// keep the shared Neon compute warm so no service hits a serverless cold-start.
// Neon suspends after ~5 min idle (default) — ping every 4 min with a 1-min margin.
setInterval(() => {
    client.user.findFirst().catch((e) => console.error("neon keep-warm failed", e));
}, 240_000);

app.listen(3000 , ()=>{
    console.log("server is listining on port 3000")
})
