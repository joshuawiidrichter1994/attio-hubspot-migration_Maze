const { AttioService } = require('./src/services/attio-service');
const { HubSpotService } = require('./src/services/hubspot-service');

async function checkMissingParticipants() {
    console.log('🔍 Checking for meetings with missing participant data...\n');
    
    const attioService = new AttioService();
    const hubspotService = new HubSpotService();
    
    try {
        // Get a sample of meetings from both systems
        console.log('📊 Fetching meetings from Attio...');
        const attioMeetings = await attioService.getMeetings();
        console.log(`✅ Found ${attioMeetings.length} meetings in Attio\n`);
        
        console.log('📊 Fetching meetings from HubSpot...');
        const hubspotMeetings = await hubspotService.getMeetings();
        console.log(`✅ Found ${hubspotMeetings.length} meetings in HubSpot\n`);
        
        let issuesFound = 0;
        let checkedMeetings = 0;
        const maxCheck = 20; // Check first 20 meetings for efficiency
        
        console.log(`🔍 Analyzing first ${maxCheck} meetings for participant issues...\n`);
        
        for (let i = 0; i < Math.min(attioMeetings.length, maxCheck); i++) {
            const attioMeeting = attioMeetings[i];
            checkedMeetings++;
            
            // Skip future meetings
            const meetingDate = new Date(attioMeeting.values?.start_time?.datetime);
            if (meetingDate > new Date()) {
                continue;
            }
            
            // Find corresponding HubSpot meeting
            const hubspotMeeting = hubspotMeetings.find(hm => 
                hm.properties.hs_meeting_title === attioMeeting.values?.title?.value
            );
            
            if (!hubspotMeeting) {
                console.log(`⚠️  Meeting "${attioMeeting.values?.title?.value}" not found in HubSpot`);
                continue;
            }
            
            // Check participant data in Attio
            const attioParticipants = attioMeeting.values?.participants?.referenced_records || [];
            const attioParticipantCount = attioParticipants.length;
            
            // Check description in HubSpot for participant info
            const hubspotDescription = hubspotMeeting.properties.hs_meeting_body || '';
            const hasAttioSection = hubspotDescription.includes('Attio participants:');
            
            // Count participants mentioned in description
            const participantMatches = hubspotDescription.match(/• .+? \(.+?\)/g);
            const descriptionParticipantCount = participantMatches ? participantMatches.length : 0;
            
            console.log(`📋 Meeting: "${attioMeeting.values?.title?.value}"`);
            console.log(`   Attio participants: ${attioParticipantCount}`);
            console.log(`   HubSpot description participants: ${descriptionParticipantCount}`);
            console.log(`   Has "Attio participants:" section: ${hasAttioSection}`);
            
            // Flag potential issues
            if (attioParticipantCount > 0 && (!hasAttioSection || descriptionParticipantCount === 0)) {
                console.log(`   ❌ ISSUE: Attio has ${attioParticipantCount} participants but HubSpot description has ${descriptionParticipantCount}`);
                issuesFound++;
            } else if (attioParticipantCount > 0 && descriptionParticipantCount < attioParticipantCount) {
                console.log(`   ⚠️  POTENTIAL ISSUE: Participant count mismatch (Attio: ${attioParticipantCount}, HubSpot desc: ${descriptionParticipantCount})`);
                issuesFound++;
            } else {
                console.log(`   ✅ OK`);
            }
            console.log('');
        }
        
        console.log(`\n📊 ANALYSIS SUMMARY:`);
        console.log(`   Meetings checked: ${checkedMeetings}`);
        console.log(`   Issues found: ${issuesFound}`);
        
        if (issuesFound > 0) {
            console.log(`\n❌ RECOMMENDATION: Re-run migration to fix ${issuesFound} meetings with participant data issues`);
            console.log(`   The updated participant processing logic will ensure all participant data is properly included.`);
        } else {
            console.log(`\n✅ GOOD NEWS: No participant data issues found in the sample`);
            console.log(`   Your existing migration appears to have captured participant data correctly.`);
        }
        
    } catch (error) {
        console.error('❌ Error during analysis:', error.message);
    }
}

checkMissingParticipants();