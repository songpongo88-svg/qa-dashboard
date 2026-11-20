// Protected Vercel Cron, 04:00 UTC every Monday (11:00 Bangkok).
import sparksHandler from "../sparks-admin.js";
export default function handler(req,res) { return sparksHandler(req,res); }
