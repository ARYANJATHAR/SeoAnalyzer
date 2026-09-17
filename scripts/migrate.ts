import { config } from "dotenv";
config({ path: [".env.local", ".env"] });
const { database } = await import("../db/index");
database();
console.log("AnswerLens database migrations applied.");
