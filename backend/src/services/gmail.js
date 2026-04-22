const { google } = require('googleapis');
const config = require('../config');
const prisma = require('../lib/prisma');


// Rebuild an authenticated OAuth2 client for a given user
async function getAuthenticatedClient(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  const oauth2Client = new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri
  );

  oauth2Client.setCredentials({
    access_token: user.accessToken,
    refresh_token: user.refreshToken,
    expiry_date: user.tokenExpiry?.getTime(),
  });

  // save new tokens when Google rotates them
  oauth2Client.on('tokens', async (tokens) => {
    const update = {};
    if (tokens.access_token) update.accessToken = tokens.access_token;
    if (tokens.refresh_token) update.refreshToken = tokens.refresh_token;
    if (tokens.expiry_date) update.tokenExpiry = new Date(tokens.expiry_date);

    if (Object.keys(update).length > 0) {
      await prisma.user.update({ where: { id: userId }, data: update });
    }
  });

  return oauth2Client;
}

// Gmail search queries that capture job-related emails
const JOB_EMAIL_QUERIES = [
  'subject:(application received OR application submitted)',
  'subject:(interview invitation OR interview request OR interview scheduled)',
  'subject:(job offer OR offer letter OR congratulations)',
  'subject:(application status OR application update)',
  'subject:(unfortunately OR regret to inform OR not moving forward)',
  'subject:(thank you for applying OR thank you for your interest)',
  'from:(greenhouse.io OR lever.co OR workday.com OR taleo OR icims OR ashbyhq)',
];

// Fetch emails matching job-related queries, with pagination support
async function fetchJobEmails(userId, options = {}) {
  const { maxResults = 100, afterDate = null } = options;

  const auth = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: 'v1', auth });

  const allMessages = [];

  for (const query of JOB_EMAIL_QUERIES) {
    try {
      
      let q = query;
      if (afterDate) {
        const dateStr = afterDate.toISOString().split('T')[0].replace(/-/g, '/');
        q += ` after:${dateStr}`;
      }

      const listRes = await gmail.users.messages.list({
        userId: 'me',
        q,
        maxResults,
      });

      const messages = listRes.data.messages || [];

      // Fetch full message details in parallel 
      const detailed = await fetchMessagesInBatches(gmail, messages, 10);
      allMessages.push(...detailed);
    } catch (err) {
      console.error(`Gmail query failed for "${query}":`, err.message);
    }
  }

  // Deduplicate by message ID 
  const seen = new Set();
  return allMessages.filter((msg) => {
    if (seen.has(msg.id)) return false;
    seen.add(msg.id);
    return true;
  });
}

// Fetch full message details in batches
async function fetchMessagesInBatches(gmail, messages, batchSize) {
  const results = [];

  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize);

    const detailed = await Promise.allSettled(
      batch.map((msg) =>
        gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full',
        })
      )
    );

    for (const result of detailed) {
      if (result.status === 'fulfilled') {
        results.push(parseMessage(result.value.data));
      }
    }

    // Respect Gmail's rate limit: 250 quota units/second
    // messages.get = 5 units , so 10 parallel = 50 units
    if (i + batchSize < messages.length) {
      await sleep(200); // 200ms between batches
    }
  }

  return results;
}

// Parse a raw Gmail message into a clean object
function parseMessage(rawMessage) {
  const headers = rawMessage.payload?.headers || [];

  const getHeader = (name) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

  const subject = getHeader('Subject');
  const from = getHeader('From');
  const date = getHeader('Date');
  const to = getHeader('To');

  const body = extractBody(rawMessage.payload);

  return {
    id: rawMessage.id,
    threadId: rawMessage.threadId,
    subject,
    from,
    to,
    date: new Date(date),
    body: body.slice(0, 8000), // Truncate to 8k chars for Claude (cost control)
    snippet: rawMessage.snippet,
  };
}

// Recursively extract text body from MIME parts
function extractBody(payload) {
  if (!payload) return '';

  // Direct body data
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }

    for (const part of payload.parts) {
      const text = extractBody(part);
      if (text) return text;
    }
  }

  return '';
}

function decodeBase64Url(encoded) {
  try {
    // Gmail uses URL-safe base64 
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { fetchJobEmails };