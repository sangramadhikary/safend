/**
 * Simple Express server for DigiPIN API
 * Run with: node server/index.js
 */

const express = require('express');
const cors = require('cors');
const https = require('https');
const quotationPdfRouter = require('./routes/quotation-pdf');
const app = express();
const PORT = 3001;

// Enable CORS for frontend
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increase limit for quotation data

// Helper function to make HTTPS requests
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ ok: res.statusCode === 200, status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ ok: false, status: res.statusCode, data: null });
        }
      });
    }).on('error', (err) => reject(err));
  });
}

// DigiPIN decode endpoint
app.get('/api/digipin/decode', async (req, res) => {
  const { digipin } = req.query;
  
  console.log(`📍 DigiPIN decode request: ${digipin}`);
  
  // Validate DigiPIN format
  if (!digipin) {
    return res.status(400).json({ error: 'DigiPIN parameter is required' });
  }
  
  const cleanDigipin = digipin.replace(/-/g, '').toUpperCase();
  if (!/^[A-Z0-9]{9,12}$/.test(cleanDigipin)) {
    return res.status(400).json({ error: 'Invalid DigiPIN format. Expected: XXX-XXX-XXXX' });
  }
  
  try {
    // Try to call India Post API
    const indiaPostUrl = `https://api.indiapost.gov.in/digipin/v1/decode?digipin=${cleanDigipin}`;
    console.log(`🔍 Calling India Post API: ${indiaPostUrl}`);
    
    const response = await httpsGet(indiaPostUrl);
    
    if (response.ok && response.data) {
      console.log(`✅ India Post API success:`, response.data);
      return res.json({
        latitude: parseFloat(response.data.latitude),
        longitude: parseFloat(response.data.longitude),
        accuracy: response.data.accuracy || 10,
        source: 'india_post'
      });
    }
    
    console.log(`⚠️ India Post API failed: ${response.status}`);
  } catch (error) {
    console.log(`⚠️ India Post API error:`, error.message);
  }
  
  // Fallback: Generate deterministic coordinates from DigiPIN
  console.log(`🔄 Using fallback algorithm for: ${digipin}`);
  
  const hash = cleanDigipin.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  
  // India bounds: Lat 8°N-37°N, Lng 68°E-97°E
  const latBase = 8 + (hash % 29);
  const lngBase = 68 + (hash % 29);
  
  const latDecimal = (cleanDigipin.charCodeAt(0) % 100) / 100;
  const lngDecimal = (cleanDigipin.charCodeAt(cleanDigipin.length - 1) % 100) / 100;
  
  const latitude = parseFloat((latBase + latDecimal).toFixed(6));
  const longitude = parseFloat((lngBase + lngDecimal).toFixed(6));
  
  console.log(`✅ Generated coordinates: Lat ${latitude}, Lng ${longitude}`);
  
  res.json({
    latitude,
    longitude,
    accuracy: 10,
    source: 'fallback'
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'DigiPIN API server is running' });
});

// Quotation PDF routes
app.use('/api/quotation', quotationPdfRouter);

app.listen(PORT, () => {
  console.log(`🚀 DigiPIN API server running on http://localhost:${PORT}`);
  console.log(`📍 Endpoint: http://localhost:${PORT}/api/digipin/decode?digipin=4P3-JK8-52C9`);
  console.log(`📄 PDF Endpoint: http://localhost:${PORT}/api/quotation/download`);
  console.log(`💚 Health check: http://localhost:${PORT}/health`);
});
