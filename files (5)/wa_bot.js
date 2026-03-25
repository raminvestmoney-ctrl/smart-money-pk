const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require("@whiskeysockets/baileys");
const express = require("express");
const bodyParser = require("body-parser");
const pino = require("pino");
const fs = require("fs");
const path = require("path");

// ══════════════════════════════════════════
//  SETTINGS — CHANGE THESE
// ══════════════════════════════════════════

// Your WhatsApp Group Name (exact name as it appears in WhatsApp)
const TARGET_GROUP_NAME = process.env.TARGET_GROUP_NAME || "YOUR_GROUP_NAME_HERE";

// Port for this service
const PORT = process.env.PORT || 5001;

// Auth session folder
const AUTH_FOLDER = "./auth_info_baileys";

// ══════════════════════════════════════════

const app = express();
app.use(bodyParser.json());

const logger = pino({ level: "silent" }); // Keep logs clean

let sock = null;
let targetGroupJid = null;
let isReady = false;
let qrCodeString = null;

// ── FIND GROUP JID ──────────────────────────────────────────────
async function findGroupJid(groupName) {
  try {
    const groups = await sock.groupFetchAllParticipating();
    for (const [jid, group] of Object.entries(groups)) {
      if (group.subject === groupName) {
        console.log(`✅ Found group: "${groupName}" → JID: ${jid}`);
        return jid;
      }
    }
    console.error(`❌ Group "${groupName}" not found!`);
    console.log("📋 Available groups:");
    for (const [jid, group] of Object.entries(groups)) {
      console.log(`   - "${group.subject}"`);
    }
    return null;
  } catch (err) {
    console.error("❌ Error fetching groups:", err.message);
    return null;
  }
}

// ── START WHATSAPP CONNECTION ───────────────────────────────────
async function startWAConnection() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: true, // QR shown in Railway logs
    browser: ["WA-Cloud-Bot", "Chrome", "1.0.0"],
    syncFullHistory: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrCodeString = qr;
      console.log("\n📱 QR CODE READY — Scan with WhatsApp:");
      console.log("   1. Open WhatsApp on your phone");
      console.log("   2. Go to Settings → Linked Devices → Link a Device");
      console.log("   3. Scan the QR code shown above in logs");
      console.log("   (QR also available at /qr endpoint)\n");
    }

    if (connection === "open") {
      console.log("✅ WhatsApp connected successfully!");
      isReady = true;
      qrCodeString = null;

      // Find the target group
      setTimeout(async () => {
        targetGroupJid = await findGroupJid(TARGET_GROUP_NAME);
        if (!targetGroupJid) {
          console.warn(`⚠️  Update TARGET_GROUP_NAME env variable with exact group name from list above.`);
        }
      }, 3000);
    }

    if (connection === "close") {
      isReady = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(`⚠️  Connection closed. Status: ${statusCode}. Reconnect: ${shouldReconnect}`);

      if (shouldReconnect) {
        console.log("🔄 Reconnecting in 5 seconds...");
        setTimeout(startWAConnection, 5000);
      } else {
        console.log("🚪 Logged out! Delete auth_info_baileys folder and restart to re-scan QR.");
        isReady = false;
      }
    }
  });
}

// ── SEND CODE TO GROUP ──────────────────────────────────────────
async function sendCodeToGroup(code) {
  if (!isReady || !sock) {
    throw new Error("WhatsApp not connected yet.");
  }

  if (!targetGroupJid) {
    // Try to find group one more time
    targetGroupJid = await findGroupJid(TARGET_GROUP_NAME);
    if (!targetGroupJid) {
      throw new Error(`Group "${TARGET_GROUP_NAME}" not found. Check TARGET_GROUP_NAME env variable.`);
    }
  }

  const message = `🔐 ${code}`;
  await sock.sendMessage(targetGroupJid, { text: message });
  console.log(`✅ Code [${code}] sent to group "${TARGET_GROUP_NAME}"`);
  return true;
}

// ══════════════════════════════════════════
//  EXPRESS ROUTES
// ══════════════════════════════════════════

// Main endpoint — called by app.py
app.post("/send_code", async (req, res) => {
  const data = req.body;

  if (!data) {
    return res.status(400).json({ status: "no data" });
  }

  // Extract 6-digit code
  const rawText = String(data.code || "") + " " + String(data.message || "");
  const match = rawText.match(/\b(\d{6})\b/);

  if (!match) {
    console.log(`⏭️  No 6-digit code in: ${rawText.slice(0, 40)}`);
    return res.status(200).json({ status: "no_code" });
  }

  const code = match[1];
  console.log(`📩 Code received: ${code}`);

  try {
    await sendCodeToGroup(code);
    return res.status(200).json({ status: "sent", code });
  } catch (err) {
    console.error(`❌ Send failed: ${err.message}`);
    return res.status(500).json({ status: "failed", error: err.message });
  }
});

// QR Code page — open in browser to scan
app.get("/qr", (req, res) => {
  if (isReady) {
    return res.send("<h2>✅ WhatsApp is already connected!</h2>");
  }
  if (!qrCodeString) {
    return res.send("<h2>⏳ Waiting for QR code... Refresh in 5 seconds.</h2><script>setTimeout(()=>location.reload(),5000)</script>");
  }

  // Render QR as image using qrcode library
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>WhatsApp QR</title>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    </head>
    <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#f0f0f0">
      <h2>📱 Scan with WhatsApp</h2>
      <p>Settings → Linked Devices → Link a Device</p>
      <div id="qrcode" style="background:white;padding:20px;border-radius:12px"></div>
      <p style="color:#888;margin-top:20px">Page auto-refreshes every 30s</p>
      <script>
        new QRCode(document.getElementById("qrcode"), {
          text: ${JSON.stringify(qrCodeString)},
          width: 256,
          height: 256
        });
        setTimeout(() => location.reload(), 30000);
      </script>
    </body>
    </html>
  `);
});

// Status endpoint
app.get("/", (req, res) => {
  res.json({
    status: isReady ? "connected ✅" : "not connected ❌",
    group: TARGET_GROUP_NAME,
    groupJid: targetGroupJid || "not found yet",
    qrAvailable: !!qrCodeString,
    message: !isReady ? "Visit /qr to scan QR code" : "Ready to receive codes!"
  });
});

// Test endpoint
app.get("/test", async (req, res) => {
  try {
    await sendCodeToGroup("123456");
    res.json({ status: "test sent ✅", code: "123456" });
  } catch (err) {
    res.status(500).json({ status: "failed ❌", error: err.message });
  }
});

// ── START ──────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log("=".repeat(50));
  console.log("  🚀 WA Cloud Bot Started!");
  console.log(`  🌐 Port: ${PORT}`);
  console.log(`  🎯 Target Group: "${TARGET_GROUP_NAME}"`);
  console.log("=".repeat(50));
  console.log("  📌 FIRST TIME SETUP:");
  console.log(`  1. Open: https://your-railway-url/qr`);
  console.log("  2. Scan QR with WhatsApp");
  console.log("  3. Done! Session saved permanently.");
  console.log("=".repeat(50));
});

startWAConnection();
