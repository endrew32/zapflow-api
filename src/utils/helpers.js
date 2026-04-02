function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function parseSpintax(text) {
  let result = text;
  for (let i = 0; i < 5; i++) {
    const prev = result;
    result = result.replace(/\{([^{}]+)\}/g, (_, group) => {
      const options = group.split('|');
      return options[Math.floor(Math.random() * options.length)];
    });
    if (result === prev) break;
  }
  return result;
}

function formatPhone(number) {
  let clean = number.replace(/\D/g, '');
  if (!clean.startsWith('55')) clean = '55' + clean;
  return `${clean}@s.whatsapp.net`;
}

function typingDelay(text) {
  const ms = (text.length / 40) * 1000;
  return Math.min(Math.max(ms, 1000), 8000);
}

function getIntervalByPhase(phase) {
  const ranges = {
    initial: [60000, 180000],
    intermediate: [45000, 120000],
    stable: [30000, 90000],
  };
  const [min, max] = ranges[phase] || ranges.stable;
  return randomBetween(min, max);
}

function getDailyLimit(phase, day) {
  if (phase === 'initial') return Math.min(5 + Math.floor((day - 1) * (10 / 6)), 15);
  if (phase === 'intermediate') return Math.min(15 + Math.floor((day - 1) * (25 / 13)), 40);
  return Math.min(40 + Math.floor((day - 1) * (40 / 13)), 80);
}

function advanceWarmup(instance) {
  const { warmup_phase, warmup_day } = instance;
  let newPhase = warmup_phase;
  let newDay = warmup_day + 1;
  if (warmup_phase === 'initial' && newDay > 7) { newPhase = 'intermediate'; newDay = 1; }
  else if (warmup_phase === 'intermediate' && newDay > 14) { newPhase = 'stable'; newDay = 1; }
  else if (warmup_phase === 'stable' && newDay > 14) { newDay = 14; }
  return { warmup_phase: newPhase, warmup_day: newDay, daily_limit: getDailyLimit(newPhase, newDay) };
}

module.exports = { sleep, randomBetween, parseSpintax, formatPhone, typingDelay, getIntervalByPhase, getDailyLimit, advanceWarmup };
