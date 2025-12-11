const HubSpotAPI = require('./utils/hubspot-api');
const fs = require('fs');
const path = require('path');

class FastVideoUploader {
  constructor() {
    this.hubspot = new HubSpotAPI();
    this.resultsPath = path.join(__dirname, '..', 'data', 'exports', 'comprehensive_video_results_2025-12-08T10-20-32-386Z.json');
    this.videoResults = [];
    this.successCount = 0;
    this.errorCount = 0;
  }

  /**
   * Load video results and identify videos needing upload
   */
  async loadAndAnalyzeVideos() {
    console.log('📂 Loading video processing results...\n');
    
    try {
      const data = JSON.parse(fs.readFileSync(this.resultsPath, 'utf8'));
      console.log(`Found ${data.length} processed videos\n`);

      // Filter videos that need uploading (have placeholder URLs)
      const videosNeedingUpload = data.filter(result => {
        if (!result.success || !result.hubspotMeetingId) {
          return false;
        }

        const meetingBody = result.matchDetails?.meeting?.properties?.hs_meeting_body || '';
        
        // Check if it has a placeholder URL (means video not uploaded yet)
        const hasPlaceholderUrl = meetingBody.includes('placeholder-url-');
        const hasRealUrl = meetingBody.includes('https://api-eu1.hubspot.com/filemanager/api/v2/files/');
        
        return hasPlaceholderUrl && !hasRealUrl;
      });

      console.log(`🎯 Found ${videosNeedingUpload.length} videos that need uploading:\n`);

      // Show which videos need uploading
      videosNeedingUpload.forEach((result, i) => {
        const meetingTitle = result.matchDetails?.meeting?.properties?.hs_meeting_title || 'Untitled';
        console.log(`   ${i + 1}. ${result.videoFile}`);
        console.log(`      → Meeting: ${meetingTitle.substring(0, 50)}...`);
        console.log(`      → HubSpot ID: ${result.hubspotMeetingId}\n`);
      });

      return videosNeedingUpload;

    } catch (error) {
      console.error('❌ Error loading video results:', error.message);
      throw error;
    }
  }

  /**
   * Upload videos to HubSpot File Manager
   */
  async uploadVideos(videosNeedingUpload) {
    if (videosNeedingUpload.length === 0) {
      console.log('✅ All videos are already uploaded!\n');
      return;
    }

    console.log(`📤 Starting upload of ${videosNeedingUpload.length} videos...\n`);
    
    const videosDir = path.join(__dirname, '..', 'videos');
    
    for (let i = 0; i < videosNeedingUpload.length; i++) {
      const result = videosNeedingUpload[i];
      const videoPath = path.join(videosDir, result.videoFile);
      
      console.log(`[${i + 1}/${videosNeedingUpload.length}] Uploading ${result.videoFile}...`);
      
      try {
        // Check if video file exists
        if (!fs.existsSync(videoPath)) {
          throw new Error(`Video file not found: ${videoPath}`);
        }

        const stats = fs.statSync(videoPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`   📊 Size: ${sizeMB} MB`);
        
        // Upload video to HubSpot File Manager
        const uploadResult = await this.hubspot.uploadFile(videoPath, result.videoFile);
        
        if (uploadResult && uploadResult.id) {
          console.log(`   ✅ Uploaded! File ID: ${uploadResult.id}`);
          console.log(`   🔗 URL: https://api-eu1.hubspot.com/filemanager/api/v2/files/${uploadResult.id}/signed-url-redirect?portalId=147152397`);
          
          // Store the result for the next step (associating with meeting)
          result.uploadedFileId = uploadResult.id;
          result.uploadedUrl = `https://api-eu1.hubspot.com/filemanager/api/v2/files/${uploadResult.id}/signed-url-redirect?portalId=147152397`;
          
          this.successCount++;
          
        } else {
          throw new Error('Upload returned no file ID');
        }
        
        // Rate limiting - wait 2 seconds between uploads
        if (i < videosNeedingUpload.length - 1) {
          console.log(`   ⏱️ Waiting 2 seconds...\n`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (error) {
        this.errorCount++;
        console.error(`   ❌ Error uploading ${result.videoFile}:`, error.message);
        continue;
      }
    }

    // Save upload results
    await this.saveUploadResults(videosNeedingUpload);
  }

  /**
   * Save upload results for next steps
   */
  async saveUploadResults(uploadedVideos) {
    try {
      const resultsPath = path.join(__dirname, '..', 'data', 'upload-results.json');
      
      const results = uploadedVideos
        .filter(v => v.uploadedFileId)
        .map(v => ({
          videoFile: v.videoFile,
          hubspotMeetingId: v.hubspotMeetingId,
          uploadedFileId: v.uploadedFileId,
          uploadedUrl: v.uploadedUrl,
          attioMeetingId: v.attioMeetingId,
          attioCallId: v.attioCallId,
          uploadedAt: new Date().toISOString()
        }));

      fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
      console.log(`\n💾 Saved ${results.length} upload results to ${resultsPath}`);
      
    } catch (error) {
      console.error('❌ Error saving upload results:', error.message);
    }
  }

  /**
   * Main upload process
   */
  async run() {
    console.log('🚀 Fast Video Upload Process\n');
    console.log('=' .repeat(50));
    
    try {
      // Load and analyze which videos need uploading
      const videosNeedingUpload = await this.loadAndAnalyzeVideos();
      
      // Upload the videos
      await this.uploadVideos(videosNeedingUpload);
      
      // Summary
      console.log('\n' + '='.repeat(60));
      console.log('📊 UPLOAD SUMMARY');
      console.log('='.repeat(60));
      console.log(`✅ Successfully uploaded: ${this.successCount} videos`);
      console.log(`❌ Failed uploads: ${this.errorCount} videos`);
      console.log(`📁 Total processed: ${videosNeedingUpload.length} videos`);
      console.log('='.repeat(60));
      
      if (this.successCount > 0) {
        console.log(`\n🎉 ${this.successCount} videos uploaded successfully!`);
        console.log('✨ Ready for step 2: Update meeting descriptions with video links');
      }

    } catch (error) {
      console.error('\n💥 Upload process failed:', error.message);
      throw error;
    }
  }
}

// Main execution
async function main() {
  const uploader = new FastVideoUploader();
  
  try {
    await uploader.run();
  } catch (error) {
    console.error('\n💥 Process failed:', error.message);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = FastVideoUploader;