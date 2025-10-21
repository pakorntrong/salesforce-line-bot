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
async function connectToSalesforce() {
  try {
    console.log('🔗 Attempting Salesforce connection...');
    
    if (!process.env.SF_USERNAME || !process.env.SF_PASSWORD) {
      console.log('❌ Missing credentials');
      return false;
    }

    await conn.login(
      process.env.SF_USERNAME,
      process.env.SF_PASSWORD + (process.env.SF_TOKEN || '')
    );
    
    console.log('✅ Connected to Salesforce!');
    return true;
    
  } catch (error) {
    console.error('❌ Salesforce connection failed:', error.message);
    
    // ✅ ไม่ throw error, return false แทน
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
// ✅ แก้ไข LINE webhook endpoint
app.post('/webhook/line', express.json({ verify: (req, res, buf) => {
  req.rawBody = buf.toString();
}}), async (req, res) => {
  
  console.log('📨 LINE Webhook Received');
  
  try {
    // ✅ สำคัญ: ส่ง 200 ทันที ก่อน process งานหนัก
    res.status(200).json({ 
      status: 'OK',
      message: 'Webhook received successfully'
    });

    // ✅ Process events หลังส่ง response แล้ว
    const events = req.body.events;
    
    if (!events || !Array.isArray(events)) {
      console.log('⚠️  No events in webhook');
      return;
    }

    console.log(`🔍 Processing ${events.length} events`);

    // Process each event
    for (let event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        console.log(`💬 Message from ${event.source.userId}: ${event.message.text}`);
        
        try {
          // สร้าง case ใน Salesforce
          await createCaseInSalesforce(event.source.userId, event.message.text);
          console.log('✅ Case created successfully');
        } catch (sfError) {
          console.error('❌ Salesforce error:', sfError.message);
          // ❌ ไม่ throw error ออกไป เพราะเราส่ง 200 แล้ว
        }
      }
    }

  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    // ❌ อย่าส่ง error อีกครั้ง เพราะส่ง 200 ไปแล้ว
  }
});
// ✅ เพิ่ม endpoint สำหรับทดสอบ webhook พื้นฐาน
app.get('/webhook-test', (req, res) => {
  res.json({
    status: 'Webhook endpoint is ready',
    url: '/webhook/line',
    method: 'POST',
    timestamp: new Date().toISOString()
  });
});

// ✅ เพิ่ม endpoint สำหรับ simulate webhook
app.post('/simulate-webhook', async (req, res) => {
  try {
    const testEvent = {
      events: [
        {
          type: 'message',
          message: {
            type: 'text',
            text: 'Test message from simulation'
          },
          source: {
            userId: 'Utestuser1234567890'
          },
          replyToken: 'testreplytoken1234567890'
        }
      ]
    };

    // Simulate webhook call
    console.log('🧪 Simulating webhook...');
    await createCaseInSalesforce('Utestuser1234567890', 'Test message from simulation');
    
    res.json({
      success: true,
      message: 'Webhook simulation completed',
      testData: testEvent
    });

  } catch (error) {
    console.error('Simulation error:', error);
    res.status(500).json({ error: error.message });
  }
});
// 6. ฟังก์ชันสร้าง Case ใน Salesforce
// ✅ แก้ไขให้ handle error ได้ดีขึ้น
async function createCaseInSalesforce(lineUserId, message) {
  try {
    // 1. พยายามเชื่อมต่อ Salesforce ถ้ายังไม่เชื่อมต่อ
    if (!conn.accessToken) {
      console.log('🔄 Reconnecting to Salesforce...');
      await connectToSalesforce();
    }

    let contactId = null;
    
    // 2. พยายามหา Contact (optional)
    try {
      const contacts = await conn.sobject('Contact')
        .find({ LINE_User_ID__c: lineUserId }, 'Id, Name')
        .limit(1);

      if (contacts.length > 0) {
        contactId = contacts[0].Id;
        console.log(`👤 Found contact: ${contacts[0].Name}`);
      }
    } catch (contactError) {
      console.log('ℹ️  No contact found or field does not exist');
    }

    // 3. สร้าง Case
    const newCase = {
      Subject: `LINE Message: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`,
      Description: `LINE User ID: ${lineUserId}\nMessage: ${message}`,
      Origin: 'LINE',
      Status: 'New',
      Priority: 'Medium'
    };

    // เพิ่ม ContactId ถ้ามี
    if (contactId) {
      newCase.ContactId = contactId;
    }

    const result = await conn.sobject('Case').create(newCase);
    console.log('✅ Case created:', result.id);
    return result;

  } catch (error) {
    console.error('❌ Error in createCaseInSalesforce:', error.message);
    
    // ✅ สำคัญ: ไม่ throw error ออกไปข้างนอก
    // ให้ return error object แทน
    return { 
      error: true, 
      message: error.message 
    };
  }
}
// ✅ เพิ่มฟังก์ชันตอบกลับ LINE
async function replyToLINE(replyToken, message) {
  try {
    const response = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        replyToken: replyToken,
        messages: [
          {
            type: 'text',
            text: message
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`LINE API error: ${response.status}`);
    }

    console.log('✅ Replied to LINE user');
  } catch (error) {
    console.error('❌ Failed to reply to LINE:', error);
  }
}

// ✅ อัพเดท webhook endpoint ให้ตอบกลับ用户
app.post('/webhook/line', express.json({ verify: (req, res, buf) => {
  req.rawBody = buf.toString();
}}), async (req, res) => {
  
  console.log('📨 LINE Webhook Received');
  
  try {
    // ส่ง 200 ทันที
    res.status(200).json({ 
      status: 'OK',
      message: 'Webhook received successfully'
    });

    const events = req.body.events;
    
    if (!events || !Array.isArray(events)) {
      console.log('⚠️  No events in webhook');
      return;
    }

    console.log(`🔍 Processing ${events.length} events`);

    // Process each event
    for (let event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const userMessage = event.message.text;
        const userId = event.source.userId;
        const replyToken = event.replyToken;
        
        console.log(`💬 Message from ${userId}: ${userMessage}`);
        
        try {
          // 1. สร้าง case ใน Salesforce
          const caseResult = await createCaseInSalesforce(userId, userMessage);
          
          // 2. ตอบกลับ用户
          let replyMessage = "ขอบคุณสำหรับข้อความของคุณ! เราจะติดต่อกลับไปเร็วๆ นี้ค่ะ";
          
          if (caseResult && caseResult.id) {
            replyMessage = `✅ บันทึกข้อความของคุณเรียบร้อยแล้ว (Case: ${caseResult.id.slice(-8)})`;
          }
          
          await replyToLINE(replyToken, replyMessage);
          console.log('✅ Case created and user replied');
          
        } catch (sfError) {
          console.error('❌ Salesforce error:', sfError.message);
          
          // ตอบกลับ user ว่ามีปัญหา
          try {
            await replyToLINE(replyToken, "⚠️ ขออภัย มีปัญหาทางเทคนิค กรุณาลองใหม่ในภายหลัง");
          } catch (replyError) {
            console.error('❌ Failed to send error reply:', replyError);
          }
        }
      }
    }

  } catch (error) {
    console.error('❌ Webhook processing error:', error);
  }
});
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