#!/bin/bash
# Start the WhatsApp bot in the background
node wa.js &
# Start the Flask app as the main process (it will use the Railway $PORT)
python3 app.py
