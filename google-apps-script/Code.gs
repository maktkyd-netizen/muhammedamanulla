/**
 * AMAN AI WEBSITE CHATBOT - GOOGLE APPS SCRIPT WEB APP
 * Destination: Google Sheets Lead Capture
 * Website: https://muhammedamanulla.netlify.app/
 * Owner: Muhammad Amanulla
 * Columns: Date | Name | Phone | Business | Location | Service | Budget | Message | Consent
 */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    var rawData = e.postData ? e.postData.contents : null;
    if (!rawData) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: "No payload received"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var data = JSON.parse(rawData);

    // Optional Secret Validation
    var scriptProps = PropertiesService.getScriptProperties();
    var expectedSecret = scriptProps.getProperty("LEAD_SECRET");
    if (expectedSecret && expectedSecret.trim() !== "") {
      if (!data.secret || data.secret !== expectedSecret) {
        return ContentService.createTextOutput(JSON.stringify({
          status: "error",
          message: "Unauthorized: Invalid or missing lead secret"
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getActiveSheet();

    // Ensure header row exists
    if (sheet.getLastRow() === 0) {
      var headers = [
        "Date",
        "Name",
        "Phone",
        "Business",
        "Location",
        "Service",
        "Budget",
        "Message",
        "Consent",
        "Timestamp"
      ];
      sheet.appendRow(headers);
      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight("bold");
      headerRange.setBackground("#0E5AA7");
      headerRange.setFontColor("#FFFFFF");
      sheet.setFrozenRows(1);
    }

    // Append new lead
    var dateFormatted = data.date || Utilities.formatDate(new Date(), "Asia/Kolkata", "dd/MM/yyyy HH:mm");
    var row = [
      dateFormatted,
      data.name || "-",
      "'" + (data.phone || "-"), // prepended quote prevents phone numbers from losing leading zeros
      data.business || "-",
      data.location || "-",
      data.service || "-",
      data.budget || "-",
      data.message || "-",
      data.consent || "Yes",
      data.timestamp || new Date().toISOString()
    ];

    sheet.appendRow(row);

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Lead successfully recorded",
      row: sheet.getLastRow()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);

  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    message: "Aman AI Lead Webhook is active and listening for POST requests."
  })).setMimeType(ContentService.MimeType.JSON);
}
