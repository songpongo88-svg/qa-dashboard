// Vercel Cron invokes the existing Sparks backend with CRON_SECRET authorization.
// The backend verifies the bearer secret and executes atomic GLO settlement.
import sparksHandler from "../sparks-admin.js";
export default function handler(req,res) {
  return sparksHandler(req,res);
}
