const HubSpotAPI = require('./src/utils/hubspot-api');

class FutureMeetingCleanup {
  constructor() {
    this.hubspotAPI = new HubSpotAPI();
    this.deletedCount = 0;
    this.errorCount = 0;
  }

  async run() {
    console.log('🚨 EMERGENCY CLEANUP: Finding and deleting future meetings from HubSpot...\n');
    
    try {
      // Get current date
      const now = new Date();
      const currentTimestamp = now.getTime();
      console.log(`📅 Current date: ${now.toISOString()}`);
      console.log(`📊 Current timestamp: ${currentTimestamp}\n`);

      // Get all meetings from HubSpot ENGAGEMENTS (not v3 objects)
      console.log('🔍 Fetching all HubSpot meeting engagements...');
      const allMeetings = await this.hubspotAPI.getAllMeetings(); // This already uses engagements API
      console.log(`📊 Found ${allMeetings.length} total meeting engagements in HubSpot\n`);

      // Filter for future meetings
      const futureMeetings = [];
      
      for (const meeting of allMeetings) {
        // For engagements, check the correct timestamp fields
        const engagementTimestamp = meeting.engagement?.timestamp;
        const metadataStartTime = meeting.metadata?.startTime;
        
        // Use the actual start time from metadata, fallback to engagement timestamp
        const meetingTimestamp = metadataStartTime || engagementTimestamp;
        
        if (!meetingTimestamp) {
          continue;
        }
        
        // Check if meeting is in the future
        if (meetingTimestamp > currentTimestamp) {
          const meetingDate = new Date(meetingTimestamp);
          
          // Extra check: Only delete if it's significantly in the future (not just a few hours)
          const hoursInFuture = (meetingTimestamp - currentTimestamp) / (1000 * 60 * 60);
          
          futureMeetings.push({
            id: meeting.engagement?.id || meeting.id,
            title: meeting.metadata?.title || meeting.metadata?.subject || 'No title',
            timestamp: meetingTimestamp,
            date: meetingDate.toISOString(),
            startTime: meetingDate.toLocaleString(),
            hoursInFuture: Math.round(hoursInFuture),
            isAttioImport: meeting.metadata?.body && meeting.metadata?.body.includes('Meeting imported from Attio'),
            engagementId: meeting.engagement?.id,
            metadataStartTime: metadataStartTime,
            engagementTimestamp: engagementTimestamp
          });
        }
      }

      console.log(`🚨 Found ${futureMeetings.length} FUTURE MEETINGS that need to be deleted!`);
      
      if (futureMeetings.length === 0) {
        console.log('✅ No future meetings found. Nothing to delete.');
        return;
      }

      // Show first 10 future meetings for confirmation
      console.log('\n📋 Future meeting engagements found:');
      futureMeetings.slice(0, 10).forEach((meeting, index) => {
        const attioMarker = meeting.isAttioImport ? ' [ATTIO IMPORT]' : '';
        console.log(`   ${index + 1}. ${meeting.title} - ${meeting.date} (+${meeting.hoursInFuture}h)${attioMarker} (ID: ${meeting.id})`);
      });

      if (futureMeetings.length > 10) {
        console.log(`   ... and ${futureMeetings.length - 10} more future meeting engagements`);
      }

      // Count Attio imports vs others
      const attioImports = futureMeetings.filter(m => m.isAttioImport);
      console.log(`\n📊 Future meeting breakdown:`);
      console.log(`   📥 Attio imports: ${attioImports.length}`);
      console.log(`   🏢 Other meetings: ${futureMeetings.length - attioImports.length}`);

      console.log(`\n🔥 DELETING ALL ${futureMeetings.length} FUTURE MEETING ENGAGEMENTS NOW...\n`);

      // Delete all future meetings
      for (let i = 0; i < futureMeetings.length; i++) {
        const meeting = futureMeetings[i];
        try {
          console.log(`🗑️ [${i + 1}/${futureMeetings.length}] Deleting: ${meeting.title} (${meeting.startTime})`);
          
          // Use the correct engagement ID for deletion
          await this.hubspotAPI.deleteMeeting(meeting.engagementId || meeting.id);
          this.deletedCount++;
          
          // Progress update every 25 deletions
          if (this.deletedCount % 25 === 0) {
            console.log(`✅ Progress: ${this.deletedCount}/${futureMeetings.length} meetings deleted`);
          }
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          this.errorCount++;
          console.error(`❌ Error deleting meeting ${meeting.id}: ${error.message}`);
        }
      }

      console.log(`\n🎉 CLEANUP COMPLETE!`);
      console.log(`✅ Successfully deleted: ${this.deletedCount} future meetings`);
      console.log(`❌ Errors: ${this.errorCount} meetings`);
      console.log(`📊 Total processed: ${futureMeetings.length} meetings\n`);

    } catch (error) {
      console.error('❌ Critical error during cleanup:', error.message);
      throw error;
    }
  }
}

// Run the cleanup
const cleanup = new FutureMeetingCleanup();
cleanup.run().catch(console.error);