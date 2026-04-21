const express = require('express');
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const config = require('../config');

const router = express.Router();
const prisma = new PrismaClient();

// A reusable OAuth2 client
function getOAuth2Client() {
  return new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri
  );
}

// Redirect user to Google consent screen
router.get('/google', (req, res) => {
  const oauth2Client = getOAuth2Client();

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',   // to get a refresh_token
    prompt: 'consent',        // always get refresh_token
    scope: config.google.scopes,
  });

  res.redirect(authUrl);
});

// Google redirects back here with ?code=...
router.get('/google/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.redirect(`${config.frontendUrl}/login?error=oauth_denied`);
  }

  try {
    const oauth2Client = getOAuth2Client();

    // Exchange authorization code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Fetch user profile
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: profile } = await oauth2.userinfo.get();

    // Upsert user in DB — store encrypted tokens
    const user = await prisma.user.upsert({
      where: { googleId: profile.id },
      update: {
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined, 
        tokenExpiry: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : null,
      },
      create: {
        googleId: profile.id,
        email: profile.email,
        name: profile.name,
        picture: profile.picture,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : null,
      },
    });

    // Issue our own JWT — never expose Google tokens to frontend
    const jwtToken = jwt.sign(
      { userId: user.id, email: user.email },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    // Redirect to frontend with token in query param (frontend stores it)
    res.redirect(`${config.frontendUrl}/auth/callback?token=${jwtToken}`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect(`${config.frontendUrl}/login?error=oauth_failed`);
  }
});

// Get current user info
router.get('/me', require('../middleware/auth'), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, email: true, name: true, picture: true, lastSyncAt: true },
    });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out' });
});

module.exports = router;