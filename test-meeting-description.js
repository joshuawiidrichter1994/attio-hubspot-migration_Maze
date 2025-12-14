require('dotenv').config();
const ComprehensiveMeetingProcessor = require('./src/comprehensive-meeting-processor.js');

async function testMeetingDescription() {
  console.log('\n🔍 Testing meeting description generation...\n');
  
  const processor = new ComprehensiveMeetingProcessor();
  
  try {
    // Get a specific meeting to test
    const meetingId = 'bb3b6d13-0539-40ec-9108-0df4d30464ef';
    const response = await processor.attio.client.get(`/v2/meetings/${meetingId}`);
    const attioMeeting = response.data.data;
    
    console.log('📅 Meeting ID:', attioMeeting.id.meeting_id);
    console.log('📧 Meeting title:', attioMeeting.values?.title?.[0]?.value || 'No title');
    
    // Test the actual participant list building logic from the processor
    const values = attioMeeting.values || {};
    const participants =
      values.participants ||
      values.attendees ||
      values.people ||
      attioMeeting.participants ||
      attioMeeting.attendees ||
      attioMeeting.people ||
      [];

    console.log('\n📋 Found participants:', participants.length);
    
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
    
    console.log('\n📝 Generated participant section:');
    console.log(participantsSection);
    
    // Test complete meeting body
    const description = attioMeeting.values?.description?.[0]?.value || attioMeeting.description || '';
    
    const bodyLines = [
      `Meeting imported from Attio. Original ID: ${attioMeeting.id.meeting_id}`,
      '',
      description ? description : 'No description provided',
      participantsSection.trim() ? participantsSection : ''
    ].filter(Boolean);

    const hsMeetingBody = bodyLines.join('\n');
    
    console.log('\n📄 Complete meeting body that would be set:');
    console.log('==========================================');
    console.log(hsMeetingBody);
    console.log('==========================================');
    
  } catch (error) {
    console.error('❌ Error testing meeting description:', error.message);
  }
}

testMeetingDescription();