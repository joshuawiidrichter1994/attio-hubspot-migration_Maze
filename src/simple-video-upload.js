const HubSpotAPI = require('./utils/hubspot-api');
const fs = require('fs');
const path = require('path');

class SimpleVideoUploader {
  constructor() {
    this.hubspot = new HubSpotAPI();
    this.successCount = 0;
    this.errorCount = 0;
  }

  /**
   * Get all video files from directory
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

    console.log(`📹 Found ${videoFiles.length} total video files`);
    return videoFiles;
  }

  /**
   * Check which videos are already uploaded by looking for existing files in HubSpot
   */
  async getUploadedVideoNames() {
    console.log('🔍 Checking which videos are already uploaded...');
    
    try {
      const response = await this.hubspot.client.get('/files/v3/files', {
        params: {
          limit: 500
        }
      });

      const uploadedNames = new Set();
      
      if (response.data && response.data.results) {
        response.data.results.forEach(file => {
          if (file.name && file.name.endsWith('.mp4')) {
            uploadedNames.add(file.name);
          }
        });
      }

      console.log(`📁 Found ${uploadedNames.size} videos already uploaded to HubSpot`);
      return uploadedNames;
      
    } catch (error) {
      console.error('❌ Error checking uploaded videos:', error.message);
      return new Set(); // Return empty set if check fails
    }
  }

  /**
   * Upload videos that haven't been uploaded yet
   */
  async uploadNewVideos() {
    console.log('🚀 Starting simple video upload process...\n');
    
    try {
      // Get all video files
      const allVideoFiles = this.getVideoFiles();
      
      // Check which are already uploaded
      const uploadedNames = await this.getUploadedVideoNames();
      
      // Filter to only new videos
      const newVideos = allVideoFiles.filter(video => !uploadedNames.has(video.filename));
      
      console.log(`\n🎯 Found ${newVideos.length} videos that need uploading:`);
      newVideos.forEach((video, i) => {
        console.log(`   ${i + 1}. ${video.filename} (${video.sizeMB} MB)`);
      });
      
      if (newVideos.length === 0) {
        console.log('\n✅ All videos are already uploaded!');
        return;
      }
      
      console.log(`\n📤 Starting upload of ${newVideos.length} videos...\n`);
      
      // Upload each new video
      for (let i = 0; i < newVideos.length; i++) {
        const video = newVideos[i];
        
        console.log(`[${i + 1}/${newVideos.length}] Uploading ${video.filename}...`);
        console.log(`   📊 Size: ${video.sizeMB} MB`);
        
        try {
          const uploadResult = await this.hubspot.uploadFile(video.fullPath, video.filename);
          
          if (uploadResult && uploadResult.id) {
            console.log(`   ✅ Uploaded! File ID: ${uploadResult.id}`);
            console.log(`   🔗 URL: https://api-eu1.hubspot.com/filemanager/api/v2/files/${uploadResult.id}/signed-url-redirect?portalId=147152397`);
            this.successCount++;
          } else {
            throw new Error('Upload returned no file ID');
          }
          
          // Rate limiting - wait 2 seconds between uploads
          if (i < newVideos.length - 1) {
            console.log('   ⏱️ Waiting 2 seconds...\n');
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
        } catch (error) {
          this.errorCount++;
          console.error(`   ❌ Error uploading ${video.filename}:`, error.message);
          continue;
        }
      }
      
      // Summary
      console.log('\n' + '='.repeat(60));
      console.log('📊 UPLOAD SUMMARY');
      console.log('='.repeat(60));
      console.log(`✅ Successfully uploaded: ${this.successCount} videos`);
      console.log(`❌ Failed uploads: ${this.errorCount} videos`);
      console.log(`📁 Total new videos: ${newVideos.length}`);
      console.log('='.repeat(60));
      
      if (this.successCount > 0) {
        console.log(`\n🎉 ${this.successCount} videos uploaded successfully!`);
        console.log('✨ Ready for step 2: Associate videos to meetings');
      }

    } catch (error) {
      console.error('\n💥 Upload process failed:', error.message);
      throw error;
    }
  }
}

// Main execution
async function main() {
  const uploader = new SimpleVideoUploader();
  
  try {
    await uploader.uploadNewVideos();
  } catch (error) {
    console.error('\n💥 Process failed:', error.message);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = SimpleVideoUploader;