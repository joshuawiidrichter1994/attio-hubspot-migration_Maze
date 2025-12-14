const HubSpotAPI = require('./src/utils/hubspot-api');

/**
 * Debug: Check what meeting descriptions actually look like
 */

async function debugMeetingDescriptions() {
  try {
    console.log('🔍 Debugging meeting descriptions to find the right pattern...\n');
    
    const hubspot = new HubSpotAPI();
    
    // Get recent meetings
    const meetings = await hubspot.client.get('/crm/v3/objects/meetings', {
      params: {
        limit: 50,
        properties: ['hs_meeting_title', 'hs_meeting_body', 'hs_attendee_emails', 'hs_meeting_start_time'],
        sorts: [{ propertyName: 'hs_createdate', direction: 'DESCENDING' }]
      }
    });
    
    console.log(`📊 Found ${meetings.data.results.length} recent HubSpot meetings\n`);
    
    // Check meetings with non-empty descriptions
    let foundAttioBodies = 0;
    
    for (const meeting of meetings.data.results.slice(0, 20)) {
      const title = (meeting.properties.hs_meeting_title || 'Untitled').substring(0, 50);
      const body = meeting.properties.hs_meeting_body || '';
      const attendeeEmails = meeting.properties.hs_attendee_emails || '';
      
      if (body && body.length > 50) {
        console.log(`📝 Meeting: "${title}..."`);
        console.log(`   📧 Attendees: ${attendeeEmails}`);
        console.log(`   📄 Body preview: "${body.substring(0, 200)}..."`);
        
        // Check for Attio-related content
        if (body.includes('Attio') || body.includes('participants:')) {
          foundAttioBodies++;
          console.log(`   🎯 POTENTIAL ATTIO MEETING FOUND!`);
        }
        console.log('');
      }
    }
    
    console.log(`\n📊 Found ${foundAttioBodies} meetings with potential Attio content`);
    
    // Also try searching for meetings with "Attio participants" specifically
    console.log(`\n🔍 Searching for meetings with 'Attio participants' text...`);
    
    const meetingsWithAttioParticipants = meetings.data.results.filter(meeting => {
      const body = meeting.properties.hs_meeting_body || '';
      return body.includes('Attio participants');
    });
    
    console.log(`Found ${meetingsWithAttioParticipants.length} meetings with 'Attio participants' text`);
    
    if (meetingsWithAttioParticipants.length > 0) {
      console.log(`\n📋 Sample meeting with Attio participants:`);
      const sample = meetingsWithAttioParticipants[0];
      console.log(`Title: ${sample.properties.hs_meeting_title || 'Untitled'}`);
      console.log(`Attendees: ${sample.properties.hs_attendee_emails || 'None'}`);
      console.log(`Body: ${sample.properties.hs_meeting_body}`);
    }
    
  } catch (error) {
    console.error('❌ Error debugging descriptions:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

debugMeetingDescriptions();