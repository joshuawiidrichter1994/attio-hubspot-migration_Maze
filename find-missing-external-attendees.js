const ComprehensiveMeetingProcessor = require('./src/comprehensive-meeting-processor');

async function findMeetingsWithMissingExternalAttendees() {
    console.log('🔍 Finding meetings with missing external attendees...\n');

    try {
        const processor = new ComprehensiveMeetingProcessor();
        
        // Get all meetings from Attio
        console.log('📥 Fetching meetings from Attio...');
        const attioMeetings = await processor.getFreshAttioMeetings();
        console.log(`✅ Found ${attioMeetings.length} total meetings in Attio\n`);

        // Get all meetings from HubSpot
        console.log('📥 Fetching meetings from HubSpot...');
        const allHubSpotMeetings = await processor.getFreshHubSpotMeetings();
        
        // Create a map for quick lookups
        const hubspotMeetingsMap = new Map();
        allHubSpotMeetings.forEach(meeting => {
            const notes = meeting.properties?.hs_internal_meeting_notes?.value || 
                         meeting.properties?.hs_internal_meeting_notes || '';
            if (notes && notes.includes('Original Attio ID:')) {
                const match = notes.match(/Original Attio ID:\s*([a-f0-9-]+)/);
                if (match) {
                    hubspotMeetingsMap.set(match[1], {
                        id: meeting.id,
                        body: meeting.properties?.hs_meeting_body?.value || 
                              meeting.properties?.hs_meeting_body || '',
                        attendeeEmails: meeting.properties?.hs_attendee_emails?.value || 
                                       meeting.properties?.hs_attendee_emails || ''
                    });
                }
            }
        });
        
        console.log(`✅ Found ${hubspotMeetingsMap.size} meetings in HubSpot\n`);

        // Now check each Attio meeting for missing external attendees
        const problemMeetings = [];
        let checkedCount = 0;
        
        for (const attioMeeting of attioMeetings) {
            checkedCount++;
            if (checkedCount % 100 === 0) {
                console.log(`🔍 Checked ${checkedCount}/${attioMeetings.length} meetings...`);
            }

            const attioId = attioMeeting.id?.meeting_id || attioMeeting.id?.value;
            if (!attioId) continue;

            const hubspotMeeting = hubspotMeetingsMap.get(attioId);
            if (!hubspotMeeting) continue; // Meeting not migrated

            // Extract participants from Attio
            const participants = attioMeeting.values?.participants || [];
            const externalEmails = [];
            
            for (const participant of participants) {
                if (participant.referenced_actor_type === 'workspace-member') continue;
                
                const email = participant.referenced_actor_id;
                if (email && email.includes('@') && !email.includes('group.calendar.google.com')) {
                    externalEmails.push(email);
                }
            }

            if (externalEmails.length === 0) continue; // No external attendees to check

            // Check if external emails are in HubSpot body
            const body = hubspotMeeting.body.toLowerCase();
            const missingEmails = externalEmails.filter(email => !body.includes(email.toLowerCase()));

            if (missingEmails.length > 0) {
                const meetingTitle = attioMeeting.values?.title?.[0]?.value || 'Untitled';
                problemMeetings.push({
                    attioId,
                    hubspotId: hubspotMeeting.id,
                    title: meetingTitle,
                    totalExternal: externalEmails.length,
                    missingExternal: missingEmails.length,
                    missingEmails,
                    allExternalEmails: externalEmails,
                    bodyLength: hubspotMeeting.body.length
                });
            }
        }

        console.log(`\n📊 ANALYSIS COMPLETE`);
        console.log(`   Checked: ${checkedCount} Attio meetings`);
        console.log(`   Found: ${problemMeetings.length} meetings with missing external attendees\n`);

        if (problemMeetings.length > 0) {
            console.log('🚨 MEETINGS WITH MISSING EXTERNAL ATTENDEES:\n');
            
            problemMeetings.slice(0, 10).forEach((meeting, index) => {
                console.log(`${index + 1}. "${meeting.title}"`);
                console.log(`   Attio ID: ${meeting.attioId}`);
                console.log(`   HubSpot ID: ${meeting.hubspotId}`);
                console.log(`   External emails in Attio: ${meeting.totalExternal}`);
                console.log(`   Missing from HubSpot body: ${meeting.missingExternal}`);
                console.log(`   Missing emails: ${meeting.missingEmails.join(', ')}`);
                console.log(`   Body length: ${meeting.bodyLength} chars`);
                console.log('');
            });

            if (problemMeetings.length > 10) {
                console.log(`... and ${problemMeetings.length - 10} more meetings with missing external attendees.\n`);
            }

            // Let's test fixing one of them
            const testMeeting = problemMeetings[0];
            console.log(`🔧 TESTING FIX FOR: "${testMeeting.title}"`);
            console.log(`   Attio ID: ${testMeeting.attioId}\n`);

            // Get full Attio meeting data
            const fullAttioMeeting = attioMeetings.find(m => m.id?.value === testMeeting.attioId);
            if (fullAttioMeeting) {
                const processor = new ComprehensiveMeetingProcessor();
                const preparedData = await processor.prepareMeetingData(fullAttioMeeting, new Map(), new Map());
                
                console.log(`   📝 Current HubSpot body preview (first 200 chars):`);
                console.log(`   "${hubspotMeetingsMap.get(testMeeting.attioId).body.substring(0, 200)}..."`);
                console.log('');
                
                console.log(`   🔄 Prepared body preview (first 500 chars):`);
                console.log(`   "${preparedData.hs_meeting_body.substring(0, 500)}..."`);
                console.log('');

                console.log(`   📧 Missing emails should be: ${testMeeting.missingEmails.join(', ')}`);
                console.log(`   ✅ Are they in prepared body? ${testMeeting.missingEmails.every(email => 
                    preparedData.hs_meeting_body.toLowerCase().includes(email.toLowerCase())
                )}`);
            }
        } else {
            console.log('✅ All meetings have their external attendees properly preserved in HubSpot!');
        }

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

findMeetingsWithMissingExternalAttendees();