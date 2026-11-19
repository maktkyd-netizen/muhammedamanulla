# Google Sheets Lead Integration Setup

Follow these simple steps to connect Aman AI Assistant to your Google Sheet:

1. **Create a Google Sheet:**
   - Go to [Google Sheets](https://sheets.new) and create a new spreadsheet named `Aman AI Leads`.
2. **Open Apps Script:**
   - Click **Extensions** > **Apps Script**.
3. **Paste the Code:**
   - Delete any placeholder code in `Code.gs` and paste the contents of `google-apps-script/Code.gs`.
4. **Deploy as Web App:**
   - Click **Deploy** > **New deployment**.
   - Select type: **Web app**.
   - Configuration:
     - **Description:** `Aman AI Lead Webhook`
     - **Execute as:** `Me` (your Google account)
     - **Who has access:** `Anyone`
   - Click **Deploy** and authorize permissions when prompted.
5. **Copy Web App URL:**
   - Copy the generated Web App URL (ends with `/exec`).
6. **Set Netlify Environment Variables:**
   - In Netlify Dashboard > Site settings > Environment variables:
     - `GOOGLE_SCRIPT_URL`: Paste your copied Web App URL.
     - `LEAD_SECRET`: (Optional) Choose a secret passphrase or leave blank. If specified, set the same value in Apps Script Project Settings > Script Properties.
