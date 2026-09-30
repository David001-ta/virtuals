const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const schema = {
  type: 'object',
  properties: {
    matches: {
      type: 'array',
      description: 'Every clearly readable virtual-football fixture in the screenshot.',
      items: {
        type: 'object',
        properties: {
          league: { type: 'string', description: 'League, competition or screen section if visible; otherwise Virtual Football.' },
          home: { type: 'string', description: 'Exactly the readable home-team name.' },
          away: { type: 'string', description: 'Exactly the readable away-team name.' },
          homeProbability: { type: 'number', description: 'Model estimate from 0 to 100 for home win.' },
          drawProbability: { type: 'number', description: 'Model estimate from 0 to 100 for draw.' },
          awayProbability: { type: 'number', description: 'Model estimate from 0 to 100 for away win.' },
          confidence: { type: 'number', description: '0 to 100 confidence in the extraction/analysis, not confidence that an outcome will occur.' },
          reason: { type: 'string', description: 'Short explanation based only on information visible in the screenshot and the model estimate.' },
          correctScores: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                score: { type: 'string', description: 'Estimated score such as 1-0.' },
                probability: { type: 'number', description: 'Relative model estimate from 0 to 100.' }
              },
              required: ['score', 'probability']
            }
          }
        },
        required: ['league', 'home', 'away', 'homeProbability', 'drawProbability', 'awayProbability', 'confidence', 'reason', 'correctScores']
      }
    }
  },
  required: ['matches']
};

function normalize(result) {
  const matches = Array.isArray(result?.matches) ? result.matches : [];
  return {
    matches: matches.map((m) => {
      let h = Math.max(0, Number(m.homeProbability) || 0);
      let d = Math.max(0, Number(m.drawProbability) || 0);
      let a = Math.max(0, Number(m.awayProbability) || 0);
      const sum = h + d + a;
      if (sum > 0) {
        h = (h / sum) * 100;
        d = (d / sum) * 100;
        a = (a / sum) * 100;
      }
      const scores = Array.isArray(m.correctScores) ? m.correctScores.slice(0, 3).map(s => ({
        score: String(s?.score || ''),
        probability: Math.max(0, Math.min(100, Number(s?.probability) || 0))
      })) : [];
      return {
        league: String(m.league || 'Virtual Football'),
        home: String(m.home || ''),
        away: String(m.away || ''),
        homeProbability: Number(h.toFixed(1)),
        drawProbability: Number(d.toFixed(1)),
        awayProbability: Number(a.toFixed(1)),
        confidence: Math.max(0, Math.min(100, Number(m.confidence) || 0)),
        reason: String(m.reason || ''),
        correctScores: scores
      };
    }).filter(m => m.home && m.away)
  };
}

function outputText(data) {
  if (typeof data?.output_text === 'string') return data.output_text;
  const blocks = [];
  for (const step of data?.steps || []) {
    for (const item of step?.content || []) {
      if (item?.type === 'text' && typeof item.text === 'string') blocks.push(item.text);
    }
  }
  return blocks.join('');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { image, mimeType } = req.body || {};
    if (!image || !/^image\/(png|jpe?g|webp)$/i.test(mimeType || '')) {
      return res.status(400).json({ error: 'Please provide a PNG, JPG, JPEG or WEBP screenshot.' });
    }

    const base64 = String(image).includes(',') ? String(image).split(',')[1] : String(image);
    const estimatedBytes = Math.floor((base64.length * 3) / 4);
    if (estimatedBytes > MAX_IMAGE_BYTES) {
      return res.status(413).json({ error: 'Screenshot is too large. Please use an image under 15 MB.' });
    }

    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on Vercel.' });

    const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    const prompt = `You are VirtualSwins' screenshot-analysis engine for virtual football.

Analyze ONLY the supplied screenshot. First identify every fixture whose home and away team names are clearly readable. Do not invent, autocomplete or guess a team name that cannot be read. Ignore navigation, ads and unrelated text.

For each readable fixture, produce Home/Draw/Away percentage estimates. These are model estimates, not bookmaker odds, guarantees, or statistically validated probabilities. Use only the visible screenshot information; do not claim you have access to hidden match data, a bookmaker feed, or a proprietary sports database.

Make Home + Draw + Away equal exactly 100 after rounding as closely as possible. Confidence measures the quality of the screenshot extraction and analysis, NOT the likelihood that a prediction will win.

Return up to three illustrative correct-score estimates when useful. If no fixture is readable, return an empty matches array.`;

    const payload = {
      model,
      input: [
        { type: 'text', text: prompt },
        { type: 'image', data: base64, mime_type: mimeType }
      ],
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema
      }
    };

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
        'Api-Revision': '2026-05-20'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || 'Gemini request failed.' });
    }

    const raw = outputText(data);
    if (!raw) return res.status(502).json({ error: 'Gemini returned no analysis.' });

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(502).json({ error: 'Gemini returned an invalid structured response.' });
    }

    return res.status(200).json({ result: normalize(parsed), model });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Unexpected server error.' });
  }
}
