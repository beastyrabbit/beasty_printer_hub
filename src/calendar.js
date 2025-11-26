/**
 * Calendar Integration Module
 * 
 * Fetches events from various calendar sources:
 * - Google Calendar (public iCal feed)
 * - Microsoft 365 (via Graph API - requires setup)
 */

const https = require('https');
const http = require('http');
const ICAL = require('ical.js');

/**
 * Fetch and parse an iCal feed from a URL
 * Works with Google Calendar public URLs
 */
async function fetchICalEvents(icalUrl, daysAhead = 7) {
  return new Promise((resolve, reject) => {
    const url = new URL(icalUrl);
    const client = url.protocol === 'https:' ? https : http;
    
    client.get(icalUrl, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const events = parseICalData(data, daysAhead);
          resolve(events);
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Parse iCal data and extract events within the specified time range
 */
function parseICalData(icalData, daysAhead = 7) {
  const jcalData = ICAL.parse(icalData);
  const comp = new ICAL.Component(jcalData);
  const vevents = comp.getAllSubcomponents('vevent');
  
  const now = new Date();
  const endDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  
  const events = [];
  
  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);
    const startDate = event.startDate?.toJSDate();
    const endDateEvent = event.endDate?.toJSDate();
    
    if (!startDate) continue;
    
    // Check if event is within our time range
    // Handle recurring events
    if (event.isRecurring()) {
      const iterator = event.iterator();
      let next;
      let count = 0;
      while ((next = iterator.next()) && count < 100) {
        count++;
        const occurrenceStart = next.toJSDate();
        if (occurrenceStart > endDate) break;
        if (occurrenceStart >= now && occurrenceStart <= endDate) {
          events.push({
            summary: event.summary || 'Untitled Event',
            description: event.description || '',
            location: event.location || '',
            start: occurrenceStart,
            end: endDateEvent,
            allDay: event.startDate?.isDate || false,
            source: 'google'
          });
        }
      }
    } else {
      // Single event
      if (startDate >= now && startDate <= endDate) {
        events.push({
          summary: event.summary || 'Untitled Event',
          description: event.description || '',
          location: event.location || '',
          start: startDate,
          end: endDateEvent,
          allDay: event.startDate?.isDate || false,
          source: 'google'
        });
      }
    }
  }
  
  // Sort by start date
  events.sort((a, b) => a.start - b.start);
  
  return events;
}

/**
 * Convert Google Calendar embed URL to iCal URL
 * Input: https://calendar.google.com/calendar/embed?src=xxx%40group.calendar.google.com&ctz=Europe%2FBerlin
 * Output: https://calendar.google.com/calendar/ical/xxx%40group.calendar.google.com/public/basic.ics
 */
function embedUrlToIcalUrl(embedUrl) {
  try {
    const url = new URL(embedUrl);
    const calendarId = url.searchParams.get('src');
    if (!calendarId) return null;
    return `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`;
  } catch (e) {
    return null;
  }
}

/**
 * Get events for today
 */
async function getTodayEvents(config) {
  const events = [];
  
  // Fetch from Google Calendar if configured
  if (config.googleCalendarUrl) {
    try {
      let icalUrl = config.googleCalendarUrl;
      // Convert embed URL to iCal URL if needed
      if (icalUrl.includes('/embed?')) {
        icalUrl = embedUrlToIcalUrl(icalUrl);
      }
      if (icalUrl) {
        const googleEvents = await fetchICalEvents(icalUrl, 1);
        events.push(...googleEvents);
      }
    } catch (err) {
      console.error('Failed to fetch Google Calendar:', err.message);
    }
  }
  
  // TODO: Fetch from Microsoft calendar when configured
  // if (config.microsoftCalendarEnabled) {
  //   const msEvents = await fetchMicrosoftEvents(config, 1);
  //   events.push(...msEvents);
  // }
  
  // Filter to only today's events
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return events.filter(e => e.start >= today && e.start < tomorrow);
}

/**
 * Get events for the week
 */
async function getWeekEvents(config) {
  const events = [];
  
  // Fetch from Google Calendar if configured
  if (config.googleCalendarUrl) {
    try {
      let icalUrl = config.googleCalendarUrl;
      if (icalUrl.includes('/embed?')) {
        icalUrl = embedUrlToIcalUrl(icalUrl);
      }
      if (icalUrl) {
        const googleEvents = await fetchICalEvents(icalUrl, 7);
        events.push(...googleEvents);
      }
    } catch (err) {
      console.error('Failed to fetch Google Calendar:', err.message);
    }
  }
  
  return events;
}

/**
 * Format events for display/printing
 */
function formatEventsForPrint(events) {
  if (!events.length) return 'Keine Termine';
  
  const lines = [];
  let currentDate = null;
  
  for (const event of events) {
    const eventDate = event.start.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
    
    if (eventDate !== currentDate) {
      if (currentDate) lines.push('');
      lines.push(`--- ${eventDate} ---`);
      currentDate = eventDate;
    }
    
    if (event.allDay) {
      lines.push(`  [Ganztags] ${event.summary}`);
    } else {
      const time = event.start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      lines.push(`  ${time} ${event.summary}`);
    }
    
    if (event.location) {
      lines.push(`         @ ${event.location}`);
    }
  }
  
  return lines.join('\n');
}

// ============================================
// Microsoft Graph API Integration (Placeholder)
// ============================================
// 
// To use Microsoft 365 calendar, you need to:
// 1. Register an app in Azure AD (https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps)
// 2. Add Calendar.Read permission
// 3. Get client ID, client secret, and tenant ID
// 4. Use OAuth2 to authenticate
//
// Example Graph API endpoint:
// GET https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=2024-01-01&endDateTime=2024-01-07
//
// For Microsoft Copilot summaries:
// - There's no public API to get Copilot-generated summaries directly
// - Alternative: Use Graph API to fetch emails/calendar, then summarize with your own AI
// - Or: Build a Copilot plugin that sends summaries to your app (complex)

module.exports = {
  fetchICalEvents,
  parseICalData,
  embedUrlToIcalUrl,
  getTodayEvents,
  getWeekEvents,
  formatEventsForPrint
};

