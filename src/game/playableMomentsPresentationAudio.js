const AUDIO_CUES = Object.freeze(['strike', 'keeper', 'net', 'woodwork', 'whistle', 'crowd']);
let audioContext = null;
let unlocked = false;

function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value) || 0)); }

export function playablePresentationAudioCues(moment = {}, resolution = {}) {
  const shot = resolution?.shot ?? resolution ?? {};
  const finish = shot?.finish ?? null;
  const intervention = shot?.goalkeeperIntervention
    ?? shot?.presentation?.goalkeeperIntervention
    ?? shot?.presentation?.keeper?.intervention
    ?? null;
  const cues = [];
  if (moment?.setPiece?.kind) cues.push('whistle');
  if (finish) cues.push('strike');
  if (finish === 'saved' || intervention) cues.push('keeper');
  if (finish === 'goal') cues.push('net', 'crowd');
  if (finish === 'woodwork' || shot?.presentation?.contact === 'woodwork') cues.push('woodwork');
  return [...new Set(cues.filter(cue => AUDIO_CUES.includes(cue)))];
}

function contextCtor() {
  return globalThis?.AudioContext ?? globalThis?.webkitAudioContext ?? null;
}

export async function unlockPlayablePresentationAudio() {
  const Ctor = contextCtor();
  if (!Ctor) return false;
  try {
    audioContext ??= new Ctor();
    if (audioContext.state === 'suspended') await audioContext.resume();
    unlocked = audioContext.state === 'running';
    return unlocked;
  } catch {
    return false;
  }
}

function oscillatorCue(context, destination, { frequency, endFrequency = frequency, duration, gain, type = 'sine' }) {
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
  envelope.gain.setValueAtTime(.0001, now);
  envelope.gain.exponentialRampToValueAtTime(Math.max(.0001, gain), now + .012);
  envelope.gain.exponentialRampToValueAtTime(.0001, now + duration);
  oscillator.connect(envelope).connect(destination);
  oscillator.start(now);
  oscillator.stop(now + duration + .02);
}

function noiseCue(context, destination, duration, gain) {
  const length = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const source = context.createBufferSource();
  const envelope = context.createGain();
  source.buffer = buffer;
  envelope.gain.value = gain;
  source.connect(envelope).connect(destination);
  source.start();
}

export function playPlayablePresentationCue(cue, { enabled = true, volume = .45 } = {}) {
  if (!enabled || !unlocked || !audioContext || !AUDIO_CUES.includes(cue)) return false;
  const master = audioContext.createGain();
  master.gain.value = clamp(volume, 0, 1) * .36;
  master.connect(audioContext.destination);
  try {
    if (cue === 'strike') oscillatorCue(audioContext, master, { frequency:145, endFrequency:72, duration:.09, gain:.65, type:'triangle' });
    else if (cue === 'keeper') oscillatorCue(audioContext, master, { frequency:110, endFrequency:65, duration:.13, gain:.45, type:'square' });
    else if (cue === 'net') noiseCue(audioContext, master, .18, .24);
    else if (cue === 'woodwork') oscillatorCue(audioContext, master, { frequency:880, endFrequency:650, duration:.15, gain:.38, type:'sine' });
    else if (cue === 'whistle') oscillatorCue(audioContext, master, { frequency:2200, endFrequency:1850, duration:.16, gain:.2, type:'square' });
    else if (cue === 'crowd') noiseCue(audioContext, master, .44, .16);
    return true;
  } catch {
    return false;
  }
}

export function playCommittedPlayablePresentationAudio(moment, resolution, preferences = {}) {
  const cues = playablePresentationAudioCues(moment, resolution);
  cues.forEach((cue, index) => {
    const run = () => playPlayablePresentationCue(cue, preferences);
    if (index === 0) run();
    else globalThis?.setTimeout?.(run, index * 90);
  });
  return cues;
}
