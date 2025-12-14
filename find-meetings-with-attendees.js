const HubSpotAPI = require('./src/utils/hubspot-api');

/**
 * Find meetings with attendees to understand the current state
 */

async function findMeetingsWithAttendees() {
  try {
    console.log('🔍 Searching for meetings with attendee data...\n');
    
    const hubspot = new HubSpotAPI();
    
    // Get more meetings to find ones with data
    const meetings = await hubspot.client.get('/crm/v3/objects/meetings', {
      params: {
        limit: 100,
        properties: ['hs_meeting_title', 'hs_meeting_body', 'hs_attendee_emails', 'hs_meeting_start_time', 'hs_createdate']
      }
    });
    
    console.log(`📊 Found ${meetings.data.results.length} HubSpot meetings total\n`);
    
    // Find meetings with attendees or descriptions
    const meetingsWithData = meetings.data.results.filter(meeting => 
      (meeting.properties.hs_attendee_emails && meeting.properties.hs_attendee_emails.trim()) ||
      (meeting.properties.hs_meeting_body && meeting.properties.hs_meeting_body.trim()) ||
      (meeting.properties.hs_meeting_title && meeting.properties.hs_meeting_title !== 'Untitled')
    );
    
    console.log(`📝 Found ${meetingsWithData.length} meetings with data\n`);
    
    if (meetingsWithData.length === 0) {
      console.log('No meetings with attendees or descriptions found. Checking creation dates...\n');
      
      // Show recent meetings by creation date
      const recentMeetings = meetings.data.results
        .sort((a, b) => new Date(b.properties.hs_createdate) - new Date(a.properties.hs_createdate))
        .slice(0, 10);
      
      console.log('📅 10 most recently created meetings:');
      for (const meeting of recentMeetings) {
        console.log(`   ${meeting.properties.hs_createdate} - ${meeting.properties.hs_meeting_title || 'Untitled'} (ID: ${meeting.id})`);
      }
      return;
    }
    
    // Show meetings with data
    for (const meeting of meetingsWithData.slice(0, 10)) {
      const title = meeting.properties.hs_meeting_title || 'Untitled';
      const body = meeting.properties.hs_meeting_body || '';
      const attendeeEmails = meeting.properties.hs_attendee_emails || '';
      const createDate = meeting.properties.hs_createdate || '';
      
      console.log(`📝 Meeting: "${title}"`);
      console.log(`   📅 Created: ${createDate}`);
      console.log(`   📧 Attendees: "${attendeeEmails}"`);
      
      if (body) {
        console.log(`   📄 Description (first 300 chars):`);
        console.log(`      "${body.substring(0, 300).replace(/\n/g, '\\n')}..."`);
      }
      
      // Check for external emails
      if (attendeeEmails) {
        const emails = attendeeEmails.split(';').map(e => e.trim());
        const externalEmails = emails.filter(email => 
          !email.includes('@hubspot.com') && 
          (email.includes('theory.ventures') || email.includes('theoryvc.com'))
        );
        
        if (externalEmails.length > 0) {
          console.log(`   🎯 EXTERNAL EMAILS FOUND: ${externalEmails.join(', ')}`);
        }
      }
      
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Error finding meetings:', error.message);
    if (error.response?.data) {
      console.error('Response data:', error.response.data);
    }
  }
}

findMeetingsWithAttendees();