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

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
    console.log('Created uploads directory');
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
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Routes
app.get('/', (req, res) => {
    console.log('Serving index.html');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle text submissions (keeping original functionality)
app.post('/submit', (req, res) => {
    console.log('Received text submission request');
    const { text } = req.body;
    
    if (!text || text.trim() === '') {
        console.log('Empty submission rejected');
        return res.status(400).json({ success: false, message: 'Text is required' });
    }
    
    // Generate unique filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}-${uuidv4().slice(0, 8)}.txt`;
    const filepath = path.join(uploadsDir, filename);
    
    // Write text to file
    fs.writeFile(filepath, text, (err) => {
        if (err) {
            console.error('Error saving submission:', err);
            return res.status(500).json({ success: false, message: 'Failed to save submission' });
        }
        
        console.log(`Text submission saved: ${filename}`);
        res.json({ success: true, message: 'Text submitted successfully', filename });
    });
});

// Handle file uploads
app.post('/upload', upload.single('file'), (req, res) => {
    console.log('Received file upload request');
    
    if (!req.file) {
        console.log('No file uploaded');
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    
    console.log(`File uploaded: ${req.file.filename}`);
    res.json({ 
        success: true, 
        message: 'File uploaded successfully', 
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size
    });
});

// Get all uploads
app.get('/uploads', (req, res) => {
    console.log('Fetching uploads list');
    fs.readdir(uploadsDir, (err, files) => {
        if (err) {
            console.error('Error reading uploads directory:', err);
            return res.status(500).json({ success: false, message: 'Failed to fetch uploads' });
        }
        
        console.log(`Found ${files.length} uploads`);
        res.json({ success: true, uploads: files });
    });
});

// Get content of a specific upload
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
    
    // Send file as download
    res.download(filepath, (err) => {
        if (err) {
            console.error('Error downloading file:', err);
            return res.status(500).json({ success: false, message: 'Error downloading file' });
        }
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
});