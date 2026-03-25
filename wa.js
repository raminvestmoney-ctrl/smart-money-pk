// ══════════════════════════════════════════════════
//  wa.js — WhatsApp Auto-Sender (Cloud Version)
//  Replaces wa.py — No screen needed, runs 100% free
//  Uses: whatsapp-web.js + Express
// ══════════════════════════════════════════════════

const { Client, LocalAuth } = require('whatsapp-web.js');
const express               = require('express');
const qrcode                = require('qrcode-terminal');

// ══════════════════════════════════════════════════
//  SETTINGS — CHANGE THESE
// ══════════════════════════════════════════════════

// Your WhatsApp GROUP ID — see "HOW TO FIND GROUP ID" below
const WA_GROUP_ID = process.env.WA_GROUP_ID || 'XXXXXXXXXXXXXXXXXX@g.us';

// Port this server listens on (Render sets this automatically)
const PORT = process.env.PORT || 5001;

// ══════════════════════════════════════════════════
//  SETUP
// ══════════════════════════════════════════════════

const app    = express();
app.use(express.json());

let clientReady = false;

// WhatsApp client with session saving (so QR scan is only needed ONCE)
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './wa_session' }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// ══════════════════════════════════════════════════
//  WHATSAPP EVENTS
// ══════════════════════════════════════════════════

// Show QR code in terminal (only needed ONCE — scan with your phone)
client.on('qr', (qr) => {
    console.log('\n════════════════════════════════════');
    console.log('  📱 SCAN THIS QR CODE WITH WHATSAPP');
    console.log('════════════════════════════════════\n');
    qrcode.generate(qr, { small: true });
    console.log('\n  Steps:');
    console.log('  1. Open WhatsApp on your phone');
    console.log('  2. Tap Menu (⋮) → Linked Devices');
    console.log('  3. Tap "Link a Device"');
    console.log('  4. Scan this QR code\n');
});

client.on('authenticated', () => {
    console.log('✅ WhatsApp authenticated! Session saved.');
});

client.on('ready', () => {
    clientReady = true;
    console.log('🚀 WhatsApp client is READY! Listening for codes...');
    // Log all groups so you can find your GROUP ID
    client.getChats().then(chats => {
        const groups = chats.filter(c => c.isGroup);
        console.log('\n📋 YOUR WHATSAPP GROUPS:');
        console.log('════════════════════════════════════');
        groups.forEach(g => {
            console.log(`  Name: "${g.name}"`);
            console.log(`  ID:   ${g.id._serialized}`);
            console.log('  ────────────────────────────────');
        });
        console.log('  Copy the ID of your target group');
        console.log('  and set it as WA_GROUP_ID above.\n');
    });
});

client.on('disconnected', (reason) => {
    clientReady = false;
    console.log('⚠️ WhatsApp disconnected:', reason);
    console.log('🔄 Reconnecting in 5 seconds...');
    setTimeout(() => client.initialize(), 5000);
});

client.on('auth_failure', (msg) => {
    console.error('❌ Auth failed:', msg);
    console.log('🗑️  Delete the wa_session folder and restart to re-scan QR.');
});

// ══════════════════════════════════════════════════
//  SEND CODE TO WHATSAPP GROUP
// ══════════════════════════════════════════════════

async function sendToWhatsApp(code) {
    try {
        if (!clientReady) {
            console.error('❌ WhatsApp client not ready yet!');
            return false;
        }

        const message = `🔐 Code: *${code}*`;
        await client.sendMessage(WA_GROUP_ID, message);
        console.log(`✅ Code [${code}] sent to WhatsApp group!`);
        return true;

    } catch (err) {
        console.error('❌ Failed to send WhatsApp message:', err.message);
        return false;
    }
}

// ══════════════════════════════════════════════════
//  API ROUTES (same as old wa.py — app.py unchanged)
// ══════════════════════════════════════════════════

// Main endpoint — called by app.py when 3737 SMS arrives
app.post('/send_code', async (req, res) => {
    const data = req.body;
    if (!data) return res.status(400).json({ status: 'no data' });

    // Extract 6-digit code from "code" field or full "message"
    const combined = `${data.code || ''} ${data.message || ''}`;
    const match    = combined.match(/\b(\d{6})\b/);

    if (!match) {
        console.log('⏭️  No 6-digit code found in:', combined.substring(0, 50));
        return res.json({ status: 'no_code' });
    }

    const code   = match[1];
    console.log(`📩 Code received from app.py: ${code}`);
    const result = await sendToWhatsApp(code);

    return res.json({
        status: result ? 'sent' : 'failed',
        code:   code
    });
});

// Health check — Render pings this to keep service alive
app.get('/', (req, res) => {
    res.json({
        status:  clientReady ? '🟢 Ready' : '🟡 Connecting...',
        service: 'wa.js WhatsApp Bot'
    });
});

// Test endpoint — call /test to verify everything works
app.get('/test', async (req, res) => {
    const result = await sendToWhatsApp('123456');
    res.json({ status: result ? 'Test sent!' : 'Failed — check logs', code: '123456' });
});

// ══════════════════════════════════════════════════
//  START
// ══════════════════════════════════════════════════

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🌐 wa.js server running on port ${PORT}`);
    console.log('🔌 Connecting to WhatsApp...\n');
});

// Initialize with error catching to prevent crash loops
console.log('⏳ Starting WhatsApp client...');
client.initialize().catch(err => {
    console.error('❌ CRITICAL: Failed to initialize WhatsApp client:', err);
    console.log('💡 Tip: If this is a Puppeteer error, check your nixpacks/dependencies.');
});

// ══════════════════════════════════════════════════
//  HOW TO FIND YOUR GROUP ID:
//  1. Deploy and start this bot
//  2. Scan the QR code with your phone
//  3. Check the logs — it will print ALL your group IDs
//  4. Copy the ID of your target group
//  5. Set WA_GROUP_ID = that ID in Render environment variables
//  6. Restart the service
// ══════════════════════════════════════════════════
