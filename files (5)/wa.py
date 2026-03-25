from flask import Flask, request, jsonify
import pyautogui
import pyperclip
import time
import logging
import re

# ══════════════════════════════════════════════════
#  SETTINGS — APNA DATA YAHAN CHANGE KARO
# ══════════════════════════════════════════════════

# WhatsApp Web input box coordinates (neeche "HOW TO FIND" section padho)
WA_INPUT_X = 1230   # <-- Your final tested value
WA_INPUT_Y = 997    # <-- Your final tested value ✅ 🎯 🏁

# Security: Only accept requests from localhost (app.py)
ALLOWED_HOST = "127.0.0.1"

# ══════════════════════════════════════════════════

app = Flask(__name__)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [WA-BOT] %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger(__name__)

# PyAutoGUI safety settings
pyautogui.FAILSAFE = True   # Move mouse to top-left corner to STOP script
pyautogui.PAUSE = 0.0       # No global pause — we control timing manually


def extract_6digit_code(text):
    """Extract 6-digit code from any text"""
    match = re.search(r'\b(\d{6})\b', text)
    return match.group(1) if match else None


def send_to_whatsapp(code):
    """Type and send code in WhatsApp Web group — ULTRA FAST MODE"""
    try:
        logger.info(f"🎯 Clicking WhatsApp input box...")

        # Click on WhatsApp Web message input box
        pyautogui.click(WA_INPUT_X, WA_INPUT_Y)
        time.sleep(0.05)  # Minimum wait for click to register

        # Paste code via clipboard (fastest method)
        pyperclip.copy(str(code))
        pyautogui.hotkey('ctrl', 'v')
        time.sleep(0.05)  # Minimum wait for paste to register

        # Press Enter to send
        pyautogui.press('enter')

        logger.info(f"✅ Code [{code}] sent to WhatsApp group! (FAST MODE)")
        return True

    except pyautogui.FailSafeException:
        logger.error("🛑 FAILSAFE triggered! Mouse moved to corner. Script paused.")
        return False
    except Exception as e:
        logger.error(f"❌ WhatsApp send failed: {e}")
        return False


@app.route('/send_code', methods=['POST'])
def receive_code():
    """Endpoint called by app.py when 3737 SMS arrives"""
    
    # Security check
    if request.remote_addr != ALLOWED_HOST:
        logger.warning(f"⛔ Blocked request from {request.remote_addr}")
        return jsonify({"status": "forbidden"}), 403

    data = request.get_json()
    if not data:
        return jsonify({"status": "no data"}), 400

    raw_text = data.get("message", "")
    # Extract 6-digit code from anywhere in the input (code field or message)
    code = extract_6digit_code(str(data.get("code", "")) + " " + raw_text)

    if not code:
        logger.info(f"⏭️ No 6-digit code found in: {raw_text[:30]}")
        return jsonify({"status": "no_code"}), 200

    logger.info(f"📩 6-digit code received: {code}")
    result = send_to_whatsapp(code)

    return jsonify({
        "status": "sent" if result else "failed",
        "code": code
    }), 200


@app.route('/test', methods=['GET'])
def test():
    """Test endpoint — call this to check if wa.py is running"""
    logger.info("🧪 Test ping received!")
    return jsonify({"status": "wa.py is running ✅"}), 200


@app.route('/find_coords', methods=['GET'])
def find_coords():
    """Hover your mouse over WhatsApp input box, then call this!"""
    time.sleep(3)  # 3 second delay — move mouse to WA input box NOW!
    x, y = pyautogui.position()
    logger.info(f"📍 Mouse position: X={x}, Y={y}")
    return jsonify({"x": x, "y": y, "tip": "Use these values in WA_INPUT_X and WA_INPUT_Y"}), 200


if __name__ == '__main__':
    print("=" * 50)
    print("  🚀 WA Auto-Sender Bot Started!")
    print("=" * 50)
    print("  📌 BEFORE YOU START:")
    print("  1. Open Chrome → WhatsApp Web")
    print("  2. Open your WhatsApp group")
    print("  3. Find coordinates (see README below)")
    print("  4. Update WA_INPUT_X and WA_INPUT_Y")
    print("=" * 50)
    print("  🛑 EMERGENCY STOP: Move mouse to TOP-LEFT corner")
    print("=" * 50)
    app.run(host='127.0.0.1', port=5001, debug=False)
