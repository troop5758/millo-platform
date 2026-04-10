/**
 * Scheduled PPV Drops — release premium content at scheduled times.
 * Creators schedule releases (e.g. "Premium video releases Friday 8PM").
 * Run via cron every 1 minute.
 * https://milloapp.com
 */
const db = require('@millo/database');

async function releaseScheduledPPV() {
  const now = new Date();
  const scheduled = await db.PpvContent.find({
    scheduledRelease: { $lte: now, $ne: null },
    isActive: false,
  });

  const released = [];
  for (const content of scheduled) {
    content.isActive = true;
    await content.save();
    released.push({
      contentId: content._id.toString(),
      title: content.title,
      scheduledRelease: content.scheduledRelease,
    });
  }

  return { released: released.length, items: released };
}

module.exports = { releaseScheduledPPV };
