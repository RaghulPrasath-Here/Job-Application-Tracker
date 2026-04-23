const prisma = require('../lib/prisma');


// Status rank — higher number = more advanced stage
const STATUS_RANK = {
  Other: 0,
  Applied: 1,
  Interview: 2,
  Offer: 3,
  Rejected: 4,
  Withdrawn: 4,
};

// Normalize strings for fuzzy comparison
function normalize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Simple string similarity (Dice coefficient)
function similarity(a, b) {
  const normA = normalize(a);
  const normB = normalize(b);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;

  const bigrams = (str) => {
    const pairs = new Set();
    for (let i = 0; i < str.length - 1; i++) {
      pairs.add(str.slice(i, i + 2));
    }
    return pairs;
  };

  const setA = bigrams(normA);
  const setB = bigrams(normB);
  const intersection = [...setA].filter((x) => setB.has(x)).length;

  return (2 * intersection) / (setA.size + setB.size);
}

// Find existing application for same company + role
async function findExistingApplication(userId, company, jobTitle) {
  const applications = await prisma.application.findMany({
    where: { userId },
    select: { id: true, company: true, jobTitle: true, status: true },
  });

  let bestMatch = null;
  let bestScore = 0;

  for (const app of applications) {
    const companySim = similarity(app.company, company);
    const titleSim = similarity(app.jobTitle, jobTitle);

    // Weight company match more heavily 
    const score = companySim * 0.6 + titleSim * 0.4;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = app;
    }
  }

  // Threshold: 0.75 = high confidence it's the same application
  return bestScore >= 0.75 ? { match: bestMatch, score: bestScore } : null;
}

// Determine if new status is a forward progression
function isForwardProgression(currentStatus, newStatus) {
  const currentRank = STATUS_RANK[currentStatus] ?? 0;
  const newRank = STATUS_RANK[newStatus] ?? 0;
  return newRank > currentRank;
}

async function upsertApplication(userId, analysisResult, emailData) {
  const { company, jobTitle, status, confidence } = analysisResult;

  if (!analysisResult.isJobRelated || confidence < 0.4) {
    return { action: 'skipped', reason: 'low_confidence_or_not_job_related' };
  }

  const existing = await findExistingApplication(userId, company, jobTitle);

  if (existing) {
    const { match } = existing;

    const timelineEntry = {
      status,
      emailId: emailData.id,
      emailSubject: emailData.subject,
      emailDate: emailData.date,
      confidence,
    };

    if (isForwardProgression(match.status, status)) {

      await prisma.application.update({
        where: { id: match.id },
        data: {
          status,
          lastUpdated: new Date(),
          statusHistory: {
            create: timelineEntry,
          },
          emails: {
            create: {
              gmailMessageId: emailData.id,
              subject: emailData.subject,
              fromAddress: emailData.from,
              receivedAt: emailData.date,
              snippet: emailData.snippet,
            },
          },
        },
      });
      return { action: 'updated', applicationId: match.id, previousStatus: match.status, newStatus: status };
    } else {
      await prisma.application.update({
        where: { id: match.id },
        data: {
          emails: {
            create: {
              gmailMessageId: emailData.id,
              subject: emailData.subject,
              fromAddress: emailData.from,
              receivedAt: emailData.date,
              snippet: emailData.snippet,
            },
          },
        },
      });
      return { action: 'email_linked', applicationId: match.id };
    }
  } else {
    
    const app = await prisma.application.create({
      data: {
        userId,
        company,
        jobTitle,
        status,
        confidence,
        recruiterName: analysisResult.recruiterName,
        recruiterEmail: analysisResult.recruiterEmail,
        nextSteps: analysisResult.nextSteps,
        interviewDate: analysisResult.interviewDate,
        appliedAt: emailData.date,
        lastUpdated: new Date(),
        statusHistory: {
          create: {
            status,
            emailId: emailData.id,
            emailSubject: emailData.subject,
            emailDate: emailData.date,
            confidence,
          },
        },
        emails: {
          create: {
            gmailMessageId: emailData.id,
            subject: emailData.subject,
            fromAddress: emailData.from,
            receivedAt: emailData.date,
            snippet: emailData.snippet,
          },
        },
      },
    });
    return { action: 'created', applicationId: app.id };
  }
}

module.exports = { upsertApplication };