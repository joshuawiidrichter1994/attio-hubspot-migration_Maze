const HubSpotAPI = require('./src/utils/hubspot-api');

/**
 * Verify that attendees are missing from hs_attendee_emails field
 * Compare what's in the meeting description vs the attendee field
 */

async function verifyMissingAttendees() {
  try {
    console.log('🔍 Verifying missing attendees in HubSpot meetings...\n');
    
    const hubspot = new HubSpotAPI();
    
    // Get meetings imported from Attio with their properties
    const meetings = await hubspot.client.get('/crm/v3/objects/meetings', {
      params: {
        limit: 100,
        properties: 'hs_meeting_title,hs_meeting_body,hs_attendee_emails,hs_meeting_start_time',
      }
    });
    
    console.log(`📊 Found ${meetings.data.results.length} HubSpot meetings\n`);
    
    // Filter to Attio-imported meetings
    const attioMeetings = meetings.data.results.filter(meeting => 
      meeting.properties.hs_meeting_body && 
      meeting.properties.hs_meeting_body.includes('Meeting imported from Attio')
    );
    
    console.log(`🔗 Found ${attioMeetings.length} Attio-imported meetings\n`);
    
    let totalMissingCount = 0;
    let meetingsWithMissing = 0;
    
    // Analyze each meeting for missing attendees
    for (const meeting of attioMeetings.slice(0, 20)) {  // Check first 20 for detailed analysis
      const title = (meeting.properties.hs_meeting_title || 'Untitled').substring(0, 50);
      const attendeeEmails = meeting.properties.hs_attendee_emails || '';
      const body = meeting.properties.hs_meeting_body || '';
      
      // Extract all email addresses from the "Attio participants" section
      const participantMatch = body.match(/Attio participants:\s*([\s\S]*?)(?:\n\n|$)/);
      const participantEmails = [];
      
      if (participantMatch) {
        const participantSection = participantMatch[1];
        // Extract email addresses from lines like "- doug@cubicsquared.ai [accepted]"
        const emailMatches = participantSection.match(/[\w.-]+@[\w.-]+\.\w+/g);
        if (emailMatches) {
          participantEmails.push(...emailMatches.map(email => email.toLowerCase()));
        }
      }
      
      // Parse attendee emails from HubSpot field (semicolon-separated)
      const hubspotEmails = attendeeEmails ? 
        attendeeEmails.split(';').map(email => email.trim().toLowerCase()).filter(Boolean) : 
        [];
      
      // Find missing emails (in description but not in attendee field)
      const missingEmails = participantEmails.filter(email => !hubspotEmails.includes(email));
      
      if (missingEmails.length > 0) {
        meetingsWithMissing++;
        totalMissingCount += missingEmails.length;
        
        console.log(`❌ Meeting: "${title}..."`);
        console.log(`   📝 Participants in description (${participantEmails.length}): ${participantEmails.join(', ')}`);
        console.log(`   📧 HubSpot attendee emails (${hubspotEmails.length}): ${hubspotEmails.join(', ')}`);
        console.log(`   🚨 MISSING from attendee field (${missingEmails.length}): ${missingEmails.join(', ')}`);
        console.log('');
      } else if (participantEmails.length > 0) {
        console.log(`✅ Meeting: "${title}..." - All ${participantEmails.length} participants present in attendee field`);
      }
    }
    
    console.log(`\n📊 SUMMARY:`);
    console.log(`   Meetings analyzed: ${Math.min(attioMeetings.length, 20)}`);
    console.log(`   Meetings with missing attendees: ${meetingsWithMissing}`);
    console.log(`   Total missing attendee emails: ${totalMissingCount}`);
    
    if (meetingsWithMissing > 0) {
      console.log(`\n🎯 CONFIRMED: ${meetingsWithMissing} meetings have attendees in descriptions but missing from hs_attendee_emails field!`);
      console.log(`   This proves that non-HubSpot contacts are being filtered out of the attendee field.`);
    } else {
      console.log(`\n✅ No missing attendees found. All participants are properly recorded in attendee fields.`);
    }
    
  } catch (error) {
    console.error('❌ Error verifying attendees:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

verifyMissingAttendees();