const HubSpotAPI = require('./utils/hubspot-api');
const fs = require('fs');
const path = require('path');

class VideoUploader {
  constructor() {
    this.hubspot = new HubSpotAPI();
    this.processedVideosPath = path.join(__dirname, '..', 'data', 'exports', 'comprehensive_video_results_2025-12-08T10-20-32-386Z.json');
    this.processedVideos = new Map();
    this.uploadResults = new Map();
    this.successCount = 0;
    this.errorCount = 0;
  }

  /**
   * Load processed videos data
   */
  loadProcessedVideos() {
    try {
      if (fs.existsSync(this.processedVideosPath)) {
        const data = JSON.parse(fs.readFileSync(this.processedVideosPath, 'utf8'));
        
        // Convert array to Map for easy lookup by filename
        for (const result of data) {
          if (result.videoFile && result.hubspotMeetingId) {
            this.processedVideos.set(result.videoFile, {
              hubspotMeetingId: result.hubspotMeetingId,
              attioMeetingId: result.attioMeetingId,
              attioCallId: result.attioCallId,
              action: result.action,
              success: result.success
            });
          }
        }
        
        console.log(`📂 Loaded ${this.processedVideos.size} processed video records`);
      } else {
        console.log('⚠️ No processed videos file found');
      }
    } catch (error) {
      console.error('❌ Error loading processed videos:', error.message);
    }
  }

  /**
   * Get all video files from the videos directory
   */
  getVideoFiles() {
    const videosDir = path.join(__dirname, '..', 'videos');
    
    if (!fs.existsSync(videosDir)) {
      throw new Error(`Videos directory not found: ${videosDir}`);
    }

    const files = fs.readdirSync(videosDir);
    const videoFiles = files
      .filter(file => file.endsWith('.mp4'))
      .map(filename => {
        const fullPath = path.join(videosDir, filename);
        const stats = fs.statSync(fullPath);
        
        return {
          filename,
          fullPath,
          size: stats.size,
          sizeMB: (stats.size / (1024 * 1024)).toFixed(2)
        };
      });

    console.log(`📹 Found ${videoFiles.length} video files`);
    return videoFiles;
  }

  /**
   * Check which videos need uploading
   */
  async identifyVideosNeedingUpload(videoFiles) {
    console.log('\n🔍 Identifying videos that need uploading...\n');
    
    // Get all meetings to check which already have video links
    const allMeetings = await this.getAllMeetings();
    console.log(`📊 Checking against ${allMeetings.length} HubSpot meetings\n`);

    const videosNeedingUpload = [];

    for (const videoFile of videoFiles) {
      // Check if this video was processed and has a meeting
      const processedResult = this.processedVideos.get(videoFile.filename);
      
      if (processedResult && processedResult.hubspotMeetingId) {
        // Find the meeting in HubSpot
        const meeting = allMeetings.find(m => m.id === processedResult.hubspotMeetingId);
        
        if (meeting) {
          const meetingBody = meeting.properties.hs_meeting_body || '';
          
          // Check if meeting has a real video link (not placeholder)
          const hasRealVideoLink = meetingBody.includes('https://api-eu1.hubspot.com/filemanager/api/v2/files/') 
                                   && !meetingBody.includes('placeholder-url-');
          
          if (!hasRealVideoLink) {
            videosNeedingUpload.push({
              ...videoFile,
              meetingId: processedResult.hubspotMeetingId,
              processedResult,
              meetingTitle: meeting.properties.hs_meeting_title || 'Untitled Meeting'
            });
            console.log(`   📤 Needs upload: ${videoFile.filename} → Meeting ${processedResult.hubspotMeetingId}`);
          } else {
            console.log(`   ✅ Already uploaded: ${videoFile.filename}`);
          }
        } else {
          console.log(`   ❓ Meeting not found for: ${videoFile.filename}`);
        }
      } else {
        console.log(`   ❓ Unprocessed video: ${videoFile.filename}`);
      }
    }

    console.log(`\n🎯 Found ${videosNeedingUpload.length} videos that need uploading\n`);
    return videosNeedingUpload;
  }

