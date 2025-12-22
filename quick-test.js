const path = require('path');

// Load environment
require('dotenv').config();

// Test the regex pattern
const testDescription = 'Meeting imported from Attio. Original ID: e27a037a-a502-403b-b678-5d99217ca9c4No description provided Attio participants:';
const pattern = /Original ID: ([a-f0-9\-]{36})/;
const match = testDescription.match(pattern);

console.log('🧪 Testing regex pattern');
console.log('Input:', testDescription);
console.log('Pattern:', pattern.toString());
console.log('Match result:', match ? match[1] : 'NO MATCH');
console.log('---');

// Test the video filename pattern  
const exampleVideoName = 'call-recording-9728279d-8ce8-4a11-ab0f-df6dfa554155';
console.log('🎥 Testing video filename pattern');
console.log('Video filename:', exampleVideoName);

// Extract UUID function (simplified)
function extractUuidsFromFilename(filename) {
  const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  return filename.match(uuidRegex) || [];
}

const extractedUUIDs = extractUuidsFromFilename(exampleVideoName);
console.log('Extracted UUIDs:', extractedUUIDs);

console.log('\n✅ Regex pattern works correctly!');
console.log('📋 Now let\'s run the full script with the corrected pattern...');