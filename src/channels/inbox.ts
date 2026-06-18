import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { listInboxItems } from "../data/chatMessagesRepository.js";

export const inboxRouter = Router();

inboxRouter.use(["/api/inbox", "/inbox"], (req, res, next) => {
  const expectedUsername = process.env.INBOX_USERNAME;
  const expectedPassword = process.env.INBOX_PASSWORD;

  if (!expectedUsername || !expectedPassword) {
    res.status(503).send("Inbox access is not configured.");
    return;
  }

  const authorization = req.headers.authorization;
  const credentials = authorization?.startsWith("Basic ")
    ? Buffer.from(authorization.slice(6), "base64").toString("utf8")
    : "";
  const separatorIndex = credentials.indexOf(":");
  const username = separatorIndex >= 0 ? credentials.slice(0, separatorIndex) : "";
  const password = separatorIndex >= 0 ? credentials.slice(separatorIndex + 1) : "";

  if (!secureEqual(username, expectedUsername) || !secureEqual(password, expectedPassword)) {
    res.setHeader("WWW-Authenticate", 'Basic realm="OFFSCRIPT Inbox"');
    res.status(401).send("Authentication required.");
    return;
  }

  next();
});

inboxRouter.get("/api/inbox", async (req, res) => {
  try {
    const requestedLimit = Number(req.query.limit ?? 100);
    const limit = Number.isFinite(requestedLimit) ? requestedLimit : 100;
    const messages = await listInboxItems(limit);
    res.json({ messages });
  } catch (error) {
    console.error("Inbox API failed", error);
    res.status(500).json({ error: "Inbox could not be loaded." });
  }
});

inboxRouter.get("/inbox", (_req, res) => {
  res.type("html").send(INBOX_HTML);
});

const INBOX_HTML = `<!doctype html>
<html lang="nl">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>OFFSCRIPT Inbox</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #17201d;
        background: #f4f6f5;
      }
      * { box-sizing: border-box; }
      body { margin: 0; min-width: 320px; }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 20px 28px;
        color: #fff;
        background: #162d26;
      }
      h1 { margin: 0; font-size: 20px; font-weight: 650; letter-spacing: 0; }
      .status { margin: 0; color: #b8cbc4; font-size: 13px; }
      main { padding: 24px 28px 40px; }
      .toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }
      .count { margin: 0; color: #5d6965; font-size: 14px; }
      button {
        width: 36px;
        height: 36px;
        border: 1px solid #c9d0cd;
        border-radius: 6px;
        color: #26332f;
        background: #fff;
        cursor: pointer;
        font-size: 18px;
      }
      button:hover { background: #edf1ef; }
      button:focus-visible { outline: 3px solid #85a99b; outline-offset: 2px; }
      .table-wrap { overflow-x: auto; border: 1px solid #d8dddb; background: #fff; }
      table { width: 100%; min-width: 860px; border-collapse: collapse; table-layout: fixed; }
      th, td {
        padding: 13px 14px;
        border-bottom: 1px solid #e3e7e5;
        text-align: left;
        vertical-align: top;
        overflow-wrap: anywhere;
      }
      th {
        color: #52605b;
        background: #f8faf9;
        font-size: 12px;
        font-weight: 650;
        text-transform: uppercase;
      }
      td { font-size: 14px; line-height: 1.45; }
      tbody tr:last-child td { border-bottom: 0; }
      tbody tr:hover { background: #fafcfb; }
      .phone { width: 18%; font-variant-numeric: tabular-nums; }
      .message { width: 31%; }
      .time { width: 20%; color: #66716d; white-space: nowrap; }
      .pending { color: #8a6334; font-style: italic; }
      .empty { padding: 40px 20px; color: #66716d; text-align: center; }
      @media (max-width: 680px) {
        header, main { padding-left: 16px; padding-right: 16px; }
        header { align-items: flex-start; flex-direction: column; }
      }
    </style>
  </head>
  <body>
    <header>
      <h1>OFFSCRIPT Inbox</h1>
      <p class="status" id="status">Berichten laden...</p>
    </header>
    <main>
      <div class="toolbar">
        <p class="count" id="count"></p>
        <button id="refresh" type="button" title="Inbox vernieuwen" aria-label="Inbox vernieuwen">&#8635;</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th class="phone">Telefoonnummer</th>
              <th class="message">Laatste bericht</th>
              <th class="message">Antwoord van OFFSCRIPT</th>
              <th class="time">Tijdstip</th>
            </tr>
          </thead>
          <tbody id="messages">
            <tr><td class="empty" colspan="4">Berichten laden...</td></tr>
          </tbody>
        </table>
      </div>
    </main>
    <script>
      const body = document.querySelector("#messages");
      const count = document.querySelector("#count");
      const status = document.querySelector("#status");
      const refresh = document.querySelector("#refresh");

      function textCell(value, className) {
        const cell = document.createElement("td");
        cell.className = className;
        cell.textContent = value;
        return cell;
      }

      function formatTime(value) {
        return new Intl.DateTimeFormat("nl-BE", {
          dateStyle: "short",
          timeStyle: "short"
        }).format(new Date(value));
      }

      async function loadInbox() {
        refresh.disabled = true;
        status.textContent = "Berichten laden...";

        try {
          const response = await fetch("/api/inbox");
          if (!response.ok) throw new Error("Inbox request failed");

          const data = await response.json();
          body.replaceChildren();
          count.textContent = data.messages.length + (data.messages.length === 1 ? " bericht" : " berichten");

          if (data.messages.length === 0) {
            const row = document.createElement("tr");
            const cell = textCell("Nog geen WhatsApp-berichten opgeslagen.", "empty");
            cell.colSpan = 4;
            row.append(cell);
            body.append(row);
          }

          for (const item of data.messages) {
            const row = document.createElement("tr");
            row.append(
              textCell(item.userPhone, "phone"),
              textCell(item.incomingMessage, "message"),
              textCell(item.outgoingMessage || "Nog geen antwoord", item.outgoingMessage ? "message" : "message pending"),
              textCell(formatTime(item.outgoingAt || item.incomingAt), "time")
            );
            body.append(row);
          }

          status.textContent = "Bijgewerkt om " + new Intl.DateTimeFormat("nl-BE", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
          }).format(new Date());
        } catch (error) {
          body.innerHTML = '<tr><td class="empty" colspan="4">De inbox kon niet worden geladen.</td></tr>';
          count.textContent = "";
          status.textContent = "Verbinding mislukt";
        } finally {
          refresh.disabled = false;
        }
      }

      refresh.addEventListener("click", loadInbox);
      loadInbox();
      setInterval(loadInbox, 30000);
    </script>
  </body>
</html>`;

function secureEqual(value: string, expected: string): boolean {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);

  return valueBuffer.length === expectedBuffer.length && timingSafeEqual(valueBuffer, expectedBuffer);
}
