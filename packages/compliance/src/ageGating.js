/**
 * Age gating — minimum age enforcement. Uses Profile.dateOfBirth when present.
 * https://milloapp.com
 */
const db = require('@millo/database');

const MINIMUM_AGE_YEARS = 13;

function ageFromDateOfBirth(dateOfBirth) {
  if (!dateOfBirth) return null;
  const dob = dateOfBirth instanceof Date ? dateOfBirth : new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

async function getAge(userId) {
  const profile = await db.Profile.findOne({ userId }).lean();
  if (!profile || !profile.dateOfBirth) return null;
  return ageFromDateOfBirth(profile.dateOfBirth);
}

async function isAgeAllowed(userId, minimumAgeYears = MINIMUM_AGE_YEARS) {
  const age = await getAge(userId);
  if (age === null) return { allowed: null, reason: 'age_unknown' };
  if (age < minimumAgeYears) return { allowed: false, age, reason: 'below_minimum' };
  return { allowed: true, age };
}

module.exports = { getAge, isAgeAllowed, ageFromDateOfBirth, MINIMUM_AGE_YEARS };
