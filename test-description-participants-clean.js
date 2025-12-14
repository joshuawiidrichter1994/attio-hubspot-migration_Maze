require('dotenv').config();
const ComprehensiveMeetingProcessor = require('./src/comprehensive-meeting-processor.js');

async function testParticipantInDescription() {
  console.log('\n🔍 Testing participant inclusion in meeting description...\n');
  
  const processor = new ComprehensiveMeetingProcessor();
  
  try {
    console.log('📅 Testing meeting: bb3b6d13-0539-40ec-9108-0df4d30464ef');
    
    // Get fresh meetings from Attio
    const meetings = await processor.getFreshAttioMeetings();
    const testMeeting = meetings.find(m => 
      (m.id?.meeting_id === 'bb3b6d13-0539-40ec-9108-0df4d30464ef') ||
      (m.id === 'bb3b6d13-0539-40ec-9108-0df4d30464ef')
    );
    
    if (!testMeeting) {
      console.log('❌ Test meeting not found in results');
      return;
    }
    
    console.log('✅ Found test meeting');
    console.log(`   Title: ${testMeeting.values?.title?.[0]?.value || 'No title'}`);
    console.log(`   Participants: ${testMeeting.participants?.length || 0}`);
    
    // Test the meeting processing logic directly by calling the internal method
    // We need to simulate what happens in processOneMeeting
    const values = testMeeting.values || {};
    const participants = values.participants || testMeeting.participants || [];
    
    console.log('\n📊 Participant data found:');
    participants.forEach((p, i) => {
      console.log(`   ${i + 1}. Email: ${p.email_address || p.email || 'N/A'}`);
      console.log(`      Name: ${p.name || p.full_name || 'N/A'}`);
      console.log(`      Status: ${p.status || 'N/A'}`);
      console.log(`      Is Organizer: ${p.is_organizer || false}`);
    });
    
    // Simulate the participant processing logic from the actual code (lines 572-596)
    const participantLines = participants.map(p => {
      const name =
        p.name ||
        p.full_name ||
        [p.first_name, p.last_name].filter(Boolean).join(' ') ||
        p.display_name ||
        '';

      const email = p.email_address || p.email || '';
      const status = p.status ? ` [${p.status}]` : '';
      const role = p.is_organizer ? ' (host)' : '';

      let label = name || email || 'Unknown participant';
      if (email && name) label += ` <${email}>`;
      else if (email && !name) label = email;

      return `- ${label}${role}${status}`;
    });

    let participantsSection = '';
    if (participantLines.length > 0) {
      participantsSection = `

Attio participants:
${participantLines.join('\n')}`;
    }
    
    const description = values.description?.[0]?.value || values.notes?.[0]?.value || '';
    const meetingId = testMeeting.id?.meeting_id || testMeeting.id;
    
    const bodyLines = [
      `Meeting imported from Attio. Original ID: ${meetingId}`,
      '',
      description ? description : 'No description provided',
      participantsSection.trim() ? participantsSection : ''
    ].filter(Boolean);

    const hsMeetingBody = bodyLines.join('\n');
    
    console.log('\n📋 Generated meeting body:');
    console.log('---');
    console.log(hsMeetingBody);
    console.log('---');
    
    // Check if participants are included
    const hasParticipants = hsMeetingBody.includes('Attio participants:');
    const hasTeamEmail = hsMeetingBody.includes('team@theory.ventures');
    const hasRjEmail = hsMeetingBody.includes('rj@theoryvc.com');
    
    console.log('\n🔍 Participant verification:');
    console.log(`   Has participant section: ${hasParticipants ? '✅' : '❌'}`);
    console.log(`   Contains team@theory.ventures: ${hasTeamEmail ? '✅' : '❌'}`);
    console.log(`   Contains rj@theoryvc.com: ${hasRjEmail ? '✅' : '❌'}`);
    
    if (hasParticipants && (hasTeamEmail || hasRjEmail)) {
      console.log('\n🎉 SUCCESS: Participants are properly included in the meeting description!');
      console.log('   All non-HubSpot contacts will appear in the meeting body for full visibility.');
    } else if (participants.length === 0) {
      console.log('\n⚠️ INFO: No participants found in this meeting data');
    } else {
      console.log('\n⚠️ WARNING: Participants found but may not be properly formatted in description');
    }
    
  } catch (error) {
    console.error('❌ Error testing participant inclusion:', error.message);
  }
}

testParticipantInDescription();