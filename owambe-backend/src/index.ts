import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import routes from "./routes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use("/api", routes);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "owambe-backend" });
});

app.listen(PORT, () => {
  console.log(`Owambe backend running on http://localhost:${PORT}`);
});
