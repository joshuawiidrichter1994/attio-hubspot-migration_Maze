const HubSpotAPI = require('./src/utils/hubspot-api');

class MeetingDateAnalysis {
  constructor() {
    this.hubspotAPI = new HubSpotAPI();
  }

  async run() {
    console.log('🔍 ANALYZING ALL MEETING DATES IN HUBSPOT...\n');
    
    try {
      // Get current date
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      console.log(`📅 Today's date: ${now.toISOString()}`);
      console.log(`📊 Today start timestamp: ${todayStart}\n`);

      // Get all meetings from HubSpot engagements
      console.log('🔍 Fetching all HubSpot meetings...');
      const allMeetings = await this.hubspotAPI.getAllMeetings();
      console.log(`📊 Found ${allMeetings.length} total meetings in HubSpot\n`);

      // Analyze meeting dates
      const dateCounts = {};
      const recentMeetings = [];
      const futureMeetings = [];
      const todayAndFuture = [];
      
      for (const meeting of allMeetings) {
        // Skip meetings without properties
        if (!meeting.properties) {
          continue;
        }
        
        const meetingTimestamp = meeting.properties.hs_timestamp;
        if (!meetingTimestamp) continue;
        
        const timestamp = parseInt(meetingTimestamp);
        const meetingDate = new Date(timestamp);
        const dateKey = meetingDate.toISOString().split('T')[0]; // YYYY-MM-DD
        
        // Count by date
        dateCounts[dateKey] = (dateCounts[dateKey] || 0) + 1;
        
        // Collect meetings from today onwards
        if (timestamp >= todayStart) {
          todayAndFuture.push({
            id: meeting.id,
            title: meeting.properties.hs_meeting_title || 'No title',
            timestamp: timestamp,
            date: meetingDate.toISOString(),
            dateKey: dateKey
          });
        }
        
        // Collect future meetings (after today)
        if (timestamp > now.getTime()) {
          futureMeetings.push({
            id: meeting.id,
            title: meeting.properties.hs_meeting_title || 'No title',
            timestamp: timestamp,
            date: meetingDate.toISOString(),
            dateKey: dateKey
          });
        }
        
        // Collect recent meetings (last 7 days)
        const weekAgo = now.getTime() - (7 * 24 * 60 * 60 * 1000);
        if (timestamp >= weekAgo) {
          recentMeetings.push({
            id: meeting.id,
            title: meeting.properties.hs_meeting_title || 'No title',
            timestamp: timestamp,
            date: meetingDate.toISOString(),
            dateKey: dateKey
          });
        }
      }

      // Sort dates
      const sortedDates = Object.keys(dateCounts).sort();
      
      console.log('📊 MEETING COUNTS BY DATE:');
      console.log('Recent dates with meetings:');
      sortedDates.slice(-14).forEach(date => {
        const isToday = date === now.toISOString().split('T')[0];
        const isFuture = new Date(date + 'T00:00:00Z').getTime() > now.getTime();
        const marker = isToday ? ' (TODAY)' : (isFuture ? ' (FUTURE)' : '');
        console.log(`   ${date}: ${dateCounts[date]} meetings${marker}`);
      });

      console.log(`\n🚨 ANALYSIS RESULTS:`);
      console.log(`   📅 Meetings from today onwards: ${todayAndFuture.length}`);
      console.log(`   ⏰ Meetings in the future: ${futureMeetings.length}`);
      console.log(`   📈 Recent meetings (last 7 days): ${recentMeetings.length}`);

      if (todayAndFuture.length > 0) {
        console.log(`\n📋 MEETINGS FROM TODAY ONWARDS (first 20):`);
        todayAndFuture.slice(0, 20).forEach((meeting, index) => {
          const isFuture = meeting.timestamp > now.getTime();
          const marker = isFuture ? ' [FUTURE]' : ' [TODAY]';
          console.log(`   ${index + 1}. ${meeting.title} - ${meeting.date}${marker} (ID: ${meeting.id})`);
        });
        
        if (todayAndFuture.length > 20) {
          console.log(`   ... and ${todayAndFuture.length - 20} more meetings from today onwards`);
        }
      }

      if (futureMeetings.length > 0) {
        console.log(`\n🚨 FUTURE MEETINGS FOUND (${futureMeetings.length} total):`);
        futureMeetings.slice(0, 10).forEach((meeting, index) => {
          console.log(`   ${index + 1}. ${meeting.title} - ${meeting.date} (ID: ${meeting.id})`);
        });
        
        if (futureMeetings.length > 10) {
          console.log(`   ... and ${futureMeetings.length - 10} more future meetings`);
        }
      } else {
        console.log(`\n✅ NO FUTURE MEETINGS FOUND - All looks good!`);
      }

    } catch (error) {
      console.error('❌ Critical error during analysis:', error.message);
      throw error;
    }
  }
}

// Run the analysis
const analysis = new MeetingDateAnalysis();
analysis.run().catch(console.error);