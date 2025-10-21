const express = require('express');
const jsforce = require('jsforce');
const cors = require('cors'); // ✅ เพิ่มนี้
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000; // ✅ เปลี่ยนเป็น PORT ใหญ่

// ✅ เพิ่ม CORS Middleware
app.use(cors());
app.use(express.json());

// Salesforce Connection
const conn = new jsforce.Connection({
  loginUrl: 'https://login.salesforce.com'
});

// 1. ฟังก์ชันเชื่อมต่อ Salesforce
// แก้ไขฟังก์ชันเชื่อมต่อ Salesforce
async function connectToSalesforce() {
  try {
    console.log('🔗 Attempting Salesforce connection...');
    
    if (!process.env.SF_USERNAME || !process.env.SF_PASSWORD) {
      console.log('❌ Missing Salesforce credentials in environment variables');
      return false;
    }

    console.log('📧 Username:', process.env.SF_USERNAME ? '✅ Provided' : '❌ Missing');
    console.log('🔑 Password:', process.env.SF_PASSWORD ? '✅ Provided' : '❌ Missing');
    
    await conn.login(
      process.env.SF_USERNAME,
      process.env.SF_PASSWORD + (process.env.SF_TOKEN || '')
    );
    
    console.log('✅ Connected to Salesforce successfully!');
    console.log('👤 User ID:', conn.userInfo.id);
    return true;
    
  } catch (error) {
    console.error('❌ Salesforce connection failed:');
    console.error('   Error:', error.message);
    
    if (error.message.includes('INVALID_LOGIN')) {
      console.error('   💡 Check: Username, Password, Security Token');
    } else if (error.message.includes('ENOTFOUND')) {
      console.error('   💡 Check: Internet connection / Login URL');
    }
    
    return false;
  }
}

// ✅ เพิ่ม Health Check Endpoint (จำเป็นสำหรับ Render)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Salesforce-LINE-Bot',
    environment: process.env.NODE_ENV || 'development'
  });
});

// 2. Routes พื้นฐาน
app.get('/', (req, res) => {
  res.send(`
    <h1>🚀 Salesforce + LINE Integration Server</h1>
    <p>Available endpoints:</p>
    <ul>
      <li><a href="/health">/health</a> - Health check</li>
      <li><a href="/test">/test</a> - Test connection</li>
      <li><a href="/accounts">/accounts</a> - Get Salesforce accounts</li>
      <li>POST /webhook/line - LINE webhook endpoint</li>
    </ul>
    <p>Environment: ${process.env.NODE_ENV || 'development'}</p>
  `);
});

// 3. Test endpoint
app.get('/test', (req, res) => {
  res.json({
    status: 'Server is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    port: PORT
  });
});

// 4. Get Salesforce data
app.get('/accounts', async (req, res) => {
  try {
    // พยายาม reconnect ถ้าไม่มีการเชื่อมต่อ
    if (!conn.accessToken) {
      console.log('🔄 Attempting to reconnect to Salesforce...');
      const connected = await connectToSalesforce();
      if (!connected) {
        return res.status(500).json({ 
          error: 'Not connected to Salesforce',
          details: 'Please check environment variables and try /connection-status'
        });
      }
    }

    const accounts = await conn.sobject('Account')
      .find({}, 'Id, Name, Type, Industry, Phone, Website')
      .limit(10);
    
    res.json({
      success: true,
      count: accounts.length,
      connection: {
        connected: true,
        userId: conn.userInfo.id
      },
      accounts: accounts
    });
    
  } catch (error) {
    console.error('❌ Error fetching accounts:', error);
    
    // Reset connection ถ้ามี error
    conn.accessToken = null;
    
    res.status(500).json({ 
      success: false,
      error: error.message,
      suggestion: 'Check Salesforce credentials and security token'
    });
  }
});
// ✅ เพิ่ม endpoint ตรวจสอบ connection status
app.get('/connection-status', async (req, res) => {
  try {
    const isConnected = !!conn.accessToken;
    const connectionInfo = {
      salesforce: {
        connected: isConnected,
        userId: conn.userInfo?.id,
        organizationId: conn.userInfo?.organizationId
      },
      environment: {
        node_env: process.env.NODE_ENV,
        has_username: !!process.env.SF_USERNAME,
        has_password: !!process.env.SF_PASSWORD,
        has_token: !!process.env.SF_TOKEN
      },
      timestamp: new Date().toISOString()
    };
    
    res.json(connectionInfo);
    
  } catch (error) {
    res.status(500).json({
      error: error.message,
      environment: {
        has_username: !!process.env.SF_USERNAME,
        has_password: !!process.env.SF_PASSWORD
      }
    });
  }
});
// ✅ เพิ่ม LINE Signature Validation
const crypto = require('crypto');

function validateLineSignature(body, signature) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  if (!channelSecret) {
    console.log('⚠️  LINE_CHANNEL_SECRET not found');
    return false;
  }
  
  const hash = crypto
    .createHmac('sha256', channelSecret)
    .update(body)
    .digest('base64');
  
  return hash === signature;
}

// 5. LINE Webhook endpoint (อัพเดทแล้ว)
app.post('/webhook/line', express.json({ verify: (req, res, buf) => {
  // Store raw body for signature validation
  req.rawBody = buf.toString();
}}), (req, res) => {
  
  // Validate LINE signature
  const signature = req.headers['x-line-signature'];
  if (!validateLineSignature(req.rawBody, signature)) {
    console.error('❌ Invalid LINE signature');
    return res.status(401).send('Invalid signature');
  }
  
  console.log('✅ Valid LINE webhook received');
  const events = req.body.events;
  
  if (!events || !Array.isArray(events)) {
    return res.status(400).json({ error: 'Invalid webhook format' });
  }

  // Process each event
  events.forEach(event => {
    if (event.type === 'message' && event.message.type === 'text') {
      console.log(`💬 Message from ${event.source.userId}: ${event.message.text}`);
      
      // Integrate with Salesforce
      createCaseInSalesforce(event.source.userId, event.message.text);
    }
  });

  res.status(200).json({ status: 'OK' });
});

// 6. ฟังก์ชันสร้าง Case ใน Salesforce
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
      Description: `LINE User: ${lineUserId}\nMessage: ${message}`,
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

// ✅ เปลี่ยนการเริ่ม server สำหรับ Render.com
async function startServer() {
  // พยายามเชื่อมต่อ Salesforce (optional)
  await connectToSalesforce();
  
  // ✅ เปลี่ยนเป็น '0.0.0.0' สำหรับ Render
  app.listen(PORT, '0.0.0.0', () => {
    console.log('\n🎯 =================================');
    console.log('🚀 Salesforce + LINE Integration Server');
    console.log(`📍 Running on: http://0.0.0.0:${PORT}`);
    console.log(`🌐 Public URL: [จะได้จาก Render หลัง deploy]`);
    console.log('⏰ Started at:', new Date().toISOString());
    console.log('🎯 =================================\n');
    
    console.log('📋 Available Routes:');
    console.log('   GET  /              - Home page');
    console.log('   GET  /health        - Health check (สำคัญ!)');
    console.log('   GET  /test          - Test server status');
    console.log('   GET  /accounts      - Get Salesforce accounts');
    console.log('   POST /webhook/line  - LINE webhook endpoint');
    console.log('\n🔧 Environment:', process.env.NODE_ENV || 'development');
  });
}

// Start the server
startServer();