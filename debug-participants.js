const AttioAPI = require('./src/utils/attio-api');

async function debugParticipants() {
    console.log('🔍 DEBUG: Checking what participant data we actually get from Attio...\n');
    
    const attio = new AttioAPI();
    
    try {
        const attioMeetings = await attio.getAllMeetings();
        console.log(`✅ Found ${attioMeetings.length} meetings in Attio\n`);
        
        // Check first 5 meetings for participant data structure
        for (let i = 0; i < Math.min(5, attioMeetings.length); i++) {
            const meeting = attioMeetings[i];
            
            console.log(`📋 Meeting ${i+1}: "${meeting.values?.title?.value || 'No title'}"`);
            console.log(`   Raw participants data:`, JSON.stringify(meeting.values?.participants, null, 2));
            
            const participants = meeting.values?.participants?.referenced_records || [];
            console.log(`   Participants array length: ${participants.length}`);
            
            if (participants.length > 0) {
                participants.forEach((p, idx) => {
                    console.log(`   Participant ${idx + 1}:`, {
                        name: p.name || p.full_name || 'No name',
                        email: p.email_address || p.email || 'No email',
                        domain: (p.email_address || p.email || '').split('@')[1] || 'No domain',
                        isNonHubSpot: !(p.email_address || p.email || '').includes('@mazehq.com')
                    });
                });
            }
            console.log('\n');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

debugParticipants();