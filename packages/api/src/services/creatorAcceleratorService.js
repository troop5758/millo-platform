'use strict';
/**
 * Phase 6 — Millo Creator Accelerator. Featured creators, bonus visibility, grants, algorithm boost.
 * https://milloapp.com
 */
const db = require('@millo/database');

async function getOrCreate(creatorId) {
  let acc = await db.CreatorAccelerator.findOne({ creatorId });
  if (!acc) {
    acc = await db.CreatorAccelerator.create({
      creatorId,
      featured: false,
      bonusVisibility: 0,
      algorithmBoost: 0,
      grantCents: 0,
      grantStatus: 'none',
    });
  }
  return acc;
}

async function getFeaturedCreators(limit) {
  limit = limit || 10;
  return db.CreatorAccelerator.find({ featured: true })
    .sort({ algorithmBoost: -1, bonusVisibility: -1 })
    .limit(limit)
    .populate('creatorId', 'email')
    .lean();
}

async function setFeatured(creatorId, featured) {
  const acc = await getOrCreate(creatorId);
  acc.featured = !!featured;
  await acc.save();
  return acc;
}

async function setAlgorithmBoost(creatorId, boost) {
  const acc = await getOrCreate(creatorId);
  acc.algorithmBoost = Math.max(0, Math.min(100, Number(boost) || 0));
  await acc.save();
  return acc;
}

async function setBonusVisibility(creatorId, pct) {
  const acc = await getOrCreate(creatorId);
  acc.bonusVisibility = Math.max(0, Math.min(100, Number(pct) || 0));
  await acc.save();
  return acc;
}

async function awardGrant(creatorId, amountCents) {
  const acc = await getOrCreate(creatorId);
  acc.grantCents = amountCents;
  acc.grantStatus = 'awarded';
  await acc.save();
  return acc;
}

async function enroll(creatorId) {
  const acc = await getOrCreate(creatorId);
  acc.enrolledAt = acc.enrolledAt || new Date();
  await acc.save();
  return acc;
}

module.exports = {
  getOrCreate,
  getFeaturedCreators,
  setFeatured,
  setAlgorithmBoost,
  setBonusVisibility,
  awardGrant,
  enroll,
};
