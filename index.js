import express from "express";
// import path from "path"
// import { fileURLToPath } from "url"
import cors from "cors";
import mongoose from "mongoose";
import router from "./routes.js";
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename)
const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", router);
// app.use(express.static(path.join(__dirname, 'dist')))
const PORT = process.env.PORT || 8888;





const start = async () => {
  try {
    await mongoose.connect(
      "mongodb://rtktelecommain:infolearn88@ac-cf6vuhi-shard-00-00.ioipveh.mongodb.net:27017,ac-cf6vuhi-shard-00-01.ioipveh.mongodb.net:27017,ac-cf6vuhi-shard-00-02.ioipveh.mongodb.net:27017/?ssl=true&replicaSet=atlas-pemd6l-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0",
      {}
    );
    app.listen(PORT, () => {
      console.log("Server has been launched on PORT:", PORT);
    });
  } catch (e) {
    console.log(e.message);
    return;
  }
};
// app.get('/{*any}', (req,res)=>{
// res.sendFile(path.join(__dirname, 'dist', 'index.html'));
// })

start();