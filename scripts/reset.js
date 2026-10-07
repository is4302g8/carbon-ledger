import http from "http";
import { execSync } from "child_process";

async function resetNode() {
  console.log("=======================================================");
  console.log("🔄 Resetting CarbonLedger Protocol State...");
  console.log("=======================================================");

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
        console.log("✓ Local Hardhat node active at 127.0.0.1:8545.");
        console.log("✓ Deploying fresh smart contracts and initializing accounts...");
        try {
          execSync("npx hardhat run scripts/deploy.ts --network localhost", { stdio: "inherit" });
          console.log("\n✅ Protocol reset successfully to clean state! Refresh your browser (F5).");
          console.log("=======================================================");
        } catch (err) {
          console.error("Redeploy error:", err.message);
        }
      });
    }
  );

  req.on("error", () => {
    console.error("❌ Error: Local Hardhat node is not running on http://127.0.0.1:8545.");
    console.error("👉 Please start the node with: npm run node");
    console.error("👉 Or double-click 'start-demo.bat' to launch the entire stack automatically.");
    console.log("=======================================================");
  });

  req.write(pingData);
  req.end();
}

resetNode();
