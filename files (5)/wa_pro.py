from flask import Flask, request, jsonify
import time
import logging
import os
import re
from playwright.sync_api import sync_playwright

# ══════════════════════════════════════════════════
#  SETTINGS
# ══════════════════════════════════════════════════
USER_DATA_DIR = "./wa_session"  # This is where your login is saved
PORT = 5001                     # Same as your current wa.py

# ══════════════════════════════════════════════════

app = Flask(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s [WA-PRO] %(message)s')
logger = logging.getLogger(__name__)

# GLOBAL Playwright Objects
playwright = None
browser_context = None
page = None

def init_browser():
    """Initializes the browser and loads the session"""
    global playwright, browser_context, page
    try:
        playwright = sync_playwright().start()
        # Launch Chromium with persistent login context
        browser_context = playwright.chromium.launch_persistent_context(
            USER_DATA_DIR,
            headless=False,  # Set to False so YOU can see it and scan the QR code!
            args=["--no-sandbox", "--disable-setuid-sandbox"]
        )
        page = browser_context.pages[0] if browser_context.pages else browser_context.new_page()
        
        logger.info("🚀 Browser started. Going to WhatsApp Web...")
        page.goto("https://web.whatsapp.com")
        
        # Wait for user to be logged in (looking for the search box)
        logger.info("⏳ Waiting for WhatsApp to load and QR code scan (if needed)...")
        # Selector for search bar or chat list
        try:
            page.wait_for_selector('div[contenteditable="true"]', timeout=300000) # 5 minutes for login
            logger.info("✅ WhatsApp Web Loaded!")
        except Exception as e:
            logger.error(f"⚠️ Timer out waiting for login: {e}")
            
    except Exception as e:
        logger.error(f"❌ Failed to start browser: {e}")

def send_to_whatsapp(code):
    """Types the code into the ACTIVE WhatsApp chat and sends it"""
    global page
    try:
        # Selector for the "Type a message" box
        # This is more reliable than mouse coordinates!
        msg_box_selector = 'div[title="Type a message"]'
        
        # Check if the box is there
        if not page.is_visible(msg_box_selector):
            logger.warning("⚠️ Message box not visible. Make sure the group chat is OPEN!")
            return False

        # Type the code and press enter
        page.fill(msg_box_selector, str(code))
        page.keyboard.press("Enter")
        
        logger.info(f"✅ Code [{code}] sent to active chat!")
        return True

    except Exception as e:
        logger.error(f"❌ WhatsApp send failed: {e}")
        return False

@app.route('/send_code', methods=['POST'])
def receive_code():
    """Endpoint called by app.py when SMS arrives"""
    data = request.get_json()
    if not data:
        return jsonify({"status": "no data"}), 400

    raw_text = data.get("message", "")
    # Extract 6-digit code
    match = re.search(r'\b(\d{6})\b', str(data.get("code", "")) + " " + raw_text)
    code = match.group(1) if match else None

    if not code:
        logger.info(f"⏭️ No 6-digit code found.")
        return jsonify({"status": "no_code"}), 200

    logger.info(f"📩 6-digit code received: {code}")
    result = send_to_whatsapp(code)

    return jsonify({
        "status": "sent" if result else "failed",
        "code": code
    }), 200

@app.route('/status', methods=['GET'])
def check_status():
    return jsonify({"status": "wa_pro is running", "browser_open": page is not None})

if __name__ == '__main__':
    # Initialize the browser first
    init_browser()
    # Run the Flask app
    app.run(host='127.0.0.1', port=PORT, debug=False)
