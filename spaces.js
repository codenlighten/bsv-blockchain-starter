import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

// Ensure required environment variables are set
if (!process.env.SPACES_KEY || !process.env.SPACES_SECRET || !process.env.SPACES_ENDPOINT || !process.env.SPACES_BUCKET) {
    throw new Error("Missing required environment variables for DigitalOcean Spaces.");
}

// Initialize S3 Client for DigitalOcean Spaces
const s3Client = new S3Client({
    forcePathStyle: false, // Required for DigitalOcean Spaces
    endpoint: process.env.SPACES_ENDPOINT, // e.g., "https://nyc3.digitaloceanspaces.com"
    region: "us-east-1", // A placeholder, as endpoint is the key
    credentials: {
        accessKeyId: process.env.SPACES_KEY,
        secretAccessKey: process.env.SPACES_SECRET,
    },
});

/**
 * Uploads a music file to DigitalOcean Spaces with organized folder structure.
 * @param {Buffer} fileBuffer - The file content as a buffer.
 * @param {string} fileName - The original file name.
 * @param {string} mimeType - The MIME type of the file.
 * @param {Object} metadata - Music metadata for organizing uploads.
 * @param {string} metadata.type - Type: 'master', 'stem', 'artwork', 'video', 'demo'
 * @param {string} metadata.artistId - Artist identifier
 * @param {string} metadata.songId - Song identifier (optional)
 * @param {string} metadata.albumId - Album identifier (optional)
 * @returns {Promise<Object>} Upload result with URL, path, and metadata.
 */
const uploadMusicFile = async (fileBuffer, fileName, mimeType, metadata = {}) => {
    const bucketName = process.env.SPACES_BUCKET;
    
    // Generate file hash for integrity checking
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    
    // Create organized folder structure
    const { type = 'misc', artistId, songId, albumId } = metadata;
    const fileExtension = path.extname(fileName);
    const baseName = path.basename(fileName, fileExtension);
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Organized path: /music/{type}/{artistId}/{songId-or-albumId}/{filename}
    let organizePath = `music/${type}`;
    if (artistId) organizePath += `/${artistId}`;
    if (songId) organizePath += `/${songId}`;
    else if (albumId) organizePath += `/${albumId}`;
    
    // Generate unique filename to prevent collisions
    const uniqueId = crypto.randomBytes(8).toString('hex');
    const organizedFileName = `${organizePath}/${baseName}-${uniqueId}${fileExtension}`;

    const uploadParams = {
        Bucket: bucketName,
        Key: organizedFileName,
        Body: fileBuffer,
        ContentType: mimeType,
        ACL: type === 'artwork' ? 'public-read' : 'private', // Artwork public, audio private
        Metadata: {
            'original-name': fileName,
            'file-hash': fileHash,
            'upload-date': timestamp,
            'artist-id': artistId || 'unknown',
            'song-id': songId || '',
            'album-id': albumId || '',
            'file-type': type
        }
    };

    try {
        const result = await s3Client.send(new PutObjectCommand(uploadParams));
        
        // Generate URLs
        const publicUrl = type === 'artwork' 
            ? `${process.env.SPACES_ENDPOINT}/${bucketName}/${organizedFileName}`
            : null;
            
        console.log(`Successfully uploaded ${type} file: ${organizedFileName}`);
        
        return {
            success: true,
            path: organizedFileName,
            publicUrl,
            fileHash,
            size: fileBuffer.length,
            mimeType,
            metadata: {
                originalName: fileName,
                type,
                artistId,
                songId,
                albumId,
                uploadDate: new Date().toISOString()
            }
        };
    } catch (err) {
        console.error("Error uploading music file to Spaces:", err);
        throw new Error(`Failed to upload ${type} file: ${err.message}`);
    }
};

/**
 * Legacy upload function for backward compatibility
 */
const uploadFileToSpaces = async (fileBuffer, fileName, mimeType) => {
    return uploadMusicFile(fileBuffer, fileName, mimeType, { type: 'misc' });
};

/**
 * Generates a signed URL for private audio file access.
 * @param {string} filePath - The file path/key in Spaces.
 * @param {number} expiresIn - URL expiration time in seconds (default: 1 hour).
 * @returns {Promise<string>} Signed URL for temporary access.
 */
