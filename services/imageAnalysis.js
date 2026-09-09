/**
 * imageAnalysis.js
 * Wraps local Ollama models to:
 *  1. Analyze a photo and check if it matches the reported incident type (using llama3.2-vision:11b)
 *  2. Analyze a text description for hazard keywords (using qwen3:latest)
 * Runs completely locally, no internet or cloud API keys required.
 */

const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434/api/generate').replace('localhost', '127.0.0.1');
const VISION_MODEL = process.env.VISION_MODEL || 'llama3.2-vision:11b';
const TEXT_MODEL = process.env.TEXT_MODEL || 'qwen3:latest';

const HAZARD_KEYWORDS = {
  'Landslide':    ['landslide', 'debris', 'slope failure', 'mudflow', 'earth movement', 'slope collapse', 'fallen earth', 'hillslide'],
  'Rock Fall':    ['rock', 'boulder', 'rockfall', 'stone', 'falling rock', 'cliff', 'rock debris'],
  'Mud Movement': ['mud', 'mudslide', 'clay', 'silt', 'brown flow', 'mud stream', 'wet soil'],
  'Ground Crack': ['crack', 'fissure', 'split', 'fracture', 'crevice', 'ground opening', 'soil crack'],
  'Road Crack':   ['crack', 'road damage', 'asphalt', 'tarmac', 'pavement', 'road fracture', 'road split'],
  'Flooding':     ['flood', 'water', 'inundation', 'waterlogging', 'submersion', 'overflow'],
  'Blocked Road': ['blocked', 'obstruction', 'debris on road', 'road closure', 'road blocked', 'traffic blockage'],
  'Other Hazard': ['hazard', 'danger', 'risk', 'unstable', 'collapse']
};

const SEVERITY_INDICATORS = ['severe', 'major', 'large', 'significant', 'massive', 'extensive', 'wide', 'deep', 'critical', 'serious'];

/**
 * Perform a POST request to Ollama REST API using native fetch
 */
async function ollamaGenerate(model, prompt, images = [], format = 'json') {
  const payload = {
    model,
    prompt,
    stream: false,
    format: format
  };
  
  if (images && images.length > 0) {
    payload.images = images;
  }

  const response = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90000) // 90s for local vision inference
  });

  if (!response.ok) {
    let errorDetail = response.statusText;
    try {
      const errJson = await response.json();
      if (errJson && errJson.error) errorDetail = errJson.error;
    } catch (_) {}
    throw new Error(`Ollama API error (${response.status}): ${errorDetail}`);
  }

  const data = await response.json();
  return data.response;
}

