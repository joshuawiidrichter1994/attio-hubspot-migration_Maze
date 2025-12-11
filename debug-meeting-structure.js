const AttioAPI = require('./src/utils/attio-api.js');

async function debugMeetingStructure() {
  try {
    console.log('🔍 Quick meeting structure check (limited data fetch)...\n');
    
    const attio = new AttioAPI();
    
    // Just get the first small batch to examine structure
    console.log('📊 Fetching just first page of meetings...');
    
    // Create a direct API call to get just one page
    const response = await fetch(`https://api.attio.com/v2/meetings?limit=5`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.ATTIO_API_KEY}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    const meetings = data.data || [];
    
    console.log(`\n✅ Found ${meetings.length} meetings to examine\n`);
    
    for (let i = 0; i < meetings.length; i++) {
      const meeting = meetings[i];
      const title = meeting.values?.title?.[0]?.value || 'No title';
      
      console.log(`📋 Meeting ${i + 1}: ${title}`);
      console.log('  📅 Date fields:');
      console.log(`    - start object exists: ${!!meeting.start}`);
      if (meeting.start) {
        console.log(`    - start.datetime: ${meeting.start.datetime || 'null'}`);
        console.log(`    - start.date: ${meeting.start.date || 'null'}`);
        console.log(`    - start.date_time: ${meeting.start.date_time || 'null'}`);
        console.log('    - Full start object:', JSON.stringify(meeting.start, null, 4));
      }
      console.log(`  🕒 values.start_time: ${JSON.stringify(meeting.values?.start_time) || 'null'}`);
      console.log(`  📅 created_at: ${meeting.created_at || 'null'}`);
      console.log('  📝 All values keys:', Object.keys(meeting.values || {}));
      
      // Check if this would be filtered by our date logic
      const attioDateExtract = attio.extractMeetingDate(meeting);
      console.log(`  ✅ Would pass date filter: ${!!attioDateExtract} (${attioDateExtract})`);
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

debugMeetingStructure();