  /**
   * Get all meetings from HubSpot
   */
  async getAllMeetings() {
    const meetings = [];
    let after = undefined;

    do {
      const params = {
        limit: 100,
        properties: ['hs_meeting_title', 'hs_meeting_body'].join(','),
        ...(after && { after })
      };

      const response = await this.hubspot.client.get('/crm/v3/objects/meetings', { params });
      meetings.push(...response.data.results);
      after = response.data.paging?.next?.after;

    } while (after);

    return meetings;
  }

  /**
   * Upload videos to HubSpot File Manager
   */
  async uploadVideos(videosNeedingUpload) {
    console.log(`📤 Starting upload of ${videosNeedingUpload.length} videos...\n`);
    
    for (let i = 0; i < videosNeedingUpload.length; i++) {
      const videoData = videosNeedingUpload[i];
      console.log(`[${i + 1}/${videosNeedingUpload.length}] Uploading ${videoData.filename}...`);
      console.log(`   Meeting: ${videoData.meetingTitle}`);
      console.log(`   Size: ${videoData.sizeMB} MB`);
      
      try {
        // Upload video to HubSpot File Manager
        const uploadResult = await this.hubspot.uploadFile(videoData.fullPath, videoData.filename);
        
        if (uploadResult && uploadResult.id) {
          console.log(`   ✅ Uploaded successfully! File ID: ${uploadResult.id}`);
          console.log(`   📁 File URL: https://api-eu1.hubspot.com/filemanager/api/v2/files/${uploadResult.id}/signed-url-redirect?portalId=147152397`);
          
          this.uploadResults.set(videoData.filename, {
            fileId: uploadResult.id,
            meetingId: videoData.meetingId,
            uploadedAt: new Date().toISOString(),
            fileName: videoData.filename,
            fileSize: videoData.size
          });
          
          this.successCount++;
          
        } else {
          throw new Error('Upload returned no file ID');
        }
        
        // Rate limiting - wait 2 seconds between uploads
        if (i < videosNeedingUpload.length - 1) {
          console.log('   ⏱️ Waiting 2 seconds before next upload...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (error) {
        this.errorCount++;
        console.error(`   ❌ Error uploading ${videoData.filename}:`, error.message);
        
        // Continue with next video even if this one fails
        continue;
      }
      
      console.log(''); // Empty line for readability
    }
  }

  /**
   * Save upload results
   */
  saveUploadResults() {
    try {
      const resultsPath = path.join(__dirname, '..', 'data', 'upload-results.json');
      const results = Object.fromEntries(this.uploadResults);
      
      fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
      console.log(`💾 Saved upload results to ${resultsPath}`);
      
    } catch (error) {
      console.error('❌ Error saving upload results:', error.message);
    }
  }

  /**
   * Main upload process
   */
  async uploadAllNewVideos() {
    console.log('🚀 Starting video upload process...\n');
    
    try {
      // Load processed videos data
      this.loadProcessedVideos();
      
      // Get all video files
      const videoFiles = this.getVideoFiles();
      
      // Identify videos that need uploading
      const videosNeedingUpload = await this.identifyVideosNeedingUpload(videoFiles);
      
      if (videosNeedingUpload.length === 0) {
        console.log('🎉 All videos are already uploaded!');
        return;
      }
      
      // Upload the videos
      await this.uploadVideos(videosNeedingUpload);
      
      // Save results
      this.saveUploadResults();
      
      // Summary
      console.log('\n' + '='.repeat(60));
      console.log('📊 UPLOAD SUMMARY');
      console.log('='.repeat(60));
      console.log(`✅ Successfully uploaded: ${this.successCount} videos`);
      console.log(`❌ Failed uploads: ${this.errorCount} videos`);
      console.log(`📁 Total processed: ${videosNeedingUpload.length} videos`);
      console.log('='.repeat(60));
      
      if (this.successCount > 0) {
        console.log(`\n🎉 ${this.successCount} videos uploaded successfully to HubSpot!`);
        console.log('✨ Ready for the next step: associating videos to meetings');
      }

    } catch (error) {
      console.error('💥 Critical error during upload process:', error.message);
      throw error;
    }
  }
}

// Main execution
async function main() {
  const uploader = new VideoUploader();
  
  try {
    await uploader.uploadAllNewVideos();
  } catch (error) {
    console.error('\n💥 Upload process failed:', error.message);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = VideoUploader;