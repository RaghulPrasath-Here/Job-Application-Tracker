const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

const SYSTEM_PROMPT = `You are an expert job application tracker. Analyze the provided email and extract structured information about a job application.

You MUST respond with ONLY a valid JSON object — no markdown, no explanation, no preamble.

Extract the following fields:

{
  "company": "Company name (string, required)",
  "jobTitle": "Job title/role applied for (string, required)",
  "status": "One of: Applied | Interview | Offer | Rejected | Withdrawn | Other",
  "confidence": "Float 0.0-1.0 indicating your confidence in the extraction",
  "isJobRelated": "Boolean — is this actually a job application email?",
  "interviewDate": "ISO 8601 datetime string if mentioned, else null",
  "recruiterName": "Recruiter or hiring manager name if mentioned, else null",
  "recruiterEmail": "Recruiter email address if found, else null",
  "nextSteps": "Brief description of next steps mentioned, else null",
  "classificationSignals": ["Array of key phrases that led to your classification"],
  "rawStatusText": "The exact phrase in the email that indicates status, e.g. 'We would like to invite you for an interview'"
}

Status classification rules:
- "Applied": Confirmation that application was received
- "Interview": Any invitation, scheduling, or mention of an interview
- "Offer": Job offer extended to the candidate
- "Rejected": Application declined, not moving forward, position filled
- "Withdrawn": Candidate withdrew application
- "Other": Thank you emails, generic updates, unclear status

If the email is NOT job-related (newsletters, spam, unrelated emails that happened to match keywords), set isJobRelated to false and confidence to 0.

For company name: extract the actual company, not the ATS provider (e.g., if from greenhouse.io on behalf of Acme Corp, return "Acme Corp").`;

async function analyzeEmail(email) {
  const userMessage = `Analyze this email:

Subject: ${email.subject}
From: ${email.from}
Date: ${email.date}

Body:
${email.body || email.snippet}`;

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const responseText = message.content[0]?.text || '';
    return parseClaudeResponse(responseText, email);
  } catch (err) {
    console.error(`Claude analysis failed for email ${email.id}:`, err.message);

    // safe fallback
    return {
      company: extractCompanyFallback(email.from),
      jobTitle: 'Unknown Position',
      status: 'Other',
      confidence: 0,
      isJobRelated: false,
      error: err.message,
    };
  }
}

function parseClaudeResponse(text, email) {
  try {
    const cleaned = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    const parsed = JSON.parse(cleaned);

    // Validate and apply defaults
    return {
      company: parsed.company || extractCompanyFallback(email.from),
      jobTitle: parsed.jobTitle || 'Unknown Position',
      status: validateStatus(parsed.status),
      confidence: clamp(parseFloat(parsed.confidence) || 0, 0, 1),
      isJobRelated: Boolean(parsed.isJobRelated),
      interviewDate: parseDate(parsed.interviewDate),
      recruiterName: parsed.recruiterName || null,
      recruiterEmail: parsed.recruiterEmail || null,
      nextSteps: parsed.nextSteps || null,
      classificationSignals: Array.isArray(parsed.classificationSignals)
        ? parsed.classificationSignals
        : [],
      rawStatusText: parsed.rawStatusText || null,
    };
  } catch (err) {
    console.error('Failed to parse Claude JSON response:', text.slice(0, 200));
    return {
      company: extractCompanyFallback(email.from),
      jobTitle: 'Unknown Position',
      status: 'Other',
      confidence: 0,
      isJobRelated: false,
      parseError: true,
    };
  }
}

const VALID_STATUSES = ['Applied', 'Interview', 'Offer', 'Rejected', 'Withdrawn', 'Other'];

function validateStatus(status) {
  if (VALID_STATUSES.includes(status)) return status;
  return 'Other';
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Heuristic fallback: domain name as company name
function extractCompanyFallback(fromHeader) {
  try {
    const emailMatch = fromHeader.match(/<(.+?)>/) || fromHeader.match(/(\S+@\S+)/);
    if (emailMatch) {
      const domain = emailMatch[1].split('@')[1];
      // Remove TLD and common email service domains
      const knownAts = ['greenhouse.io', 'lever.co', 'workday.com', 'taleo.net', 'icims.com'];
      if (knownAts.includes(domain)) return 'Unknown Company';
      return domain.split('.')[0];
    }
  } catch {}
  return 'Unknown Company';
}

module.exports = { analyzeEmail };