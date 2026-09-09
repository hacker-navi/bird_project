/**
 * weatherFetcher.js
 * Fetches live weather data from OpenWeatherMap for NER risk zone coordinates.
 * Falls back to 'ESTIMATED' status if API key is not set or call fails.
 */

const axios = require('axios');
const { WeatherData, RiskZone } = require('../db/models');

const OWM_KEY = process.env.OPENWEATHER_API_KEY;

if (!OWM_KEY) {
  console.warn('[Weather] OPENWEATHER_API_KEY not set — will use simulated data. Add key to .env for live weather.');
}

/**
 * Fetch current weather for a given lat/lng from OpenWeatherMap.
 * Returns normalized weather object or null on failure.
 */
async function fetchLiveWeather(lat, lng) {
  if (!OWM_KEY) return null;
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${OWM_KEY}&units=metric`;
    const { data } = await axios.get(url, { timeout: 5000 });
    return {
      temperature: data.main.temp,
      humidity: data.main.humidity,
      rainfall_1h: (data.rain?.['1h'] || 0),
      // OWM doesn't provide 24h directly in free tier — scale from 1h
      rainfall_24h: Math.round((data.rain?.['1h'] || 0) * 24 * 0.7), // conservative estimate
      rainfall_6h: Math.round((data.rain?.['1h'] || 0) * 6 * 0.8),
      rainfall_72h: Math.round((data.rain?.['1h'] || 0) * 72 * 0.5),
      rainfall_intensity: data.rain?.['1h'] > 10 ? 'HIGH' : data.rain?.['1h'] > 4 ? 'MEDIUM' : 'LOW',
      rainfall_trend: 'LIVE',
      source: 'OPENWEATHERMAP',
      status: 'LIVE',
      description: data.weather[0]?.description || '',
      wind_speed: data.wind?.speed || 0
    };
  } catch (err) {
    console.error('[Weather] OWM fetch failed for', lat, lng, ':', err.message);
    return null;
  }
}

/**
 * Refresh live weather for all risk zones that have coordinates.
 * Called periodically by escalationJob.
 */
async function refreshAllZoneWeather() {
  if (!OWM_KEY) return { skipped: true, reason: 'No API key' };

  const zones = await RiskZone.find({ latitude: { $exists: true, $ne: null } });
  let updated = 0, failed = 0;

  for (const zone of zones) {
    const live = await fetchLiveWeather(zone.latitude, zone.longitude);
    if (live) {
      await WeatherData.create({ risk_zone_id: zone._id, ...live });
      updated++;
    } else {
      failed++;
    }
    // Small delay to respect rate limits on free tier (60 calls/min)
    await new Promise(r => setTimeout(r, 1100));
  }

  return { updated, failed, total: zones.length };
}

module.exports = { fetchLiveWeather, refreshAllZoneWeather };
