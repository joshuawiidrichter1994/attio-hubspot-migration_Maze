const HubSpotAPI = require('./src/utils/hubspot-api');

/**
 * Check what's actually in HubSpot meeting descriptions to understand the migration
 */

async function checkMeetingDescriptions() {
  try {
    console.log('🔍 Checking actual HubSpot meeting descriptions...\n');
    
    const hubspot = new HubSpotAPI();
    
    // Get meetings with descriptions
    const meetings = await hubspot.client.get('/crm/v3/objects/meetings', {
      params: {
        limit: 20,
        properties: ['hs_meeting_title', 'hs_meeting_body', 'hs_attendee_emails', 'hs_meeting_start_time']
      }
    });
    
    console.log(`📊 Found ${meetings.data.results.length} HubSpot meetings\n`);
    
    // Check each meeting's description for patterns
    for (const meeting of meetings.data.results) {
      const title = meeting.properties.hs_meeting_title || 'Untitled';
      const body = meeting.properties.hs_meeting_body || '';
      const attendeeEmails = meeting.properties.hs_attendee_emails || '';
      
      console.log(`📝 Meeting: "${title.substring(0, 60)}..."`);
      console.log(`   📧 Attendees: "${attendeeEmails}"`);
      
      if (body) {
        console.log(`   📄 Description (first 200 chars):`);
        console.log(`      "${body.substring(0, 200).replace(/\n/g, '\\n')}..."`);
      } else {
        console.log(`   📄 Description: (empty)`);
      }
      
      // Check for specific patterns
      const patterns = [
        'Attio',
        'imported from',
        'Original ID:',
        'participants:',
        'theory.ventures',
        'theoryvc.com'
      ];
      
      const foundPatterns = patterns.filter(pattern => 
        body.toLowerCase().includes(pattern.toLowerCase())
      );
      
      if (foundPatterns.length > 0) {
        console.log(`   🎯 FOUND PATTERNS: ${foundPatterns.join(', ')}`);
      }
      
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Error checking meeting descriptions:', error.message);
    if (error.response?.data) {
      console.error('Response data:', error.response.data);
    }
  }
}

checkMeetingDescriptions();