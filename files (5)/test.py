from flask import Flask, request, jsonify
import requests
import time
import logging
import hashlib
import os
import re
from datetime import datetime

# wa.py local server (set this as env variable on Railway!)
# On Railway: set WA_BOT_URL = https://your-ngrok-url.ngrok-free.app/send_code
WA_BOT_URL = os.environ.get("WA_BOT_URL", "http://127.0.0.1:5001/send_code")
SMS_FILTER_SENDER = "3737"  # Only forward SMS from this sender

app = Flask(__name__)

# ══════════════════════════════════════════
#  SETTINGS
# ══════════════════════════════════════════
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_TOKEN")
CHAT_ID = os.environ.get("CHAT_ID")
TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ══════════════════════════════════════════
#  DUPLICATE CHECK
# ══════════════════════════════════════════
recent_messages = {}

def is_duplicate(sender, content):
    msg_hash = hashlib.md5(f"{sender}{content}".encode()).hexdigest()
    current_time = time.time()
    
    if msg_hash in recent_messages:
        if current_time - recent_messages[msg_hash] < 60:
            return True
            
    recent_messages[msg_hash] = current_time
    expired = [k for k, v in recent_messages.items() if current_time - v > 300]
    for k in expired:
        del recent_messages[k]
    return False

# ══════════════════════════════════════════
#  TELEGRAM SEND
# ══════════════════════════════════════════
def send_telegram(message, retries=3):
    for attempt in range(retries):
        try:
            response = requests.post(TELEGRAM_API, data={
                'chat_id': CHAT_ID,
                'text': message,
                'parse_mode': 'HTML',
                'disable_web_page_preview': True
            }, timeout=10)
            
            if response.status_code == 200:
                logger.info("✅ Telegram sent!")
                return True
            else:
                logger.warning(f"⚠️ Telegram error: {response.text}")
                
        except Exception as e:
            logger.error(f"❌ Error: {e}")
        
        time.sleep(2)
    return False

# ══════════════════════════════════════════
#  MAIN LOGIC (FIXED FOR RAW DATA)
# ══════════════════════════════════════════
@app.route('/sms', methods=['POST', 'GET'])
def receive_sms():
    try:
        # 1. METADATA: URL Params se uthao (Sabse clean tareeqa)
        sender = request.args.get('sender') or 'Unknown'
        receiver = request.args.get('receiver') or 'Unknown'
        port = request.args.get('port') or 'N/A'
        
        # 2. CONTENT: Raw Body se nikaalo
        raw_data = request.get_data(as_text=True)
        content = "Empty Message"
        
        # Logic: Skyline headers aur message ke beech me 2 newlines (\n\n) deta hai
        if '\n\n' in raw_data:
            parts = raw_data.split('\n\n')
            if len(parts) > 1:
                content = parts[1].strip() # Doosra hissa message hai
        else:
            # Fallback: Agar double newline nahi mili to last line utha lo
            lines = raw_data.strip().split('\n')
            if lines:
                content = lines[-1].strip()

        # Agar content abhi bhi headers jaisa dikh raha hai (just in case)
        if "Sender:" in content or "SMSC:" in content:
             content = raw_data # Poora data dikha do taaki miss na ho
        
        # ── 1. LOG EVERYTHING: Check console for this ──
        logger.info(f"🔍 DEBUG: Raw data received:\n{raw_data}")
        logger.info(f"📩 SMS from {sender}: {content[:50]}...")
        
        # ── 2. FILTER: Only process SMS from 3737 ──
        if sender != SMS_FILTER_SENDER:
            logger.info(f"⏭️ Ignored SMS: Sender '{sender}' is not '{SMS_FILTER_SENDER}'")
            return jsonify({"status": "ignored"}), 200

        # Duplicate check
        if is_duplicate(sender, content):
            logger.info(f"⏳ Duplicate message from {sender} - Skipping.")
            return jsonify({"status": "duplicate"}), 200

        # ── 3. EXTRACT CODE: Now matches 4 to 8 digits (just in case) ──
        # Yeh regex "123456" jese codes ko dhoonta hai
        code_match = re.search(r'\b(\d{4,8})\b', content)
        
        if code_match:
            code = code_match.group(1)
            logger.info(f"🎯 DETECTED CODE: {code} — triggering WhatsApp...")
            
            # Send to wa.py (ngrok)
            try:
                wa_resp = requests.post(WA_BOT_URL, json={"code": code, "message": content}, timeout=8)
                logger.info(f"🚀 wa.py response: {wa_resp.status_code} - {wa_resp.text}")
            except Exception as wa_err:
                logger.error(f"❌ Could not reach wa.py at {WA_BOT_URL}: {wa_err}")
        else:
            logger.warning(f"🤔 No numeric code (4-8 digits) found in: {content}")
        
        # Timestamp
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        # Message Format
        message = (
            f"📩 <b>New SMS Received!</b>\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"📱 <b>From:</b> <code>{sender}</code>\n"
            f"📲 <b>To:</b> <code>{receiver}</code>\n"
            f"📶 <b>Port:</b> {port}\n"
            f"🕐 <b>Time:</b> {timestamp}\n"
            f"━━━━━━━━━━━━━━━━━━━━\n"
            f"💬 <b>Message:</b>\n"
            f"<code>{content}</code>"
        )
        
        send_telegram(message)
        return jsonify({"status": "success"}), 200
            
    except Exception as e:
        logger.error(f"❌ CRITICAL ERROR: {e}")
        return jsonify({"status": "error"}), 500

@app.route('/', methods=['GET'])
def status():
    return "<h1>🟢 Skyline Bridge Running (RAW Mode)</h1>"

@app.route('/test', methods=['GET'])
def test():
    msg = "🧪 <b>Test!</b> Bridge is working."
    send_telegram(msg)
    
    # Trigger WhatsApp as well
    try:
        requests.post(WA_BOT_URL, json={"code": "123456", "message": msg}, timeout=5)
    except Exception as e:
        logger.warning(f"⚠️ wa.py test failed: {e}")
        
    return f"OK - Sent to TG and WA (check your screen!)", 200

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)