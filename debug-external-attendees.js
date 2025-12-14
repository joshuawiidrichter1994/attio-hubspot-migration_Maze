const ComprehensiveMeetingProcessor = require('./src/comprehensive-meeting-processor');

/**
 * Debug external attendees for ONE specific meeting - trace through entire pipeline
 * This will show exactly where external attendees are lost in the process
 */

async function debugExternalAttendees() {
  try {
    console.log('🕵️ Debugging external attendees for one meeting...\n');
    
    const processor = new ComprehensiveMeetingProcessor();
    
    // Get a few Attio meetings to find one with external attendees
    const attioMeetings = await processor.getFreshAttioMeetings();
    
    // Find a meeting with external attendees (non-mazehq.com emails)
    let targetMeeting = null;
    for (const meeting of attioMeetings.slice(0, 50)) {
      const participants = meeting.participants || [];
      const hasExternalAttendees = participants.some(p => {
        const email = p.email_address || p.email || '';
        return email && !email.includes('@mazehq.com') && !email.includes('@group.calendar.google.com');
      });
      
      if (hasExternalAttendees) {
        targetMeeting = meeting;
        break;
      }
    }
    
    if (!targetMeeting) {
      console.log('❌ No meetings found with external attendees in first 50 meetings');
      return;
    }
    
    console.log(`🎯 Found meeting with external attendees: "${targetMeeting.values?.title?.[0]?.value || 'Untitled'}"`);
    console.log(`   Meeting ID: ${targetMeeting.id.meeting_id}\n`);
    
    // STEP 1: Print raw Attio attendees
    console.log('📊 STEP 1: RAW ATTIO ATTENDEES');
    const participants = targetMeeting.participants || [];
    console.log(`   Total participants: ${participants.length}`);
    
    const hubspotEmails = [];
    const externalEmails = [];
    
    participants.forEach((p, index) => {
      const email = p.email_address || p.email || '';
      const status = p.status || 'unknown';
      const isOrganizer = p.is_organizer || false;
      
      console.log(`   ${index + 1}. ${email} [${status}]${isOrganizer ? ' (host)' : ''}`);
      
      if (email.includes('@mazehq.com')) {
        hubspotEmails.push(email);
      } else if (email && !email.includes('@group.calendar.google.com')) {
        externalEmails.push(email);
      }
    });
    
    console.log(`\n   📧 HubSpot emails (${hubspotEmails.length}): ${hubspotEmails.join(', ')}`);
    console.log(`   🌐 External emails (${externalEmails.length}): ${externalEmails.join(', ')}\n`);
    
    // STEP 2: Test prepareMeetingData to see what body it creates
    console.log('📊 STEP 2: TESTING prepareMeetingData()');
    const meetingData = processor.prepareMeetingData(targetMeeting);
    const preparedBody = meetingData.properties.hs_meeting_body;
    
    console.log('   Generated hs_meeting_body:');
    console.log('   ' + '='.repeat(50));
    console.log(preparedBody);
    console.log('   ' + '='.repeat(50));
    
    // Check if external attendees appear in the prepared body
    const externalInBody = externalEmails.filter(email => preparedBody.includes(email));
    const missingFromBody = externalEmails.filter(email => !preparedBody.includes(email));
    
    console.log(`\n   ✅ External emails found in body (${externalInBody.length}): ${externalInBody.join(', ')}`);
    if (missingFromBody.length > 0) {
      console.log(`   ❌ External emails MISSING from body (${missingFromBody.length}): ${missingFromBody.join(', ')}`);
    }
    
    // STEP 3: Check if this meeting exists in HubSpot already
    console.log('\n📊 STEP 3: CHECKING HUBSPOT STATUS');
    const hubspotMeetings = await processor.getFreshHubSpotMeetings();
    const existingMeeting = hubspotMeetings.find(hm => 
      hm.properties?.hs_meeting_body?.includes(targetMeeting.id.meeting_id)
    );
    
    if (existingMeeting) {
      console.log(`   📝 Meeting exists in HubSpot: ${existingMeeting.id}`);
      console.log('   Current hs_meeting_body:');
      console.log('   ' + '='.repeat(50));
      console.log(existingMeeting.properties.hs_meeting_body || '(empty)');
      console.log('   ' + '='.repeat(50));
      
      // Check what external attendees are in the saved body
      const savedBody = existingMeeting.properties.hs_meeting_body || '';
      const externalInSaved = externalEmails.filter(email => savedBody.includes(email));
      const missingFromSaved = externalEmails.filter(email => !savedBody.includes(email));
      
      console.log(`\n   ✅ External emails in saved body (${externalInSaved.length}): ${externalInSaved.join(', ')}`);
      if (missingFromSaved.length > 0) {
        console.log(`   ❌ External emails MISSING from saved body (${missingFromSaved.length}): ${missingFromSaved.join(', ')}`);
      }
      
      // Compare prepared vs saved
      if (externalInBody.length > 0 && missingFromSaved.length > 0) {
        console.log('\n🚨 PROBLEM IDENTIFIED: External attendees are in prepareMeetingData() but missing from saved HubSpot body!');
        console.log('   This means something is OVERWRITING the meeting body after creation.');
      } else if (missingFromBody.length > 0) {
        console.log('\n🚨 PROBLEM IDENTIFIED: External attendees are missing from prepareMeetingData() itself!');
        console.log('   This means the EXTRACTION logic is wrong.');
      } else {
        console.log('\n✅ External attendees are correctly preserved in HubSpot body!');
      }
    } else {
      console.log('   📝 Meeting does not exist in HubSpot yet');
      
      if (missingFromBody.length > 0) {
        console.log('\n🚨 PROBLEM IDENTIFIED: External attendees are missing from prepareMeetingData()!');
        console.log('   This means the EXTRACTION logic is wrong and needs to be fixed.');
      } else {
        console.log('\n✅ prepareMeetingData() correctly includes all external attendees!');
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('📋 SUMMARY');
    console.log(`   Attio meeting: ${targetMeeting.values?.title?.[0]?.value || 'Untitled'}`);
    console.log(`   Total participants: ${participants.length}`);
    console.log(`   HubSpot contacts: ${hubspotEmails.length}`);
    console.log(`   External attendees: ${externalEmails.length}`);
    console.log(`   External in prepared body: ${externalInBody.length}`);
    if (existingMeeting) {
      const savedBody = existingMeeting.properties.hs_meeting_body || '';
      const externalInSaved = externalEmails.filter(email => savedBody.includes(email));
      console.log(`   External in saved body: ${externalInSaved.length}`);
    }
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('❌ Error debugging external attendees:', error.message);
    console.error(error.stack);
  }
}

debugExternalAttendees();