/**
 * AI Summary Module
 * 
 * Uses local Ollama instance to generate summaries for:
 * - Daily calendar events
 * - Weekly calendar overview
 * - Task summaries
 */

const http = require('http');
const https = require('https');

// Default system prompts for different summary types
const PROMPTS = {
  dailySummary: `Du bist ein hilfreicher Assistent der Tages-Zusammenfassungen schreibt.
Schreibe eine kurze, freundliche Zusammenfassung des Tages basierend auf den Terminen und Aufgaben.
Halte es kurz (max 3-4 Sätze) und erwähne die wichtigsten Termine.
Schreibe auf Deutsch. Sei motivierend aber nicht übertrieben.
Formatiere für einen Thermodrucker (max 32 Zeichen pro Zeile, keine Emojis).`,

  weeklySummary: `Du bist ein hilfreicher Assistent der Wochen-Zusammenfassungen schreibt.
Schreibe eine kurze Übersicht der Woche basierend auf den Terminen und Aufgaben.
Erwähne wichtige Tage und größere Ereignisse.
Halte es kurz (max 5-6 Sätze).
Schreibe auf Deutsch.
Formatiere für einen Thermodrucker (max 32 Zeichen pro Zeile, keine Emojis).`,

  morningGreeting: `Du bist ein freundlicher Morgen-Assistent.
Schreibe eine kurze, motivierende Begrüßung für den Tag.
Erwähne kurz was heute ansteht basierend auf den gegebenen Informationen.
Maximal 2-3 Sätze. Auf Deutsch.
Formatiere für einen Thermodrucker (max 32 Zeichen pro Zeile, keine Emojis).`
};

/**
 * Call Ollama API to generate text
 * @param {Object} config - Configuration with ollamaUrl and ollamaModel
 * @param {string} systemPrompt - System prompt for the AI
 * @param {string} userMessage - User message/content to summarize
 * @returns {Promise<string>} Generated text
 */
async function callOllama(config, systemPrompt, userMessage) {
  const ollamaUrl = config.ollamaUrl || 'http://localhost:11434';
  const model = config.ollamaModel || 'llama3.2';
  
  const url = new URL('/api/generate', ollamaUrl);
  const client = url.protocol === 'https:' ? https : http;
  
  const requestBody = JSON.stringify({
    model: model,
    prompt: userMessage,
    system: systemPrompt,
    stream: false,
    options: {
      temperature: 0.7,
      num_predict: 256
    }
  });
  
  return new Promise((resolve, reject) => {
    const req = client.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
      },
      timeout: 60000 // 60 second timeout
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.response || '');
        } catch (err) {
          reject(new Error(`Failed to parse Ollama response: ${err.message}`));
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Ollama request timed out'));
    });
    
    req.write(requestBody);
    req.end();
  });
}

/**
 * Check if Ollama is available
 */
async function checkOllamaStatus(config) {
  const ollamaUrl = config.ollamaUrl || 'http://localhost:11434';
  
  return new Promise((resolve) => {
    const url = new URL('/api/tags', ollamaUrl);
    const client = url.protocol === 'https:' ? https : http;
    
    const req = client.get({
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      timeout: 5000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({
            available: true,
            models: json.models?.map(m => m.name) || []
          });
        } catch {
          resolve({ available: false, models: [] });
        }
      });
    });
    
    req.on('error', () => resolve({ available: false, models: [] }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ available: false, models: [] });
    });
  });
}

/**
 * Generate a daily summary
 * @param {Object} config - App configuration
 * @param {Array} events - Calendar events for today
 * @param {Array} tasks - Tasks for today
 * @returns {Promise<string>} Daily summary text
 */
async function generateDailySummary(config, events = [], tasks = []) {
  if (!config.ollamaEnabled) {
    return null;
  }
  
  // Build context for AI
  let context = 'Heute ist ' + new Date().toLocaleDateString('de-DE', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long' 
  }) + '.\n\n';
  
  if (events.length > 0) {
    context += 'TERMINE HEUTE:\n';
    for (const event of events) {
      if (event.allDay) {
        context += `- [Ganztags] ${event.summary}\n`;
      } else {
        const time = event.start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        context += `- ${time}: ${event.summary}\n`;
      }
    }
    context += '\n';
  } else {
    context += 'Keine Termine heute.\n\n';
  }
  
  if (tasks.length > 0) {
    context += 'AUFGABEN:\n';
    for (const task of tasks) {
      context += `- ${task.title}\n`;
    }
  } else {
    context += 'Keine speziellen Aufgaben.\n';
  }
  
  try {
    const summary = await callOllama(config, PROMPTS.dailySummary, context);
    return wrapTextForPrinter(summary, 32);
  } catch (err) {
    console.error('AI summary failed:', err.message);
    return null;
  }
}

/**
 * Generate a weekly summary
 */
async function generateWeeklySummary(config, events = [], tasks = []) {
  if (!config.ollamaEnabled) {
    return null;
  }
  
  const today = new Date();
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  
  let context = `Diese Woche: ${today.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })} bis ${weekEnd.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })}.\n\n`;
  
  if (events.length > 0) {
    context += 'TERMINE DIESE WOCHE:\n';
    let currentDay = null;
    for (const event of events) {
      const day = event.start.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric' });
      if (day !== currentDay) {
        context += `\n${day}:\n`;
        currentDay = day;
      }
      if (event.allDay) {
        context += `  - [Ganztags] ${event.summary}\n`;
      } else {
        const time = event.start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        context += `  - ${time}: ${event.summary}\n`;
      }
    }
    context += '\n';
  } else {
    context += 'Keine Termine diese Woche.\n\n';
  }
  
  if (tasks.length > 0) {
    context += 'AUFGABEN DIESE WOCHE:\n';
    for (const task of tasks) {
      context += `- ${task.title}\n`;
    }
  }
  
  try {
    const summary = await callOllama(config, PROMPTS.weeklySummary, context);
    return wrapTextForPrinter(summary, 32);
  } catch (err) {
    console.error('AI weekly summary failed:', err.message);
    return null;
  }
}

/**
 * Generate a morning greeting
 */
async function generateMorningGreeting(config, events = [], tasks = []) {
  if (!config.ollamaEnabled) {
    return null;
  }
  
  let context = 'Es ist ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr.\n';
  
  if (events.length > 0) {
    context += `Heute stehen ${events.length} Termine an.\n`;
  }
  if (tasks.length > 0) {
    context += `Es gibt ${tasks.length} Aufgaben.\n`;
  }
  
  try {
    const greeting = await callOllama(config, PROMPTS.morningGreeting, context);
    return wrapTextForPrinter(greeting, 32);
  } catch (err) {
    console.error('AI greeting failed:', err.message);
    return null;
  }
}

/**
 * Word-wrap text for thermal printer
 */
function wrapTextForPrinter(text, maxWidth = 32) {
  if (!text) return '';
  
  const lines = [];
  const paragraphs = text.split('\n');
  
  for (const paragraph of paragraphs) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }
    
    const words = paragraph.split(' ');
    let currentLine = '';
    
    for (const word of words) {
      if (currentLine.length + word.length + 1 <= maxWidth) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
  }
  
  return lines.join('\n');
}

module.exports = {
  callOllama,
  checkOllamaStatus,
  generateDailySummary,
  generateWeeklySummary,
  generateMorningGreeting,
  wrapTextForPrinter,
  PROMPTS
};

