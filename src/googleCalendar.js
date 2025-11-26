/**
 * Google Calendar API Integration with OAuth 2.0
 * 
 * Setup instructions:
 * 1. Go to https://console.cloud.google.com/
 * 2. Create a new project or select existing
 * 3. Enable "Google Calendar API"
 * 4. Go to "Credentials" -> "Create Credentials" -> "OAuth 2.0 Client ID"
 * 5. Choose "Web application"
 * 6. Add redirect URI: http://localhost:3000/api/google/callback
 * 7. Copy Client ID and Client Secret to settings
 */

const https = require('https');
const config = require('./config');
const db = require('./db');

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

/**
 * Generate OAuth authorization URL
 */
function getAuthUrl(redirectUri) {
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    access_type: 'offline',
    prompt: 'consent'  // Force consent to always get refresh_token
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(code, redirectUri) {
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    client_secret: config.googleClientSecret,
    code: code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri
  });

  return new Promise((resolve, reject) => {
    const req = https.request(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(json.error_description || json.error));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error('Failed to parse token response'));
        }
      });
    });
    req.on('error', reject);
    req.write(params.toString());
    req.end();
  });
}

/**
 * Refresh access token using refresh token
 */
async function refreshAccessToken() {
  const refreshToken = config.googleRefreshToken;
  if (!refreshToken) {
    throw new Error('No refresh token available - please reconnect Google Calendar');
  }

  const params = new URLSearchParams({
    client_id: config.googleClientId,
    client_secret: config.googleClientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });

  return new Promise((resolve, reject) => {
    const req = https.request(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(json.error_description || json.error));
          } else {
            resolve(json.access_token);
          }
        } catch (e) {
          reject(new Error('Failed to parse token response'));
        }
      });
    });
    req.on('error', reject);
    req.write(params.toString());
    req.end();
  });
}

/**
 * Make authenticated request to Google Calendar API
 */
async function apiRequest(endpoint, accessToken) {
  return new Promise((resolve, reject) => {
    // Construct full URL - endpoint should start with /
    const fullUrl = GOOGLE_CALENDAR_API + endpoint;
    
    https.get(fullUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(json.error.message || JSON.stringify(json.error)));
          } else {
            resolve(json);
          }
        } catch (e) {
          console.error('[Google Calendar] Parse error, raw response:', data.substring(0, 200));
          reject(new Error('Failed to parse API response'));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Fetch calendar events for a time range
 */
async function fetchEvents(timeMin, timeMax) {
  if (!config.googleRefreshToken) {
    return [];  // Not connected
  }

  try {
    const accessToken = await refreshAccessToken();
    const calendarId = config.googleCalendarId || 'primary';
    
    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '50'
    });

    const endpoint = `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`;
    const response = await apiRequest(endpoint, accessToken);
    
    return (response.items || []).map(event => ({
      id: event.id,
      summary: event.summary || 'Untitled Event',
      description: event.description || '',
      location: event.location || '',
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      allDay: !event.start?.dateTime,
      source: 'google'
    }));
  } catch (err) {
    console.error('[Google Calendar] Failed to fetch events:', err.message);
    return [];
  }
}

/**
 * Get events for today
 */
async function getTodayEvents() {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  
  return fetchEvents(startOfDay, endOfDay);
}

/**
 * Get events for the current week
 */
async function getWeekEvents() {
  const now = new Date();
  const endOfWeek = new Date(now);
  endOfWeek.setDate(endOfWeek.getDate() + 7);
  endOfWeek.setHours(23, 59, 59, 999);
  
  return fetchEvents(now, endOfWeek);
}

/**
 * Check if Google Calendar is connected
 */
function isConnected() {
  return !!(config.googleClientId && config.googleClientSecret && config.googleRefreshToken);
}

/**
 * Disconnect Google Calendar (remove refresh token)
 */
function disconnect() {
  db.setConfig({ googleRefreshToken: '' });
}

/**
 * List available calendars
 */
async function listCalendars() {
  if (!config.googleRefreshToken) {
    return [];
  }

  try {
    const accessToken = await refreshAccessToken();
    const response = await apiRequest('/users/me/calendarList', accessToken);
    
    return (response.items || []).map(cal => ({
      id: cal.id,
      summary: cal.summary,
      primary: cal.primary || false
    }));
  } catch (err) {
    console.error('[Google Calendar] Failed to list calendars:', err.message);
    return [];
  }
}

module.exports = {
  getAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  fetchEvents,
  getTodayEvents,
  getWeekEvents,
  isConnected,
  disconnect,
  listCalendars
};

