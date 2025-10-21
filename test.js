const express = require('express');
const jsforce = require('jsforce');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Salesforce Connection
const conn = new jsforce.Connection({
  loginUrl: 'https://login.salesforce.com'
});

// 1. ฟังก์ชันเชื่อมต่อ Salesforce
async function connectToSalesforce() {
  try {
    if (!process.env.SF_USERNAME || !process.env.SF_PASSWORD) {
      console.log('⚠️  Salesforce credentials not found in .env file');
      return false;
    }
    
    await conn.login(
      process.env.SF_USERNAME,
      process.env.SF_PASSWORD + process.env.SF_TOKEN
    );
    console.log('✅ Connected to Salesforce successfully!');
    return true;
  } catch (error) {
    console.error('❌ Salesforce connection failed:', error.message);
    return false;
  }
}

// 2. Routes พื้นฐาน
app.get('/', (req, res) => {
  res.send(`
    <h1>🚀 Salesforce + LINE Integration Server</h1>
    <p>Available endpoints:</p>
    <ul>
      <li><a href="/test">/test</a> - Test connection</li>
      <li><a href="/accounts">/accounts</a> - Get Salesforce accounts</li>
      <li>POST /webhook/line - LINE webhook endpoint</li>
    </ul>
  `);
});

// 3. Test endpoint
app.get('/test', (req, res) => {
  res.json({
    status: 'Server is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// 4. Get Salesforce data
app.get('/accounts', async (req, res) => {
  try {
    if (!conn.accessToken) {
      return res.status(500).json({ error: 'Not connected to Salesforce' });
    }

    const accounts = await conn.sobject('Account')
      .find({}, 'Id, Name, Type, Industry')
      .limit(5);
    
    res.json({
      success: true,
      count: accounts.length,
      accounts: accounts
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// 5. LINE Webhook endpoint (พื้นฐาน)
app.post('/webhook/line', (req, res) => {
  console.log('📨 Received LINE webhook:', req.body);
  
  // Basic validation
  const events = req.body.events;
  if (!events || !Array.isArray(events)) {
    return res.status(400).json({ error: 'Invalid webhook format' });
  }

  // Process each event
  events.forEach(event => {
    if (event.type === 'message' && event.message.type === 'text') {
      console.log(`💬 Message from ${event.source.userId}: ${event.message.text}`);
      
      // TODO: Integrate with Salesforce here
      // createCaseInSalesforce(event.source.userId, event.message.text);
    }
  });

  res.status(200).json({ status: 'OK' });
});

// 6. ฟังก์ชันสร้าง Case ใน Salesforce (ตัวอย่าง)
async function createCaseInSalesforce(lineUserId, message) {
  try {
    // 1. หา Contact จาก LINE User ID
    const contacts = await conn.sobject('Contact')
      .find({ LINE_User_ID__c: lineUserId }, 'Id, Name')
      .limit(1);

    let contactId = null;
    if (contacts.length > 0) {
      contactId = contacts[0].Id;
    }

    // 2. สร้าง Case ใหม่
    const newCase = {
      Subject: `LINE Message: ${message.substring(0, 50)}...`,
      Description: message,
      Origin: 'LINE',
      ContactId: contactId,
      Status: 'New',
      Priority: 'Medium'
    };

    const result = await conn.sobject('Case').create(newCase);
    console.log('✅ Case created:', result.id);
    return result;

  } catch (error) {
    console.error('❌ Error creating case:', error);
    throw error;
  }
}

// 7. เริ่มต้น server
async function startServer() {
  // พยายามเชื่อมต่อ Salesforce (optional)
  await connectToSalesforce();
  
  app.listen(port, () => {
    console.log('\n🎯 =================================');
    console.log('🚀 Salesforce + LINE Integration Server');
    console.log(`📍 Running on: http://localhost:${port}`);
    console.log('⏰ Started at:', new Date().toISOString());
    console.log('🎯 =================================\n');
    
    console.log('📋 Available Routes:');
    console.log('   GET  /              - Home page');
    console.log('   GET  /test          - Test server status');
    console.log('   GET  /accounts      - Get Salesforce accounts');
    console.log('   POST /webhook/line  - LINE webhook endpoint');
    console.log('\n🔧 Next steps:');
    console.log('   1. Configure .env file with your credentials');
    console.log('   2. Test /accounts endpoint to verify SF connection');
    console.log('   3. Set up LINE webhook URL in LINE Developer Console\n');
  });
}

// Start the server
startServer();