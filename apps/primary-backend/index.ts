import express from "express"
import router from "./routes/route";
const app = express();
app.use(express.json());

app.use(router)
app.listen(3000 , ()=>{
    console.log("server is listining on port 3000")
})
