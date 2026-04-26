const express = require('express');
const auth = require('../middleware/auth');
const router = express.Router();
const prisma = require('../lib/prisma');


// GET /api/applications — list all for current user
router.get('/', auth, async (req, res) => {
  try {
    const { status, search } = req.query;

    const where = { userId: req.user.userId };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { company: { contains: search, mode: 'insensitive' } },
        { jobTitle: { contains: search, mode: 'insensitive' } },
      ];
    }

    const applications = await prisma.application.findMany({
      where,
      include: {
        statusHistory: { orderBy: { createdAt: 'asc' } },
        emails: { orderBy: { receivedAt: 'desc' }, take: 5 },
      },
      orderBy: { lastUpdated: 'desc' },
    });

    res.json(applications);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// GET /api/applications/stats
router.get('/stats', auth, async (req, res) => {
  try {
    const grouped = await prisma.application.groupBy({
      by: ['status'],
      where: { userId: req.user.userId },
      _count: { id: true },
    });

    const stats = { Applied: 0, Interview: 0, Offer: 0, Rejected: 0, Withdrawn: 0, Other: 0 };
    grouped.forEach(({ status, _count }) => { stats[status] = _count.id; });

    res.json({ byStatus: stats, total: Object.values(stats).reduce((a, b) => a + b, 0) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// PATCH /api/applications/:id — manual update (status, notes, etc.)
router.patch('/:id', auth, async (req, res) => {
  try {
    const { status, notes, jobUrl, recruiterName, recruiterEmail } = req.body;

    const app = await prisma.application.findFirst({
      where: { id: req.params.id, userId: req.user.userId },
    });
    if (!app) return res.status(404).json({ error: 'Not found' });

    const updated = await prisma.application.update({
      where: { id: req.params.id },
      data: {
        ...(status && { status }),
        ...(notes !== undefined && { notes }),
        ...(jobUrl && { jobUrl }),
        ...(recruiterName && { recruiterName }),
        ...(recruiterEmail && { recruiterEmail }),
        ...(status && status !== app.status && {
          statusHistory: {
            create: { status, emailSubject: 'Manual update', emailDate: new Date(), confidence: 1.0 },
          },
        }),
      },
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Update failed' });
  }
});

// DELETE /api/applications/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    await prisma.application.deleteMany({
      where: { id: req.params.id, userId: req.user.userId },
    });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

module.exports = router;