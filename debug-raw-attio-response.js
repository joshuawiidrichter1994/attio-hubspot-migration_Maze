const AttioAPI = require('./src/utils/attio-api');

async function debugRawAttioResponse() {
    console.log('🔍 DEBUG: Getting raw Attio API response to check participant structure...\n');
    
    const attio = new AttioAPI();
    
    try {
        // Make a single API call to get the first 3 meetings
        const response = await attio.getMeetings(null);
        
        console.log(`📊 API Response Summary:`);
        console.log(`   Total meetings in response: ${response.data?.length || 0}`);
        console.log(`   Has next cursor: ${!!response.pagination?.next_cursor}`);
        
        // Show the first 3 meetings with full structure
        for (let i = 0; i < Math.min(3, response.data?.length || 0); i++) {
            const meeting = response.data[i];
            const meetingId = meeting.id?.meeting_id || meeting.id || 'unknown';
            
            console.log(`\n📋 Meeting ${i+1}: "${meeting.title || 'No title'}"`);
            console.log(`   ID: ${meetingId}`);
            console.log(`   Raw structure keys: [${Object.keys(meeting).join(', ')}]`);
            
            // Focus specifically on participants
            console.log(`\n   🎯 Participants Analysis:`);
            if (meeting.participants) {
                console.log(`   participants type: ${typeof meeting.participants}`);
                console.log(`   participants length: ${Array.isArray(meeting.participants) ? meeting.participants.length : 'not array'}`);
                console.log(`   participants content:`, JSON.stringify(meeting.participants, null, 4));
                
                if (Array.isArray(meeting.participants) && meeting.participants.length > 0) {
                    meeting.participants.forEach((p, idx) => {
                        console.log(`\n   Participant ${idx + 1}:`);
                        console.log(`     Keys: [${Object.keys(p).join(', ')}]`);
                        console.log(`     email_address: ${p.email_address || 'none'}`);
                        console.log(`     status: ${p.status || 'none'}`);
                        console.log(`     is_organizer: ${p.is_organizer || false}`);
                        console.log(`     Full data:`, JSON.stringify(p, null, 6));
                    });
                }
            } else {
                console.log(`   ❌ participants field: undefined/null`);
            }
            
            // Also check if there are alternative participant fields
            const potentialFields = ['attendees', 'people', 'invitees', 'guests'];
            potentialFields.forEach(field => {
                if (meeting[field]) {
                    console.log(`   ✅ Found ${field}:`, JSON.stringify(meeting[field], null, 4));
                }
            });
            
            console.log(`\n   📄 Raw meeting object (first 1000 chars):`);
            console.log(JSON.stringify(meeting, null, 2).substring(0, 1000) + '...\n');
            console.log('=' .repeat(80));
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

debugRawAttioResponse();