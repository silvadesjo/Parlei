// POST /api/lookup — dictionary entry for the Vocabulary tab, written by Claude.
// Needs ANTHROPIC_API_KEY on Vercel. Each person gets a daily limit (LOOKUP_DAILY_LIMIT, default 150).
import {admin, env, verifyUser, fail, timeZone} from './_lib/core.js';
import {FieldValue} from 'firebase-admin/firestore';

const ROMAN = {ar:'Franco-Arabic (Arabizi), using numbers such as 2, 3, 5, 7 and 9 for Arabic sounds, e.g. 7abibi', ja:'rōmaji', ko:'Revised Romanization', 'zh-CN':'pinyin with tone marks'};
const LANGS = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$|^x-[a-z0-9-]{1,40}$/;

export function buildPrompt({lang, langName, term, meaning}){
  const L = String(langName || lang).slice(0, 40);
  if (String(lang).split('-')[0] === 'en') return `You are an English dictionary for a language learner.
Word or phrase: "${term || meaning}"
Give the dictionary entry for it (correct the spelling if needed).
Reply with only this JSON object:
{"found": true or false (false if this is not a real English word or phrase),
 "term": "the headword, spelled correctly",
 "meaning": "a short, plain definition, at most 12 words; separate distinct senses with ; ",
 "pos": "part of speech, e.g. noun, verb, adjective, expression",
 "note": "register or usage worth knowing, at most 12 words, or empty",
 "example": "one short, natural example sentence",
 "exampleEn": ""}`;
  return `You are a bilingual ${L}–English dictionary for a learner whose main language is English.
${L} box: "${term}"
English box: "${meaning}"
If the ${L} box has text, give the dictionary entry for it (correct the spelling and accents if needed). If only the English box has text, give the most common ${L} word or phrase for it.
Reply with only this JSON object:
{"found": true or false (false if this is not a real ${L} word or phrase),
 "term": "the headword as a learner should save it; for nouns include the article, e.g. la boulangerie",
 "meaning": "short English meaning, at most 8 words; separate distinct senses with ; ",
 "pos": "part of speech, e.g. noun, verb, adjective, expression",
 "note": "gender, register or regional usage worth knowing, at most 12 words, or empty",
 "example": "one short, natural example sentence in ${L}",
 "exampleEn": "the English translation of the example"${ROMAN[lang] ? `,
 "roman": "the headword in Latin letters: ${ROMAN[lang]}"` : ''}}${ROMAN[lang] ? `
The ${L} box may be written in ${L} script or in Latin letters; always give "term" in ${L} script.` : ''}`;
}

export function parseJson(text){
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('No JSON in reply');
  return JSON.parse(text.slice(a, b + 1));
}

export default async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).json({code:'method'});
  try {
    const key = env('ANTHROPIC_API_KEY');
    if (!key) return res.status(501).json({code:'lookup_off', message:'Look up is not set up'});
    const user = await verifyUser(req);
    const q = req.body || {};
    const term = String(q.term || '').slice(0, 120), meaning = String(q.meaning || '').slice(0, 200), lang = String(q.lang || '');
    if (!term && !meaning) return res.status(400).json({code:'empty'});
    if (!LANGS.test(lang)) return res.status(400).json({code:'bad_lang'});

    // daily limit per person
    const limit = Number(env('LOOKUP_DAILY_LIMIT')) || 150;
    const day = new Intl.DateTimeFormat('en-CA', {timeZone:timeZone()}).format(new Date());
    const ref = admin().db.doc(`usage/${user.uid}_${day}`);
    const count = await admin().db.runTransaction(async tx => { const s = await tx.get(ref); const n = (s.exists ? s.data().lookups || 0 : 0) + 1; tx.set(ref, {lookups:FieldValue.increment(1), at:Date.now()}, {merge:true}); return n; });
    if (count > limit) return res.status(429).json({code:'daily_limit'});

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'x-api-key':key, 'anthropic-version':'2023-06-01', 'content-type':'application/json'},
      body:JSON.stringify({model:env('LOOKUP_MODEL') || 'claude-haiku-5-5', max_tokens:500, messages:[{role:'user', content:buildPrompt({lang, langName:q.langName, term, meaning})}]})
    });
    if (!r.ok) { console.error('Anthropic API error', r.status, await r.text().catch(() => '')); return res.status(502).json({code:'upstream_error'}); }
    const data = await r.json();
    const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    const entry = parseJson(text);
    res.status(200).json({found:entry.found !== false, term:String(entry.term || ''), meaning:String(entry.meaning || ''), pos:String(entry.pos || ''), note:String(entry.note || ''), example:String(entry.example || ''), exampleEn:String(entry.exampleEn || ''), roman:String(entry.roman || '')});
  } catch (e) { fail(res, e); }
}
