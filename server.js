const express = require('express');
const fs = require('fs');
const path = require('path');
const geoip = require('geoip-lite');

const app = express();
const PORT = process.env.PORT || 3000;
const LOGS_FILE = path.join(__dirname, 'logs.json');
const ADMIN_PASSWORD = 'SecretAdminPassword123';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Safe file reader
function getStoredLogs() {
  if (!fs.existsSync(LOGS_FILE)) return [];
  try {
    const data = fs.readFileSync(LOGS_FILE, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('Error reading logs file:', err);
    return [];
  }
}

// Clean IP extractor for local, forwarded, or proxy setups
function parseClientIp(req) {
  let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  if (ip.includes(',')) ip = ip.split(',')[0].trim();
  if (ip.startsWith('::ffff:')) ip = ip.substring(7);
  return ip || 'Unknown';
}

// 1. Ingestion Endpoint
app.post('/api/telemetry', (req, res) => {
  const clientIp = parseClientIp(req);
  const geo = geoip.lookup(clientIp);

  const logEntry = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    networkIdentity: {
      ip: clientIp,
      geo: geo ? {
        city: geo.city || 'Unknown',
        region: geo.region || 'Unknown',
        country: geo.country || 'Unknown',
        timezone: geo.timezone || 'Unknown'
      } : {
        city: 'Local/LAN',
        region: 'N/A',
        country: 'Local Network',
        timezone: 'N/A'
      }
    },
    userAgent: req.headers['user-agent'] || 'Unknown',
    ...req.body
  };

  const logs = getStoredLogs();
  logs.push(logEntry);

  fs.writeFile(LOGS_FILE, JSON.stringify(logs, null, 2), (err) => {
    if (err) {
      console.error('Disk write error:', err);
      return res.status(500).json({ error: 'Storage error' });
    }
    res.status(200).json({ status: 'ok' });
  });
});

// 2. Admin Logs Fetch Endpoint
app.get('/api/admin/logs', (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || authHeader !== `Bearer ${ADMIN_PASSWORD}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json(getStoredLogs());
});

app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});