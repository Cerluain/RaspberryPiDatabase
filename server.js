// Required modules
const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

// Initialize express
const app = express();
const PORT = 3000;

// Set up middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

// Ensure directories exist
const uploadsDir = path.join(__dirname, 'uploads');
const metadataDir = path.join(__dirname, 'metadata');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
    console.log('Created uploads directory');
}

if (!fs.existsSync(metadataDir)) {
    fs.mkdirSync(metadataDir);
    console.log('Created metadata directory');
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function(req, file, cb) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const uniqueId = uuidv4().slice(0, 8);
        const extension = path.extname(file.originalname);
        cb(null, `${timestamp}-${uniqueId}${extension}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Routes
app.get('/', (req, res) => {
    console.log('Serving index.html');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle text submissions
app.post('/submit', (req, res) => {
    console.log('Received text submission request');
    const { text, metadata } = req.body;
    
    if (!text || text.trim() === '') {
        console.log('Empty submission rejected');
        return res.status(400).json({ success: false, message: 'Text is required' });
    }
    
    // Generate unique filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const uniqueId = uuidv4().slice(0, 8);
    const filename = `${timestamp}-${uniqueId}.txt`;
    const filepath = path.join(uploadsDir, filename);
    
    // Write text to file
    fs.writeFile(filepath, text, (err) => {
        if (err) {
            console.error('Error saving submission:', err);
            return res.status(500).json({ success: false, message: 'Failed to save submission' });
        }
        
        // Save metadata if provided
        if (metadata) {
            const metadataFilepath = path.join(metadataDir, `${filename}.json`);
            fs.writeFile(metadataFilepath, JSON.stringify(metadata, null, 2), (err) => {
                if (err) {
                    console.error('Error saving metadata:', err);
                    // Continue despite metadata error
                }
            });
        }
        
        console.log(`Text submission saved: ${filename}`);
        res.json({ success: true, message: 'Text submitted successfully', filename });
    });
});

// Handle file uploads with metadata
app.post('/upload', upload.single('file'), (req, res) => {
    console.log('Received file upload request');
    
    if (!req.file) {
        console.log('No file uploaded');
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    
    // Extract metadata from form
    let metadata = {};
    if (req.body.metadata) {
        try {
            metadata = JSON.parse(req.body.metadata);
        } catch (error) {
            console.error('Error parsing metadata JSON:', error);
            // Continue despite metadata parsing error
        }
    }
    
    // Add file information to metadata
    metadata.originalFilename = req.file.originalname;
    metadata.mimeType = req.file.mimetype;
    metadata.size = req.file.size;
    metadata.uploadDate = new Date().toISOString();
    
    // Save metadata
    const metadataFilepath = path.join(metadataDir, `${req.file.filename}.json`);
    fs.writeFile(metadataFilepath, JSON.stringify(metadata, null, 2), (err) => {
        if (err) {
            console.error('Error saving metadata:', err);
            // Continue despite metadata error
        }
    });
    
    console.log(`File uploaded: ${req.file.filename}`);
    res.json({ 
        success: true, 
        message: 'File uploaded successfully', 
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size
    });
});

// Get all uploads with metadata
app.get('/uploads', (req, res) => {
    console.log('Fetching uploads list');
    fs.readdir(uploadsDir, (err, files) => {
        if (err) {
            console.error('Error reading uploads directory:', err);
            return res.status(500).json({ success: false, message: 'Failed to fetch uploads' });
        }
        
        // Fetch metadata for each file
        const uploadPromises = files.map(filename => {
            return new Promise((resolve) => {
                const metadataFilepath = path.join(metadataDir, `${filename}.json`);
                fs.readFile(metadataFilepath, 'utf8', (err, data) => {
                    if (err) {
                        // If metadata file doesn't exist, just return the filename
                        resolve({ filename });
                    } else {
                        try {
                            const metadata = JSON.parse(data);
                            resolve({ filename, metadata });
                        } catch (error) {
                            // If metadata is invalid JSON, just return the filename
                            resolve({ filename });
                        }
                    }
                });
            });
        });
        
        Promise.all(uploadPromises)
            .then(uploads => {
                console.log(`Found ${uploads.length} uploads`);
                res.json({ success: true, uploads });
            })
            .catch(error => {
                console.error('Error processing uploads:', error);
                res.status(500).json({ success: false, message: 'Error processing uploads' });
            });
    });
});

// Get file metadata
app.get('/metadata/:filename', (req, res) => {
    const filename = req.params.filename;
    console.log(`Fetching metadata for: ${filename}`);
    
    // Sanitize filename to prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        console.error('Invalid filename requested:', filename);
        return res.status(400).json({ success: false, message: 'Invalid filename' });
    }
    
    const metadataFilepath = path.join(metadataDir, `${filename}.json`);
    
    fs.readFile(metadataFilepath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading metadata file:', err);
            return res.status(404).json({ success: false, message: 'Metadata not found' });
        }
        
        try {
            const metadata = JSON.parse(data);
            res.json({ success: true, filename, metadata });
        } catch (error) {
            console.error('Error parsing metadata JSON:', error);
            res.status(500).json({ success: false, message: 'Invalid metadata format' });
        }
    });
});

// Update file metadata
app.put('/metadata/:filename', (req, res) => {
    const filename = req.params.filename;
    const metadata = req.body;
    
    console.log(`Updating metadata for: ${filename}`);
    
    // Sanitize filename to prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        console.error('Invalid filename requested:', filename);
        return res.status(400).json({ success: false, message: 'Invalid filename' });
    }
    
    const metadataFilepath = path.join(metadataDir, `${filename}.json`);
    
    // First check if file exists
    if (!fs.existsSync(path.join(uploadsDir, filename))) {
        return res.status(404).json({ success: false, message: 'File not found' });
    }
    
    // Read existing metadata first
    fs.readFile(metadataFilepath, 'utf8', (err, data) => {
        let existingMetadata = {};
        
        // If metadata file exists, parse it
        if (!err) {
            try {
                existingMetadata = JSON.parse(data);
            } catch (parseError) {
                console.error('Error parsing existing metadata:', parseError);
                // Continue with empty metadata if parsing fails
            }
        }
        
        // Merge existing metadata with new metadata
        const updatedMetadata = { ...existingMetadata, ...metadata };
        
        // Preserve certain system fields
        if (existingMetadata.originalFilename) {
            updatedMetadata.originalFilename = existingMetadata.originalFilename;
        }
        if (existingMetadata.uploadDate) {
            updatedMetadata.uploadDate = existingMetadata.uploadDate;
        }
        updatedMetadata.lastModified = new Date().toISOString();
        
        // Write updated metadata
        fs.writeFile(metadataFilepath, JSON.stringify(updatedMetadata, null, 2), (writeErr) => {
            if (writeErr) {
                console.error('Error writing metadata:', writeErr);
                return res.status(500).json({ success: false, message: 'Failed to update metadata' });
            }
            
            res.json({ success: true, message: 'Metadata updated successfully', metadata: updatedMetadata });
        });
    });
});

// Get file content
app.get('/uploads/:filename', (req, res) => {
    const filename = req.params.filename;
    console.log(`Fetching upload: ${filename}`);
    
    // Sanitize filename to prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        console.error('Invalid filename requested:', filename);
        return res.status(400).json({ success: false, message: 'Invalid filename' });
    }
    
    const filepath = path.join(uploadsDir, filename);
    
    // Send the file
    res.sendFile(filepath, (err) => {
        if (err) {
            console.error('Error sending file:', err);
            return res.status(404).json({ success: false, message: 'File not found' });
        }
    });
});

// Download a specific file
app.get('/download/:filename', (req, res) => {
    const filename = req.params.filename;
    console.log(`Download requested: ${filename}`);
    
    // Sanitize filename to prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        console.error('Invalid filename requested:', filename);
        return res.status(400).json({ success: false, message: 'Invalid filename' });
    }
    
    const filepath = path.join(uploadsDir, filename);
    
    // Check if file exists
    if (!fs.existsSync(filepath)) {
        console.error('File not found:', filepath);
        return res.status(404).json({ success: false, message: 'File not found' });
    }
    
    // Get metadata to determine original filename
    const metadataFilepath = path.join(metadataDir, `${filename}.json`);
    fs.readFile(metadataFilepath, 'utf8', (err, data) => {
        let downloadFilename = filename; // Default to stored filename
        
        if (!err) {
            try {
                const metadata = JSON.parse(data);
                // Use original filename for download if available
                if (metadata.originalFilename) {
                    downloadFilename = metadata.originalFilename;
                }
            } catch (error) {
                console.error('Error parsing metadata for download:', error);
                // Continue with default filename
            }
        }
        
        // Send file as download
        res.download(filepath, downloadFilename, (err) => {
            if (err) {
                console.error('Error downloading file:', err);
                return res.status(500).json({ success: false, message: 'Error downloading file' });
            }
        });
    });
});

// Search uploads by metadata
app.get('/search', (req, res) => {
    const query = req.query.q?.toLowerCase();
    const field = req.query.field;
    
    console.log(`Searching uploads with query: ${query}, field: ${field}`);
    
    if (!query) {
        return res.status(400).json({ success: false, message: 'Search query is required' });
    }
    
    fs.readdir(metadataDir, (err, files) => {
        if (err) {
            console.error('Error reading metadata directory:', err);
            return res.status(500).json({ success: false, message: 'Failed to search uploads' });
        }
        
        const searchPromises = files.map(metadataFile => {
            return new Promise((resolve) => {
                const metadataFilepath = path.join(metadataDir, metadataFile);
                fs.readFile(metadataFilepath, 'utf8', (err, data) => {
                    if (err) {
                        resolve(null);
                        return;
                    }
                    
                    try {
                        const metadata = JSON.parse(data);
                        const filename = metadataFile.slice(0, -5); // Remove .json extension
                        
                        // Skip if the file doesn't exist anymore
                        if (!fs.existsSync(path.join(uploadsDir, filename))) {
                            resolve(null);
                            return;
                        }
                        
                        // Search in specific field if provided
                        if (field) {
                            if (metadata[field] && 
                                String(metadata[field]).toLowerCase().includes(query)) {
                                resolve({ filename, metadata });
                            } else {
                                resolve(null);
                            }
                            return;
                        }
                        
                        // Search in all fields
                        const matchFound = Object.values(metadata).some(value => {
                            return value && String(value).toLowerCase().includes(query);
                        });
                        
                        if (matchFound) {
                            resolve({ filename, metadata });
                        } else {
                            resolve(null);
                        }
                    } catch (error) {
                        console.error('Error parsing metadata JSON during search:', error);
                        resolve(null);
                    }
                });
            });
        });
        
        Promise.all(searchPromises)
            .then(results => {
                // Filter out null results
                const matches = results.filter(result => result !== null);
                console.log(`Found ${matches.length} matches for search query`);
                res.json({ success: true, results: matches });
            })
            .catch(error => {
                console.error('Error processing search:', error);
                res.status(500).json({ success: false, message: 'Error processing search' });
            });
    });
});

// Error handling for JSON parsing
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        console.error('JSON parsing error:', err);
        return res.status(400).json({ success: false, message: 'Invalid JSON' });
    }
    next();
});

// Handle 404 errors
app.use((req, res) => {
    console.log(`404: ${req.method} ${req.url}`);
    res.status(404).json({ success: false, message: 'Endpoint not found' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
    console.log(`Connect from other devices on your network using your local IP address`);
    console.log(`For example: http://192.168.x.x:${PORT}`);
    console.log(`Files will be stored in: ${uploadsDir}`);
    console.log(`Metadata will be stored in: ${metadataDir}`);
});