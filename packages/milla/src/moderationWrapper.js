/**
 * Moderation wrapper — MILLA output goes through moderation check before acting.
 * https://milloapp.com
 */
let checkFn = async () => true;

function setModerationCheck(fn) {
  checkFn = fn;
}

async function checkContent(content, streamId) {
  return checkFn(content, streamId);
}

module.exports = { checkContent, setModerationCheck };
