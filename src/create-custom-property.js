const HubSpotAPI = require('./hubspot-api');

async function createAttioMeetingIdProperty() {
    const hubspot = new HubSpotAPI();
    
    try {
        console.log('🏗️  Creating custom property: attio_meeting_id');
        
        const propertyConfig = {
            name: "attio_meeting_id",
            label: "Attio Meeting ID",
            type: "string",
            fieldType: "text",
            description: "Unique identifier from Attio CRM for this meeting",
            groupName: "meetinginformation",
            options: [],
            displayOrder: -1,
            hasUniqueValue: true,
            hidden: false,
            formField: false
        };
        
        const response = await hubspot.request('POST', '/crm/v3/properties/meetings', propertyConfig);
        
        console.log('✅ Successfully created custom property:', response.name);
        console.log('📊 Property details:', {
            name: response.name,
            label: response.label,
            type: response.type,
            hasUniqueValue: response.hasUniqueValue
        });
        
        return response;
    } catch (error) {
        if (error.response?.data?.message?.includes('already exists')) {
            console.log('✅ Property already exists - that\'s fine!');
            return null;
        }
        
        console.error('❌ Error creating custom property:', error.response?.data || error.message);
        throw error;
    }
}

async function main() {
    try {
        await createAttioMeetingIdProperty();
        console.log('\n🎉 Custom property setup completed!');
    } catch (error) {
        console.error('💥 Setup failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { createAttioMeetingIdProperty };