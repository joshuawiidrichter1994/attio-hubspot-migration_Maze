const AttioAPI = require('./src/utils/attio-api');

(async () => {
    try {
        console.log('🔗 Fetching one specific meeting...');
        
        const attio = new AttioAPI();
        
        // Get the first meeting to examine its structure
        const response = await attio.getAllMeetings(1);
        
        if (response.data && response.data.length > 0) {
            const meeting = response.data[0];
            
            console.log('\n📋 Full Meeting JSON:');
            console.log(JSON.stringify(meeting, null, 2));
            
            console.log('\n🕐 Date Analysis:');
            console.log('- meeting.values.created_at:', meeting.values?.created_at);
            console.log('- meeting.values.created_at type:', typeof meeting.values?.created_at);
            console.log('- meeting.values.updated_at:', meeting.values?.updated_at);
            console.log('- meeting.values.started_at:', meeting.values?.started_at);
            
            // Check if there are other date fields
            console.log('\n📊 All meeting.values keys:');
            if (meeting.values) {
                Object.keys(meeting.values).forEach(key => {
                    console.log(`- ${key}:`, meeting.values[key]);
                });
            }
            
        } else {
            console.log('❌ No meetings found in response');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
})();