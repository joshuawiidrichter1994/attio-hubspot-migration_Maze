/**
 * Script 3: Meeting Description Formatter
 * 
 * This script formats meeting descriptions to standardize the layout of 
 * recording links and transcripts with the specific format requested:
 * "******************** Call recording: <link> Transcript: <formatted transcript> ********************"
 */

const HubSpotAPI = require('./utils/hubspot-api');

class MeetingDescriptionFormatter {
  constructor() {
    this.hubspot = new HubSpotAPI();
  }

  /**
   * Get all HubSpot meetings that have recording info
   */
  async getMeetingsWithRecordings() {
    console.log('📥 Fetching meetings with recording info...');
    
    try {
      let allMeetings = [];
      let after = undefined;
      
      do {
        const params = {
          limit: 100,
          properties: [
            'hs_meeting_title',
            'hs_meeting_body', 
            'attio_meeting_id',
            'hs_meeting_start_time',
            'hs_meeting_end_time'
          ].join(','),
          ...(after && { after })
        };
        
        const response = await this.hubspot.client.get('/crm/v3/objects/meetings', { params });
        
        // Filter only meetings that have recording info
        const meetingsWithRecordings = response.data.results.filter(meeting => 
          meeting.properties.hs_meeting_body && 
          meeting.properties.hs_meeting_body.includes('Call recording:')
        );
        
        allMeetings.push(...meetingsWithRecordings);
        after = response.data.paging?.next?.after;
        
      } while (after);
      
      console.log(`   ✅ Found ${allMeetings.length} meetings with recordings`);
      return allMeetings;
      
    } catch (error) {
      console.error('❌ Error fetching meetings with recordings:', error.message);
      throw error;
    }
  }

  /**
   * Check if meeting description is already in the correct format
   */
  isMeetingAlreadyFormatted(description) {
    return description.includes('********************') && 
           description.includes('Call recording:') && 
           description.includes('Transcript:') &&
           description.match(/\*{20}[\s\S]*Call recording:[\s\S]*Transcript:[\s\S]*\*{20}/);
  }

