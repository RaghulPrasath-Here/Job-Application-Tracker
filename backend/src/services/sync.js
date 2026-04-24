const { fetchJobEmails } = require('./gmail');
const { analyzeEmail } = require('./claude');
const { upsertApplication } = require('./deduplication');
const prisma = require('../lib/prisma');


async function syncUserEmails(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  // Only fetch emails since last sync 
  const afterDate = user.lastSyncAt ? new Date(user.lastSyncAt) : null;

  const results = {
    emailsProcessed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  // Fetch emails from Gmail
  const emails = await fetchJobEmails(userId, { afterDate, maxResults: 200 });
  results.emailsProcessed = emails.length;

  // Analyze each email with Claude (sequential to avoid rate limits)
  for (const email of emails) {
    try {
      // Skip already-processed emails
      const exists = await prisma.emailSource.findUnique({
        where: { gmailMessageId: email.id },
      });
      if (exists) { results.skipped++; continue; }

      const analysis = await analyzeEmail(email);
      const outcome = await upsertApplication(userId, analysis, email);

      if (outcome.action === 'created') results.created++;
      else if (outcome.action === 'updated') results.updated++;
      else results.skipped++;

      // Claude call per second to stay within rate limits
      await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      console.error(`Error processing email ${email.id}:`, err.message);
      results.errors++;
    }
  }

  // Update last sync timestamp
  await prisma.user.update({
    where: { id: userId },
    data: { lastSyncAt: new Date() },
  });

  return results;
}

module.exports = { syncUserEmails };