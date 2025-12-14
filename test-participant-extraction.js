const AttioAPI = require('./src/utils/attio-api');

async function testParticipantExtraction() {
    console.log('🔍 Testing participant extraction in our pipeline vs raw API...\n');
    
    try {
        const attioAPI = new AttioAPI();
        
        // 1. Get raw API response
        console.log('📡 Getting raw API response...');
        const rawResponse = await attioAPI.getMeetings(null);
        const rawMeeting = rawResponse.data[0];
        
        console.log(`Raw API - Meeting: "${rawMeeting.title}"`);
        console.log(`Raw API - Participants: ${rawMeeting.participants?.length || 0}`);
        if (rawMeeting.participants?.length > 0) {
            rawMeeting.participants.forEach((p, i) => {
                console.log(`  ${i+1}. ${p.email_address} (${p.status})`);
            });
        }
        
        // 2. Get processed meetings from getAllMeetings
        console.log('\n📊 Getting processed meetings from getAllMeetings...');
        const processedMeetings = await attioAPI.getAllMeetings();
        const processedMeeting = processedMeetings.find(m => 
            m.id?.meeting_id === rawMeeting.id?.meeting_id ||
            m.id === rawMeeting.id?.meeting_id
        );
        
        if (processedMeeting) {
            console.log(`Processed - Meeting: "${processedMeeting.title}"`);
            console.log(`Processed - Participants: ${processedMeeting.participants?.length || 0}`);
            if (processedMeeting.participants?.length > 0) {
                processedMeeting.participants.forEach((p, i) => {
                    console.log(`  ${i+1}. ${p.email_address} (${p.status})`);
                });
            }
            
            // 3. Test our extraction logic
            console.log('\n🔧 Testing extraction logic...');
            const values = processedMeeting.values || {};
            const extractedParticipants =
                values?.participants ||
                values?.attendees ||
                values?.people ||
                processedMeeting.participants ||
                processedMeeting.attendees ||
                processedMeeting.people ||
                [];
            
            console.log(`Extraction logic found: ${extractedParticipants?.length || 0} participants`);
            if (extractedParticipants?.length > 0) {
                extractedParticipants.forEach((p, i) => {
                    console.log(`  ${i+1}. ${p.email_address} (${p.status})`);
                });
            }
            
        } else {
            console.log('❌ Could not find the same meeting in processed results');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testParticipantExtraction();