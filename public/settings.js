"use strict";

function setResult(id, className, text) {
  const el = document.getElementById(id);
  el.className = className || "";
  el.textContent = text;
}

async function loadSettings() {
  const s = await api("/api/settings");
  document.getElementById("s-interval").value = s.pollIntervalSeconds;
  document.getElementById("s-pageSize").value = s.pageSize;
  document.getElementById("s-maxPages").value = s.maxPages;

  document.getElementById("s-host").value = s.smtp.host || "";
  document.getElementById("s-port").value = s.smtp.port || 587;
  document.getElementById("s-secure").checked = Boolean(s.smtp.secure);
  document.getElementById("s-enabled").checked = s.smtp.enabled !== false;
  document.getElementById("s-user").value = s.smtp.user || "";
  document.getElementById("s-pass").value = "";
  document.getElementById("s-pass").placeholder = s.smtp.passSet
    ? "•••• (set — leave blank to keep)"
    : "not set";
  document.getElementById("s-from").value = s.smtp.from || "";
  document.getElementById("s-to").value = s.smtp.to || "";

  document.getElementById("t-enabled").checked = s.telegram.enabled !== false;
  document.getElementById("t-token").value = "";
  document.getElementById("t-token").placeholder = s.telegram.botTokenSet
    ? "•••• (set — leave blank to keep)"
    : "not set";
  document.getElementById("t-chatId").value = s.telegram.chatId || "";
}

function readSmtpForm() {
  return {
    enabled: document.getElementById("s-enabled").checked,
    host: document.getElementById("s-host").value.trim(),
    port: Number(document.getElementById("s-port").value),
    secure: document.getElementById("s-secure").checked,
    user: document.getElementById("s-user").value.trim(),
    pass: document.getElementById("s-pass").value,
    from: document.getElementById("s-from").value.trim(),
    to: document.getElementById("s-to").value.trim(),
  };
}

function readTelegramForm() {
  return {
    enabled: document.getElementById("t-enabled").checked,
    botToken: document.getElementById("t-token").value.trim(),
    chatId: document.getElementById("t-chatId").value.trim(),
  };
}

async function saveSettings() {
  const payload = {
    pollIntervalSeconds: Number(document.getElementById("s-interval").value),
    pageSize: Number(document.getElementById("s-pageSize").value),
    maxPages: Number(document.getElementById("s-maxPages").value),
    smtp: readSmtpForm(),
    telegram: readTelegramForm(),
  };
  try {
    await api("/api/settings", { method: "PUT", body: JSON.stringify(payload) });
    await loadSettings();
    setResult("smtp-result", "ok", "✓ Settings saved");
  } catch (err) {
    alert(err.message);
  }
}

async function testSmtp() {
  setResult("smtp-result", "", "Testing…");
  try {
    const result = await api("/api/smtp/test", {
      method: "POST",
      body: JSON.stringify({ smtp: readSmtpForm() }),
    });
    setResult("smtp-result", result.ok ? "ok" : "err", result.ok ? "✓ SMTP connection OK" : "✗ " + result.error);
  } catch (err) {
    setResult("smtp-result", "err", "✗ " + err.message);
  }
}

async function sendTestEmail() {
  setResult("smtp-result", "", "Sending test email…");
  try {
    const result = await api("/api/smtp/test-email", {
      method: "POST",
      body: JSON.stringify({ smtp: readSmtpForm() }),
    });
    setResult("smtp-result", result.ok ? "ok" : "err", result.ok ? "✓ Test email sent" : "✗ " + result.error);
  } catch (err) {
    setResult("smtp-result", "err", "✗ " + err.message);
  }
}

async function testTelegram() {
  setResult("telegram-result", "", "Sending test message…");
  try {
    const result = await api("/api/telegram/test", {
      method: "POST",
      body: JSON.stringify({ telegram: readTelegramForm() }),
    });
    setResult(
      "telegram-result",
      result.ok ? "ok" : "err",
      result.ok ? "✓ Test message sent" : "✗ " + result.error,
    );
  } catch (err) {
    setResult("telegram-result", "err", "✗ " + err.message);
  }
}

function wire() {
  document.getElementById("save-settings").addEventListener("click", saveSettings);
  document.getElementById("test-smtp").addEventListener("click", testSmtp);
  document.getElementById("test-email").addEventListener("click", sendTestEmail);
  document.getElementById("test-telegram").addEventListener("click", testTelegram);
}

async function init() {
  wire();
  try {
    await loadSettings();
  } catch (err) {
    console.error(err);
    alert("Failed to load: " + err.message);
  }
}

document.addEventListener("DOMContentLoaded", init);
