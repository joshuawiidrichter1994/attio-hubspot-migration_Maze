const ComprehensiveMeetingProcessor = require('./src/comprehensive-meeting-processor');

async function testParticipantIssues() {
  console.log('🔍 INVESTIGATING PARTICIPANT COUNT DISCREPANCIES\n');
  
  const processor = new ComprehensiveMeetingProcessor();
  
  try {
    // Get some Attio meetings to check participant counts vs what gets included
    console.log('📥 Fetching sample meetings from Attio...');
    const attioMeetings = await processor.getFreshAttioMeetings();
    
    console.log(`✅ Found ${attioMeetings.length} meetings in Attio\n`);
    
    // Find meetings with participant count discrepancies
    let checkedCount = 0;
    let issuesFound = 0;
    
    for (const meeting of attioMeetings.slice(0, 50)) { // Check first 50 meetings
      checkedCount++;
      
      // Get the values structure
      const values = meeting.values || {};
      
      // Look for participant fields
      const participants = values.participants || values.attendees || values.people || [];
      const participantCount = participants.length;
      
      // Generate the meeting body to see what participants get included
      let meetingBody = '';
      try {
        const meetingData = processor.prepareMeetingData(meeting);
        meetingBody = meetingData.properties.hs_meeting_body || '';
      } catch (error) {
        console.log(`   ⚠️ Error preparing meeting data: ${error.message}`);
        continue;
      }
      
      // Count emails in the body
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const emailsInBody = meetingBody.match(emailRegex) || [];
      const emailCount = emailsInBody.length;
      
      // Look for discrepancies
      if (participantCount > 0 && (participantCount !== emailCount)) {
        issuesFound++;
        
        const title = values.title?.[0]?.value || meeting.title || 'No title';
        console.log(`🚨 DISCREPANCY FOUND:`);
        console.log(`   Meeting: ${title}`);
        console.log(`   Attio ID: ${meeting.id}`);
        console.log(`   Expected participants: ${participantCount}`);
        console.log(`   Emails in body: ${emailCount}`);
        console.log(`   Emails found: ${emailsInBody.join(', ')}`);
        
        // Show the raw participant data structure
        console.log(`   Raw participants data:`, JSON.stringify(participants.slice(0, 3), null, 2));
        
        // Show relevant part of meeting body
        const participantSection = meetingBody.substring(
          meetingBody.indexOf('Attio participants:'),
          meetingBody.indexOf('Attio participants:') + 500
        );
        console.log(`   Meeting body participant section:\n${participantSection}\n`);
        
        if (issuesFound >= 5) break; // Limit to first 5 issues
      }
    }
    
    console.log(`\n📊 PARTICIPANT AUDIT SUMMARY:`);
    console.log(`   Meetings checked: ${checkedCount}`);
    console.log(`   Issues found: ${issuesFound}`);
    
    if (issuesFound === 0) {
      console.log(`   ✅ No participant count discrepancies found in sample`);
    } else {
      console.log(`   ⚠️ Found ${issuesFound} meetings with participant count issues`);
    }
    
  } catch (error) {
    console.error('💥 Error during participant investigation:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the test
testParticipantIssues();