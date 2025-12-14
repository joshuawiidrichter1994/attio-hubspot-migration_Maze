const AttioAPI = require('./src/utils/attio-api');
require('dotenv').config();

async function debugAttioMeeting() {
    try {
        const attio = new AttioAPI(process.env.ATTIO_API_KEY);
        console.log('🔍 Fetching one Attio meeting to examine structure...');
        
        // Get the first meeting
        const meetings = await attio.getAllMeetings(1);
        if (meetings.length === 0) {
            console.log('❌ No meetings found');
            return;
        }
        
        const meeting = meetings[0];
        console.log('\n📋 Meeting:', meeting.title);
        console.log('\n🔍 FULL MEETING STRUCTURE:');
        console.log(JSON.stringify(meeting, null, 2));
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

debugAttioMeeting();