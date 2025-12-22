const HubSpotAPI = require('./src/utils/hubspot-api');

async function verifyAssociations() {
    const api = new HubSpotAPI();
    
    const dealId = '388208250070';
    const meetingId = '386217958648'; // The meeting that was supposedly associated
    
    console.log('🔍 Verifying association creation...');
    console.log(`📋 Deal ID: ${dealId}`);
    console.log(`🎯 Meeting ID: ${meetingId}`);
    console.log('');
    
    try {
        // 1. Check deal's meeting associations
        console.log('1️⃣ Checking deal\'s meeting associations...');
        const dealMeetingsResponse = await api.makeRequest(
            `/crm/v4/objects/deals/${dealId}/associations/meetings`
        );
        const dealMeetings = dealMeetingsResponse.results || [];
        console.log(`   Found ${dealMeetings.length} meeting associations on deal`);
        if (dealMeetings.length > 0) {
            dealMeetings.forEach(meeting => {
                console.log(`   - Meeting ${meeting.id} (${meeting.type || 'No type'})`);
            });
        }
        console.log('');
        
        // 2. Check meeting's deal associations  
        console.log('2️⃣ Checking meeting\'s deal associations...');
        const meetingDealsResponse = await api.makeRequest(
            `/crm/v4/objects/meetings/${meetingId}/associations/deals`
        );
        const meetingDeals = meetingDealsResponse.results || [];
        console.log(`   Found ${meetingDeals.length} deal associations on meeting`);
        if (meetingDeals.length > 0) {
            meetingDeals.results.forEach(deal => {
                console.log(`   - Deal ${deal.id} (${deal.type || 'No type'})`);
            });
        }
        console.log('');
        
        // 3. Get the actual meeting details
        console.log('3️⃣ Getting meeting details...');
        const meeting = await api.makeRequest(
            `/crm/v3/objects/meetings/${meetingId}?properties=hs_meeting_title,hs_meeting_body,hs_meeting_start_time,hs_meeting_end_time`
        );
        console.log(`   Meeting: ${meeting.properties.hs_meeting_title || 'No title'}`);
        console.log(`   Start: ${meeting.properties.hs_meeting_start_time || 'No start time'}`);
        console.log('');
        
        // 4. Get the actual deal details
        console.log('4️⃣ Getting deal details...');
        const deal = await api.makeRequest(
            `/crm/v3/objects/deals/${dealId}?properties=dealname,dealstage,createdate`
        );
        console.log(`   Deal: ${deal.properties.dealname}`);
        console.log(`   Stage: ${deal.properties.dealstage}`);
        console.log('');
        
        // 5. Check if association actually exists
        const hasAssociation = dealMeetings.results.some(m => m.id === meetingId);
        console.log(`🎯 Association exists: ${hasAssociation ? '✅ YES' : '❌ NO'}`);
        
        if (!hasAssociation) {
            console.log('⚠️  The association creation appeared to succeed but the association doesn\'t exist!');
        }
        
    } catch (error) {
        console.error('❌ Error verifying associations:', error.message);
    }
}

verifyAssociations().catch(console.error);