const generateSignedUrl = async (filePath, expiresIn = 3600) => {
    const bucketName = process.env.SPACES_BUCKET;
    
    const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: filePath,
    });
    
    try {
        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
        console.log(`Generated signed URL for: ${filePath}`);
        return signedUrl;
    } catch (err) {
        console.error("Error generating signed URL:", err);
        throw new Error("Failed to generate signed URL.");
    }
};

/**
 * Lists files for a specific artist or song.
 * @param {string} prefix - The folder prefix to search (e.g., 'music/master/artist-123').
 * @returns {Promise<Array>} Array of file objects with metadata.
 */
const listMusicFiles = async (prefix) => {
    const bucketName = process.env.SPACES_BUCKET;
    
    const listParams = {
        Bucket: bucketName,
        Prefix: prefix,
        MaxKeys: 1000
    };
    
    try {
        const result = await s3Client.send(new ListObjectsV2Command(listParams));
        
        if (!result.Contents) {
            return [];
        }
        
        return result.Contents.map(item => ({
            key: item.Key,
            size: item.Size,
            lastModified: item.LastModified,
            url: `${process.env.SPACES_ENDPOINT}/${bucketName}/${item.Key}`
        }));
    } catch (err) {
        console.error("Error listing music files:", err);
        throw new Error("Failed to list music files.");
    }
};

/**
 * Deletes a file from DigitalOcean Spaces.
 * @param {string} fileName - The file name/key to delete.
 * @returns {Promise<boolean>} True if deletion was successful.
 */
const deleteFileFromSpaces = async (fileName) => {
    const bucketName = process.env.SPACES_BUCKET;
    
    const deleteParams = {
        Bucket: bucketName,
        Key: fileName,
    };
    
    try {
        await s3Client.send(new DeleteObjectCommand(deleteParams));
        console.log(`Successfully deleted file: ${fileName}`);
        return true;
    } catch (err) {
        console.error("Error deleting file from Spaces:", err);
        throw new Error("Failed to delete file.");
    }
};

/**
 * Deletes multiple files for cleanup operations.
 * @param {Array<string>} filePaths - Array of file paths to delete.
 * @returns {Promise<Object>} Result with success/failure counts.
 */
const deleteMultipleFiles = async (filePaths) => {
    const results = {
        successful: 0,
        failed: 0,
        errors: []
    };
    
    for (const filePath of filePaths) {
        try {
            await deleteFileFromSpaces(filePath);
            results.successful++;
        } catch (error) {
            results.failed++;
            results.errors.push({ filePath, error: error.message });
        }
    }
    
    return results;
};

// Music-specific operations
const musicOps = {
    // File Management
    uploadMusicFile,
    generateSignedUrl,
    listMusicFiles,
    deleteMultipleFiles,
    
    // Artist Operations
    uploadArtistArtwork: (buffer, fileName, artistId) => 
        uploadMusicFile(buffer, fileName, 'image/jpeg', { type: 'artwork', artistId }),
    
    uploadSongMaster: (buffer, fileName, artistId, songId) => 
        uploadMusicFile(buffer, fileName, 'audio/wav', { type: 'master', artistId, songId }),
    
    uploadSongStem: (buffer, fileName, artistId, songId) => 
        uploadMusicFile(buffer, fileName, 'audio/wav', { type: 'stem', artistId, songId }),
    
    uploadAlbumArtwork: (buffer, fileName, artistId, albumId) => 
        uploadMusicFile(buffer, fileName, 'image/jpeg', { type: 'artwork', artistId, albumId }),
    
    // Utility Functions
    getArtistFiles: (artistId) => listMusicFiles(`music/master/${artistId}`),
    getSongFiles: (artistId, songId) => listMusicFiles(`music/master/${artistId}/${songId}`),
    getArtistArtwork: (artistId) => listMusicFiles(`music/artwork/${artistId}`),
    
    // Access Control
    getPrivateAudioUrl: (filePath) => generateSignedUrl(filePath, 3600), // 1 hour access
    getStreamingUrl: (filePath) => generateSignedUrl(filePath, 86400), // 24 hour access for streaming
};

// Legacy operations for backward compatibility
const spacesOps = {
    uploadFile: uploadFileToSpaces,
    deleteFile: deleteFileFromSpaces,
    ...musicOps
};

export default spacesOps;