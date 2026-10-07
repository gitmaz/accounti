import { spawn } from "node:child_process";

const api = spawn("npx", ["tsx", "server/local.ts"], { stdio: "inherit", env: process.env });
const spa = spawn("npm", ["--prefix", "spa", "run", "dev"], { stdio: "inherit", env: process.env });

function stop() {
  api.kill("SIGTERM");
  spa.kill("SIGTERM");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
