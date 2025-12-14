const HubSpotAPI = require('./src/utils/hubspot-api');

/**
 * Test what attendee data is actually stored in HubSpot after the migration
 * This will help us understand why external participants are missing
 */

async function testHubSpotAttendees() {
  try {
    console.log('🔍 Testing HubSpot attendee data after migration...\n');
    
    const hubspot = new HubSpotAPI();
    
    // Get meetings that should have been migrated from Attio
    const meetings = await hubspot.client.get('/crm/v3/objects/meetings', {
      params: {
        limit: 50,
        properties: ['hs_meeting_title', 'hs_meeting_body', 'hs_attendee_emails', 'hs_meeting_start_time'],
        associations: ['contact', 'company']
      }
    });
    
    console.log(`📊 Found ${meetings.data.results.length} HubSpot meetings\n`);
    
    // Filter to Attio-imported meetings and check attendees
    const attioMeetings = meetings.data.results.filter(meeting => 
      meeting.properties.hs_meeting_body && 
      meeting.properties.hs_meeting_body.includes('Meeting imported from Attio')
    );
    
    console.log(`🔗 Found ${attioMeetings.length} Attio-imported meetings\n`);
    
    // Check attendee emails in detail
    for (const meeting of attioMeetings.slice(0, 10)) {  // Check first 10
      const title = meeting.properties.hs_meeting_title || 'Untitled';
      const attendeeEmails = meeting.properties.hs_attendee_emails || '';
      const body = meeting.properties.hs_meeting_body || '';
      
      // Extract participant list from description
      const participantMatch = body.match(/Attio participants:\n([\s\S]*?)(?:\n\n|$)/);
      const participantList = participantMatch ? participantMatch[1].trim() : '';
      
      console.log(`📝 Meeting: "${title.substring(0, 50)}..."`);
      console.log(`   📧 HubSpot hs_attendee_emails: "${attendeeEmails}"`);
      console.log(`   👥 Participants in description:`);
      if (participantList) {
        console.log(`${participantList}`);
      } else {
        console.log('      (none found)');
      }
      
      // Check for external emails in participant list
      const externalEmails = [];
      if (participantList) {
        const emailMatches = participantList.match(/[\w.-]+@[\w.-]+\.\w+/g);
        if (emailMatches) {
          externalEmails.push(...emailMatches.filter(email => 
            !email.endsWith('@hubspot.com') && 
            !attendeeEmails.includes(email)
          ));
        }
      }
      
      if (externalEmails.length > 0) {
        console.log(`   🚨 EXTERNAL EMAILS FOUND IN DESCRIPTION BUT NOT IN hs_attendee_emails:`);
        externalEmails.forEach(email => console.log(`      - ${email}`));
      }
      
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Error testing HubSpot attendees:', error.message);
  }
}

testHubSpotAttendees();