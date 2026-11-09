import { Util, Fmt, CAT, BUDGETS, TIME, DURATIONS, GENDER, PLACES, INTEREST_TAGS, ApiError } from './core.js';
import { t } from '../i18n/index.js';

/* =============================================================================
   Fachlogik, die beide Backends teilen (Mock und Supabase):
   Validierung, Entfernung, Kompatibilität, Vorschau-Texte.
   Gehört zur Datenschicht – die UI nutzt sie nur indirekt über den DataService.
   ============================================================================= */

function validationError(fields, message = t('errors.VALIDATION')) {
  const e = new ApiError(message, 'VALIDATION');
  e.fields = fields;
  return e;
}

/* ---------- Entfernung ---------- */
function coordsFor(city) {
  if (!city) return null;
  const c = city.trim().toLowerCase();
  const keys = Object.keys(PLACES);
  const key = keys.find(k => k.toLowerCase() === c) || keys.find(k => c.length >= 3 && k.toLowerCase().includes(c));
  return key ? PLACES[key] : null;
}
function haversine([lat1, lon1], [lat2, lon2]) {
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
/** Simulierte Entfernung: Stadtteil-Koordinaten + stabiler Zufallsanteil („genaue Adresse“). */
function distanceKm(a, b) {
  const jitter = (Util.hash([a.id, b.id].sort().join('|')) % 1000) / 1000;
  const ca = coordsFor(a.city), cb = coordsFor(b.city);
  const d = (ca && cb) ? haversine(ca, cb) + 0.6 + jitter * 1.8 : 3 + jitter * 30;
  return Math.round(d * 10) / 10;
}
function compatible(a, b) {
  return (a.interestedIn || []).includes(b.gender) && (b.interestedIn || []).includes(a.gender);
}

/* ---------- Validierung ---------- */
function validateCredentials({ email, password, passwordRepeat }) {
  const f = {};
  const em = String(email || '').trim().toLowerCase();
  if (!Util.isValidEmail(em)) f.email = t('validation.email');
  if (String(password || '').length < 8) f.password = t('validation.passwordMin');
  if (password !== passwordRepeat) f.passwordRepeat = t('validation.passwordMismatch');
  if (Object.keys(f).length) throw validationError(f);
  return em;
}

function validateIdea(data) {
  const f = {};
  const title = String(data.title || '').trim();
  const description = String(data.description || '').trim();
  const location = String(data.location || '').trim();
  if (title.length < 5) f.title = t('validation.idea.titleMin');
  else if (title.length > 80) f.title = t('validation.idea.titleMax');
  if (description.length < 20) f.description = t('validation.idea.descriptionMin');
  else if (description.length > 300) f.description = t('validation.idea.descriptionMax');
  if (!CAT[data.category]) f.category = t('validation.idea.category');
  if (!BUDGETS.some(b => b.value === data.budget)) f.budget = t('validation.idea.budget');
  if (!DURATIONS.includes(data.duration)) f.duration = t('validation.idea.duration');
  if (!TIME[data.timeOfDay]) f.timeOfDay = t('validation.idea.timeOfDay');
  if (location.length < 3) f.location = t('validation.idea.locationMin');
  else if (location.length > 70) f.location = t('validation.idea.locationMax');
  if (Object.keys(f).length) throw validationError(f);
  return { title, description, category: data.category, budget: data.budget, duration: data.duration, timeOfDay: data.timeOfDay, location,
    emoji: String(data.emoji || CAT[data.category].emoji).slice(0, 8) };
}

function validateProfilePatch(p) {
  const f = {};
  const out = {};
  if ('name' in p) {
    const name = String(p.name || '').trim().replace(/\s+/g, ' ');
    if (name.length < 2) f.name = t('validation.profile.nameMin');
    else if (name.length > 30) f.name = t('validation.profile.nameMax');
    else if (!/^[\p{L}][\p{L}' -]*$/u.test(name)) f.name = t('validation.profile.nameLetters');
    out.name = name;
  }
  if ('birthdate' in p) {
    const age = Util.ageFrom(p.birthdate);
    if (!p.birthdate || age === null) f.birthdate = t('validation.profile.birthdateMissing');
    else if (age < 18) f.birthdate = t('validation.profile.underage');
    else if (age > 100) f.birthdate = t('validation.profile.birthdateInvalid');
    out.birthdate = p.birthdate;
  }
  if ('gender' in p) { if (!GENDER[p.gender]) f.gender = t('validation.profile.gender'); out.gender = p.gender; }
  if ('interestedIn' in p) {
    const arr = Array.isArray(p.interestedIn) ? p.interestedIn.filter(g => GENDER[g]) : [];
    if (!arr.length) f.interestedIn = t('validation.profile.interestedIn');
    out.interestedIn = arr;
  }
  if ('city' in p) {
    const city = String(p.city || '').trim();
    if (city.length < 2) f.city = t('validation.profile.cityMin');
    else if (city.length > 60) f.city = t('validation.profile.cityMax');
    out.city = city;
  }
  if ('bio' in p) {
    const bio = String(p.bio || '').trim();
    if (bio.length > 300) f.bio = t('validation.profile.bioMax');
    out.bio = bio;
  }
  if ('interests' in p) {
    const tags = Array.isArray(p.interests) ? [...new Set(p.interests.filter(tag => INTEREST_TAGS.includes(tag)))] : [];
    if (tags.length < 3) f.interests = t('validation.profile.interestsMin');
    else if (tags.length > 10) f.interests = t('validation.profile.interestsMax');
    out.interests = tags;
  }
  if ('photos' in p) {
    const photos = Array.isArray(p.photos) ? p.photos.slice(0, 3).map((ph, i) => ({
      id: ph.id || Util.uid('ph' + i), colors: [String(ph.colors[0]), String(ph.colors[1])], emoji: ph.emoji || null, pattern: Number(ph.pattern) || 0,
    })) : [];
    if (!photos.length) f.photos = t('validation.profile.photos');
    out.photos = photos;
  }
  if ('onboardingStep' in p) out.onboardingStep = Math.max(0, Number(p.onboardingStep) || 0);
  if (Object.keys(f).length) throw validationError(f);
  return out;
}

function validateMessage(text) {
  const msg = String(text || '').trim();
  if (!msg) throw new ApiError(t('validation.chat.empty'), 'VALIDATION');
  if (msg.length > 1000) throw new ApiError(t('validation.chat.tooLong'), 'VALIDATION');
  return msg;
}

/** Prüft einen Terminvorschlag und gibt ihn als Date zurück. */
function validateProposalDate(dateTime) {
  const MIN = 60000, DAY = 86400000;
  const d = new Date(dateTime);
  if (isNaN(d)) throw validationError({ dateTime: t('validation.proposal.missing') });
  if (d.getTime() < Date.now() + 10 * MIN) throw validationError({ dateTime: t('validation.proposal.past') });
  if (d.getTime() > Date.now() + 365 * DAY) throw validationError({ dateTime: t('validation.proposal.tooFar') });
  return d;
}

/* ---------- Anzeige ---------- */
function proposalPreview(p, meId, otherName) {
  const when = Fmt.dateShort(p.dateTime);
  if (p.status === 'confirmed') return t('chat.proposalPreview.confirmed', { when });
  if (p.status === 'declined') return t('chat.proposalPreview.declined');
  return p.proposedBy === meId ? t('chat.proposalPreview.mine', { when }) : t('chat.proposalPreview.theirs', { name: otherName, when });
}

/** Feed-Filter und Reihenfolge (täglich wechselnd, Nähe leicht bevorzugt) – für beide Backends gleich. */
function filterAndSortFeed(items, filters, meId) {
  let out = items;
  if (filters.categories && filters.categories.length) out = out.filter(x => filters.categories.includes(x.idea.category));
  if (filters.budgets && filters.budgets.length) out = out.filter(x => filters.budgets.includes(x.idea.budget));
  if (filters.times && filters.times.length) out = out.filter(x => filters.times.includes(x.idea.timeOfDay));
  if (filters.maxDistance) out = out.filter(x => x.distanceKm <= filters.maxDistance);
  const day = new Date().toDateString();
  const score = x => (Util.hash(meId + day + x.idea.id) % 1000) / 1000 * 18 + x.distanceKm * 0.35;
  return [...out].sort((a, b) => score(a) - score(b));
}

export { validationError, coordsFor, haversine, distanceKm, compatible, validateCredentials, validateIdea, validateProfilePatch,
  validateMessage, validateProposalDate, proposalPreview, filterAndSortFeed };
