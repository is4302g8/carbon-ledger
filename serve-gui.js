import http from "http";
import fs from "fs";
import path from "path";
import { exec } from "child_process";

const PORT = 3000;
const FRONTEND_DIR = path.resolve("./frontend");

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

function resetBlockchain() {
  return new Promise((resolve, reject) => {
    // 1. Verify local node is responding
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
      (nodeRes) => {
        let body = "";
        nodeRes.on("data", (chunk) => (body += chunk));
        nodeRes.on("end", () => {
          // 2. Deploy fresh contracts to localhost node and sync frontend
          console.log("✓ Hardhat node responsive at 127.0.0.1:8545. Redeploying clean protocol state...");
          exec("npx hardhat run scripts/deploy.ts --network localhost", { maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
            if (err) {
              console.error("Deploy error:", stderr || err);
              return reject(new Error(stderr || err.message));
            }
            console.log("✓ Fresh contracts deployed to localhost and frontend synced successfully!");
            resolve(stdout);
          });
        });
      }
    );

    req.on("error", (err) => {
      console.warn("Hardhat node not responding at http://127.0.0.1:8545:", err.message);
      reject(new Error("Local Hardhat node is not running. Please start it with 'npm run node' or run 'start-demo.bat'."));
    });

    req.write(pingData);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const urlPath = req.url.split("?")[0];

  // API Route: Reset Demo
  if (urlPath === "/api/reset" && req.method === "POST") {
    try {
      console.log("Received /api/reset request from dashboard...");
      await resetBlockchain();
      return sendJson(res, 200, {
        success: true,
        message: "Protocol reset and redeployed to clean state.",
      });
    } catch (err) {
      return sendJson(res, 500, {
        success: false,
        error: err.message,
      });
    }
  }

  // API Route: Node Status Health Check
  if (urlPath === "/api/health") {
    return sendJson(res, 200, { status: "ok" });
  }

  // Serve static files from /frontend
  let reqPath = urlPath;
  if (reqPath === "/" || reqPath === "") reqPath = "/index.html";

  const filePath = path.join(FRONTEND_DIR, reqPath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found: " + reqPath);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🌿 CarbonLedger Interactive GUI running at:`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log(`   (Automatic 1-Click Reset API enabled at /api/reset)`);
  console.log(`=======================================================`);
});