  /**
   * Extract recording URL and transcript from current description
   */
  extractRecordingAndTranscript(description) {
    try {
      const lines = description.split('\n');
      let recordingUrl = '';
      let transcript = '';
      let isInRecordingSection = false;
      let isInTranscriptSection = false;
      let originalContent = '';
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Skip asterisk separators
        if (line.startsWith('***')) {
          isInRecordingSection = false;
          isInTranscriptSection = false;
          continue;
        }
        
        // Check for recording section
        if (line.includes('Call recording:')) {
          isInRecordingSection = true;
          // Extract URL if it's on the same line
          const urlMatch = line.match(/Call recording:\s*(.+)/);
          if (urlMatch) {
            recordingUrl = urlMatch[1].trim();
          }
          continue;
        }
        
        // Check for transcript section
        if (line.includes('Transcript:')) {
          isInRecordingSection = false;
          isInTranscriptSection = true;
          continue;
        }
        
        // Collect recording URL (if not already found)
        if (isInRecordingSection && !recordingUrl && line) {
          recordingUrl = line;
          continue;
        }
        
        // Collect transcript content
        if (isInTranscriptSection) {
          if (transcript) {
            transcript += '\n' + lines[i]; // Keep original formatting
          } else {
            transcript = lines[i];
          }
          continue;
        }
        
        // Collect original content (before recording section)
        if (!isInRecordingSection && !isInTranscriptSection && 
            !line.includes('Call recording:') && !line.includes('Transcript:')) {
          if (originalContent) {
            originalContent += '\n' + lines[i];
          } else {
            originalContent = lines[i];
          }
        }
      }
      
      return {
        originalContent: originalContent.trim(),
        recordingUrl: recordingUrl.trim(),
        transcript: transcript.trim()
      };
      
    } catch (error) {
      console.error('Error extracting recording and transcript:', error.message);
      return {
        originalContent: description,
        recordingUrl: '',
        transcript: ''
      };
    }
  }

  /**
   * Format meeting description with the requested format
   */
  formatMeetingDescription(originalContent, recordingUrl, transcript) {
    let formattedDescription = '';
    
    // Add original content if it exists
    if (originalContent) {
      formattedDescription = originalContent + '\n\n';
    }
    
    // Add the formatted recording and transcript section
    formattedDescription += '********************\n';
    formattedDescription += `Call recording: ${recordingUrl}\n\n`;
    formattedDescription += 'Transcript:\n';
    formattedDescription += transcript;
    formattedDescription += '\n********************';
    
    return formattedDescription;
  }

  /**
   * Update a single meeting with formatted description
   */
  async updateMeetingDescription(meeting) {
    try {
      const description = meeting.properties.hs_meeting_body;
      const meetingTitle = meeting.properties.hs_meeting_title;
      
      console.log(`📝 Processing: "${meetingTitle}"`);
      
      // Check if already correctly formatted
      if (this.isMeetingAlreadyFormatted(description)) {
        console.log(`   ⏭️ Already correctly formatted, skipping`);
        return { success: true, skipped: true };
      }
      
      // Extract components from current description
      const { originalContent, recordingUrl, transcript } = this.extractRecordingAndTranscript(description);
      
      if (!recordingUrl) {
        console.log(`   ⚠️ No recording URL found, skipping`);
        return { success: false, error: 'No recording URL found' };
      }
      
      // Format the description
      const newDescription = this.formatMeetingDescription(originalContent, recordingUrl, transcript);
      
      // Update the meeting
      await this.hubspot.client.patch(`/crm/v3/objects/meetings/${meeting.id}`, {
        properties: {
          hs_meeting_body: newDescription
        }
      });
      
      console.log(`   ✅ Successfully formatted description`);
      return { success: true, skipped: false };
      
    } catch (error) {
      console.error(`   ❌ Error updating meeting:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Main processing function
   */
  async process() {
    console.log('📝 Starting meeting description formatting...\n');
    console.log('='.repeat(60));
    
    try {
      // Step 1: Get all meetings with recordings
      console.log('\n📥 STEP 1: Fetching meetings with recordings\n');
      
      const meetings = await this.getMeetingsWithRecordings();
      
      if (meetings.length === 0) {
        console.log('✅ No meetings with recordings found!');
        return;
      }
      
      // Step 2: Process each meeting
      console.log(`\n📝 STEP 2: Formatting ${meetings.length} meeting descriptions\n`);
      
      let successCount = 0;
      let errorCount = 0;
      let skippedCount = 0;
      const errors = [];
      
      for (let i = 0; i < meetings.length; i++) {
        const meeting = meetings[i];
        console.log(`[${i + 1}/${meetings.length}] Processing meeting...`);
        
        const result = await this.updateMeetingDescription(meeting);
        
        if (result.success) {
          if (result.skipped) {
            skippedCount++;
          } else {
            successCount++;
          }
        } else {
          errorCount++;
          errors.push({
            meetingId: meeting.id,
            title: meeting.properties.hs_meeting_title,
            error: result.error
          });
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // Summary
      console.log(`\n🎉 DESCRIPTION FORMATTING COMPLETE!`);
      console.log(`✅ Successfully formatted: ${successCount} meetings`);
      console.log(`⏭️ Already formatted: ${skippedCount} meetings`);
      console.log(`❌ Errors: ${errorCount} meetings`);
      
      if (errors.length > 0) {
        console.log('\n📋 Errors encountered:');
        errors.forEach(error => {
          console.log(`   - ${error.title}: ${error.error}`);
        });
      }
      
    } catch (error) {
      console.error('\n💥 Critical error during description formatting:', error.message);
      throw error;
    }
  }
}

// Run the script
if (require.main === module) {
  const formatter = new MeetingDescriptionFormatter();
  formatter.process().then(() => {
    console.log('\n🎉 Description formatting completed successfully!');
    process.exit(0);
  }).catch(error => {
    console.error('Description formatting failed:', error);
    process.exit(1);
  });
}

module.exports = MeetingDescriptionFormatter;