function cleanJsonResponse(text) {
  if (!text) return '{}';
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  cleaned = cleaned.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

/**
 * Analyze a base64 image against the expected incident type.
 * Returns: { match, confidence (0-100), detected_type, ai_description, severity, analyzed_at }
 */
async function analyzeIncidentImage(base64Image, incidentType, mimeType = 'image/jpeg') {
  if (!base64Image) {
    return neutralResult(incidentType, 'NO_IMAGE');
  }

  try {
    const prompt = `You are an AI assistant helping analyze photos submitted to a landslide early warning system in Northeast India.

The citizen reported this incident type: "${incidentType}"

Analyze the image and respond with ONLY a JSON object (no markdown, no extra text):
{
  "contains_hazard": true or false,
  "detected_hazard_type": "best matching type from: Landslide, Rock Fall, Mud Movement, Ground Crack, Road Crack, Flooding, Blocked Road, Other Hazard, None",
  "matches_reported_type": true or false,
  "confidence": number from 0 to 100 (how confident you are this image shows the reported hazard),
  "severity": "LOW", "MEDIUM", or "HIGH",
  "description": "1-2 sentence description of what you see in the image relevant to landslide/geological hazard",
  "visible_features": ["list", "of", "visible", "hazard", "features"]
}

Be conservative — only say matches_reported_type=true if the image clearly shows evidence of the reported hazard.`;

    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');

    console.log(`[ImageAI] Analyzing image with local ${VISION_MODEL}...`);
    const text = await ollamaGenerate(VISION_MODEL, prompt, [base64Data], 'json');

    const jsonStr = cleanJsonResponse(text);
    const parsed = JSON.parse(jsonStr);

    const match = parsed.matches_reported_type === true;
    let confidence = Number(parsed.confidence) || 0;
    // If no hazard detected, cap confidence at 30
    if (!parsed.contains_hazard) confidence = Math.min(confidence, 30);
    // If matches perfectly, minimum confidence is 60
    if (match && confidence < 60) confidence = 60;

    return {
      match,
      confidence: Math.round(Math.min(100, Math.max(0, confidence))),
      detected_type: parsed.detected_hazard_type || 'Unknown',
      ai_description: parsed.description || '',
      severity: parsed.severity || 'LOW',
      visible_features: parsed.visible_features || [],
      analyzed_at: new Date().toISOString(),
      source: 'OLLAMA_VISION'
    };
  } catch (err) {
    if (err.message.includes('mllama') || err.message.includes('unknown model architecture')) {
      console.error('[ImageAI] ⚠ Ollama Error: Your installed Ollama version is missing "mllama" architecture support needed by llama3.2-vision.');
      console.error('[ImageAI] 👉 Solution 1: Update Ollama (run: winget upgrade Ollama.Ollama or download from https://ollama.com/download)');
      console.error('[ImageAI] 👉 Solution 2: Pull llava (run: ollama pull llava, then set VISION_MODEL=llava in .env)');
    } else {
      console.error('[ImageAI] Local vision analysis failed:', err.message);
    }
    return neutralResult(incidentType, 'ANALYSIS_ERROR');
  }
}

/**
 * Analyze a text description for hazard severity keywords.
 * Used when no image is available but description was provided.
 * Returns: { severity_score (0-30), keywords_found, ai_enhanced }
 */
async function analyzeTextDescription(description, incidentType) {
  if (!description || description.trim().length < 5) {
    return { severity_score: 0, keywords_found: [], ai_enhanced: false };
  }

  const lower = description.toLowerCase();

  // Rule-based keyword matching
  const hazardKw = HAZARD_KEYWORDS[incidentType] || HAZARD_KEYWORDS['Other Hazard'];
  const foundHazard = hazardKw.filter(kw => lower.includes(kw));
  const foundSeverity = SEVERITY_INDICATORS.filter(kw => lower.includes(kw));

  let score = Math.min(20, foundHazard.length * 6) + Math.min(10, foundSeverity.length * 5);

  // Enhance with local LLM
  try {
    const prompt = `Rate this landslide hazard report description on a scale of 0-30 for evidence severity.
Incident type: "${incidentType}"
Description: "${description}"
Reply ONLY with a JSON: {"score": number, "reason": "brief reason"}`;

    const text = await ollamaGenerate(TEXT_MODEL, prompt, [], 'json');
    const jsonStr = cleanJsonResponse(text);
    const parsed = JSON.parse(jsonStr);
    
    score = Math.max(score, Number(parsed.score) || 0);
    return { severity_score: Math.min(30, score), keywords_found: foundHazard, ai_reason: parsed.reason, ai_enhanced: true };
  } catch (e) {
    console.error('[ImageAI] Local text analysis failed:', e.message);
    // Fall through to rule-based result
  }

  return { severity_score: Math.min(30, score), keywords_found: foundHazard, ai_enhanced: false };
}

function neutralResult(incidentType, reason) {
  return {
    match: false,
    confidence: 0,
    detected_type: 'NOT_ANALYZED',
    ai_description: '',
    severity: 'LOW',
    visible_features: [],
    analyzed_at: new Date().toISOString(),
    source: reason,
    skipped: true
  };
}

module.exports = { analyzeIncidentImage, analyzeTextDescription };
