// Nettech email relay: paste into script.google.com while signed in as nettech.management@gmail.com
// 1) Replace SECRET with a long random string (the same value goes in MAIL_WEBHOOK_SECRET)
// 2) Run the "authorize" function once and accept Google's permission prompts
// 3) Deploy > New deployment > type "Web app" > Execute as: Me > Who has access: Anyone > Deploy
// 4) Copy the Web app URL into MAIL_WEBHOOK_URL
const SECRET = "PASTE-A-LONG-RANDOM-STRING-HERE";

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.secret !== SECRET) return out({ ok: false, error: "bad secret" });
    MailApp.sendEmail({ to: d.to, subject: d.subject, body: d.text, htmlBody: d.html, name: "Nettech" });
    return out({ ok: true });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function authorize() {
  Logger.log("Emails you can still send today: " + MailApp.getRemainingDailyQuota());
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
