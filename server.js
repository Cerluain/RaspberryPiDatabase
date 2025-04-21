// Required modules
const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid'); // For generating unique filenames

// Initialize express
const app = express();
const PORT = 3000;

// Set up middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public')); // Serve static files from 'public' folder

// Ensure submissions directory exists
const submissionsDir = path.join(__dirname, 'submissions');
if (!fs.existsSync(submissionsDir)) {
    fs.mkdirSync(submissionsDir);
    console.log('Created submissions directory');
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle text submissions
app.post('/submit', (req, res) => {
    const { text } = req.body;
    
    if (!text || text.trim() === '') {
        return res.status(400).json({ success: false, message: 'Text is required' });
    }
    
    // Generate unique filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}-${uuidv4().slice(0, 8)}.txt`;
    const filepath = path.join(submissionsDir, filename);
    
    // Write text to file
    fs.writeFile(filepath, text, (err) => {
        if (err) {
            console.error('Error saving submission:', err);
            return res.status(500).json({ success: false, message: 'Failed to save submission' });
        }
        
        console.log(`Submission saved: ${filename}`);
        res.json({ success: true, message: 'Text submitted successfully', filename });
    });
});

// Get all submissions
app.get('/submissions', (req, res) => {
    fs.readdir(submissionsDir, (err, files) => {
        if (err) {
            console.error('Error reading submissions directory:', err);
            return res.status(500).json({ success: false, message: 'Failed to fetch submissions' });
        }
        
        res.json({ success: true, submissions: files });
    });
});

// Get content of a specific submission
app.get('/submissions/:filename', (req, res) => {
    const filepath = path.join(submissionsDir, req.params.filename);
    
    fs.readFile(filepath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading file:', err);
            return res.status(404).json({ success: false, message: 'Submission not found' });
        }
        
        res.json({ success: true, filename: req.params.filename, content: data });
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
    console.log(`Connect from other devices on your network using your local IP address`);
    console.log(`For example: http://192.168.x.x:${PORT}`);
});