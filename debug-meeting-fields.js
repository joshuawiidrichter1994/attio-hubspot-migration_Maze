const AttioAPI = require('./src/utils/attio-api');

async function debugMeetingStructure() {
    console.log('🔍 Debugging Attio meeting data structure...\n');
    
    try {
        const attioAPI = new AttioAPI();
        const meetings = await attioAPI.getAllMeetings();
        
        console.log(`✅ Found ${meetings.length} meetings in Attio\n`);
        
        // Examine structure of first 3 meetings
        for (let i = 0; i < Math.min(3, meetings.length); i++) {
            const meeting = meetings[i];
            console.log(`📋 Meeting ${i + 1}:`);
            console.log(`   Title: "${meeting.values?.title || 'No title'}"`);
            console.log(`   ID: ${meeting.id}`);
            console.log(`   Created at: ${meeting.created_at}`);
            console.log('   Available fields:');
            console.log('   - Raw meeting object keys:', Object.keys(meeting));
            
            if (meeting.values) {
                console.log('   - Values object keys:', Object.keys(meeting.values));
                
                // Check for various participant-related fields
                const participantFields = [
                    'participants', 'attendees', 'people', 'contacts', 
                    'invitees', 'meeting_participants', 'participant_list',
                    'external_participants', 'guests'
                ];
                
                console.log('   - Checking for participant fields:');
                participantFields.forEach(field => {
                    const value = meeting.values[field];
                    if (value !== undefined) {
                        console.log(`     ✅ ${field}: ${JSON.stringify(value)}`);
                    } else {
                        console.log(`     ❌ ${field}: undefined`);
                    }
                });
                
                // Show all non-null values
                console.log('   - All non-null values:');
                Object.entries(meeting.values).forEach(([key, value]) => {
                    if (value !== null && value !== undefined) {
                        console.log(`     ${key}: ${JSON.stringify(value).substring(0, 100)}${JSON.stringify(value).length > 100 ? '...' : ''}`);
                    }
                });
            }
            
            console.log('\n' + '='.repeat(80) + '\n');
        }
        
        // Check if there are any meetings with participant-like data
        console.log('🔍 Scanning all meetings for participant-related data...\n');
        
        let meetingsWithParticipantData = 0;
        const participantFieldsFound = new Set();
        
        for (const meeting of meetings) {
            if (meeting.values) {
                const hasParticipantData = Object.keys(meeting.values).some(key => 
                    key.toLowerCase().includes('participant') || 
                    key.toLowerCase().includes('attendee') || 
                    key.toLowerCase().includes('people') ||
                    key.toLowerCase().includes('contact') ||
                    key.toLowerCase().includes('invitee') ||
                    key.toLowerCase().includes('guest')
                );
                
                if (hasParticipantData) {
                    meetingsWithParticipantData++;
                    Object.keys(meeting.values).forEach(key => {
                        if (key.toLowerCase().includes('participant') || 
                            key.toLowerCase().includes('attendee') || 
                            key.toLowerCase().includes('people') ||
                            key.toLowerCase().includes('contact') ||
                            key.toLowerCase().includes('invitee') ||
                            key.toLowerCase().includes('guest')) {
                            participantFieldsFound.add(key);
                        }
                    });
                }
            }
        }
        
        console.log(`📊 Summary:`);
        console.log(`   - Total meetings: ${meetings.length}`);
        console.log(`   - Meetings with potential participant data: ${meetingsWithParticipantData}`);
        console.log(`   - Participant field names found: [${Array.from(participantFieldsFound).join(', ')}]`);
        
        if (participantFieldsFound.size > 0) {
            console.log('\n🎯 Found participant fields! Let me show a sample:');
            
            for (const meeting of meetings) {
                if (meeting.values) {
                    const hasData = Array.from(participantFieldsFound).some(field => meeting.values[field]);
                    if (hasData) {
                        console.log(`\n📋 Meeting with participant data: "${meeting.values?.title || 'No title'}"`);
                        participantFieldsFound.forEach(field => {
                            if (meeting.values[field]) {
                                console.log(`   ${field}:`, JSON.stringify(meeting.values[field], null, 2));
                            }
                        });
                        break; // Just show one example
                    }
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('Stack:', error.stack);
    }
}

debugMeetingStructure();