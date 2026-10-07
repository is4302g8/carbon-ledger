import http from "http";
import { execSync } from "child_process";

async function resetNode() {
  console.log("Resetting CarbonLedger state...");

  const pingData = JSON.stringify({
    jsonrpc: "2.0",
    method: "eth_blockNumber",
    params: [],
    id: 1,
  });

  const req = http.request(
    "http://127.0.0.1:8545",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(pingData),
      },
    },
    (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          execSync("npx hardhat run scripts/deploy.ts --network localhost", { stdio: "inherit" });
          console.log("Reset complete. Refresh your browser (F5).");
        } catch (err) {
          console.error("Redeploy error:", err.message);
        }
      });
    }
  );

  req.on("error", () => {
    console.error("Error: Local Hardhat node is not running on http://127.0.0.1:8545.");
    console.error("Start the node with: npx hardhat node");
  });

  req.write(pingData);
  req.end();
}

resetNode();
