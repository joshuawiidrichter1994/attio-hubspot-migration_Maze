const ComprehensiveMeetingProcessor = require('./src/comprehensive-meeting-processor');

async function debugAssociations() {
    const processor = new ComprehensiveMeetingProcessor();
    
    console.log('🔍 DEBUGGING ASSOCIATION LOGIC');
    
    try {
        // Get a few Attio meetings 
        const allAttioMeetings = await processor.attio.getAllMeetings();
        const attioMeetings = allAttioMeetings.slice(0, 5);
        console.log(`📊 Found ${attioMeetings.length} Attio meetings for testing`);
        
        if (attioMeetings.length === 0) {
            console.log('❌ No Attio meetings found to debug');
            return;
        }
        
        // Test the association logic on the first meeting
        const testMeeting = attioMeetings[0];
        console.log(`\n🧪 Testing meeting: "${testMeeting.title}"`);
        console.log(`   ID: ${testMeeting.id.meeting_id}`);
        
        // Debug the participants structure
        console.log('\n👥 Participants structure:');
        if (testMeeting.participants && testMeeting.participants.length > 0) {
            testMeeting.participants.forEach((participant, index) => {
                console.log(`   Participant ${index + 1}:`, {
                    email: participant.email_address,
                    status: participant.status,
                    isOrganizer: participant.is_organizer,
                    targetRecordId: participant.target_record_id || 'No target_record_id',
                    id: participant.id || 'No id'
                });
            });
        } else {
            console.log('   No participants found');
        }
        
        // Debug the linked_records structure
        console.log('\n🔗 Linked records structure:');
        if (testMeeting.linked_records && testMeeting.linked_records.length > 0) {
            testMeeting.linked_records.forEach((record, index) => {
                console.log(`   Record ${index + 1}:`, {
                    recordType: record.target_object,
                    targetRecordId: record.target_record_id || 'No target_record_id',
                    id: record.id || 'No id'
                });
            });
        } else {
            console.log('   No linked records found');
        }
        
        // Test the getDesiredAssociationsForMeeting method
        console.log('\n🎯 Testing association extraction...');
        const desiredAssociations = await processor.getDesiredAssociationsForMeeting(testMeeting);
        
        console.log('📊 Desired associations result:', {
            contacts: desiredAssociations.contacts.length,
            companies: desiredAssociations.companies.length,
            deals: desiredAssociations.deals.length
        });
        
        if (desiredAssociations.contacts.length > 0) {
            console.log('   Contact IDs:', desiredAssociations.contacts.slice(0, 3).map(c => c.substring(0, 10) + '...'));
        }
        if (desiredAssociations.companies.length > 0) {
            console.log('   Company IDs:', desiredAssociations.companies.slice(0, 3).map(c => c.substring(0, 10) + '...'));
        }
        if (desiredAssociations.deals.length > 0) {
            console.log('   Deal IDs:', desiredAssociations.deals.slice(0, 3).map(c => c.substring(0, 10) + '...'));
        }
        
        // Check if the association counts match expectations
        const totalAssociations = desiredAssociations.contacts.length + 
                                 desiredAssociations.companies.length + 
                                 desiredAssociations.deals.length;
        
        console.log(`\n📈 Total associations: ${totalAssociations}`);
        
        if (totalAssociations === 0) {
            console.log('❌ NO ASSOCIATIONS FOUND - This is the bug!');
            console.log('\n🔍 Let\'s debug why:');
            
            // Debug participant lookup
            if (testMeeting.participants && testMeeting.participants.length > 0) {
                for (const participant of testMeeting.participants.slice(0, 2)) {
                    console.log(`\n   🔎 Debugging participant: ${participant.email_address}`);
                    const attioContactId = participant.target_record_id || participant.id;
                    if (attioContactId) {
                        console.log(`     Attio Contact ID: ${attioContactId}`);
                        try {
                            const hubspotContact = await processor.findHubSpotContact(attioContactId);
                            console.log(`     HubSpot Contact: ${hubspotContact ? 'FOUND (' + hubspotContact + ')' : 'NOT FOUND'}`);
                        } catch (error) {
                            console.log(`     HubSpot Contact lookup error: ${error.message}`);
                        }
                    } else {
                        console.log('     No Attio Contact ID available');
                    }
                }
            }
            
            // Debug linked record lookup
            if (testMeeting.linked_records && testMeeting.linked_records.length > 0) {
                for (const record of testMeeting.linked_records.slice(0, 2)) {
                    console.log(`\n   🔎 Debugging linked ${record.target_object}: ${record.target_record_id || record.id}`);
                    const recordId = record.target_record_id || record.id;
                    
                    if (record.target_object === 'company' && recordId) {
                        try {
                            const hubspotCompany = await processor.findHubSpotCompany(recordId);
                            console.log(`     HubSpot Company: ${hubspotCompany ? 'FOUND (' + hubspotCompany + ')' : 'NOT FOUND'}`);
                        } catch (error) {
                            console.log(`     HubSpot Company lookup error: ${error.message}`);
                        }
                    } else if (record.target_object === 'deal' && recordId) {
                        try {
                            const hubspotDeal = await processor.findHubSpotDeal(recordId);
                            console.log(`     HubSpot Deal: ${hubspotDeal ? 'FOUND (' + hubspotDeal + ')' : 'NOT FOUND'}`);
                        } catch (error) {
                            console.log(`     HubSpot Deal lookup error: ${error.message}`);
                        }
                    }
                }
            }
        } else {
            console.log('✅ Associations found correctly!');
        }
        
    } catch (error) {
        console.error('❌ Error during debugging:', error);
    }
}

debugAssociations().catch(console.error);