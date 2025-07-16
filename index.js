const express = require('express');
const crypto = require('crypto');
const app = express();

// Configuration
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  googleAppsScriptURL: process.env.GOOGLE_APPS_SCRIPT_URL
};

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Store user sessions in memory
const userSessions = new Map();

// Problem types and solutions
const problemTypes = {
  '1': {
    name: 'ตู้กินเหรียญแล้วไม่ทำงาน',
    solutions: [
      'กรุณาลองกดปุ่ม "Reset" ที่ด้านข้างตู้ค้างไว้ 5 วินาที',
      'ตรวจสอบหน้าจอว่าแสดงผลปกติหรือไม่',
      'ลองใส่เหรียญอีกครั้งเพื่อทดสอบ',
      'หากยังไม่ได้ กรุณาติดต่อแอดมิน'
    ]
  },
  '2': {
    name: 'ตู้ค้างเครื่อง',
    solutions: [
      'กดปุ่ม "Reset" ที่ด้านข้างตู้ค้างไว้ 10 วินาที',
      'รอประมาณ 30 วินาที ให้ตู้รีสตาร์ทเอง',
      'ตรวจสอบว่าหน้าจอกลับมาแสดงผลปกติ',
      'ลองใส่เหรียญทดสอบอีกครั้ง'
    ]
  },
  '3': {
    name: 'ตู้คีบไม่แข็ง',
    solutions: [
      'ลองเล่นอีก 1-2 ครั้ง เพื่อทดสอบ',
      'ตรวจสอบว่าตู้แสดงข้อความ "แรงคีบปกติ" หรือไม่',
      'หากยังไม่แข็ง กรุณาติดต่อแอดมิน',
      'จะได้รับการปรับแรงคีบให้'
    ]
  },
  '4': {
    name: 'ตู้ไม่มีเสียง',
    solutions: [
      'ตรวจสอบปุ่มเสียงที่ตู้ว่าเปิดอยู่หรือไม่',
      'ลองกดปุ่ม Volume + ที่ตู้',
      'รีสตาร์ทตู้ด้วยการกดปุ่ม Reset',
      'หากยังไม่มีเสียง กรุณาแจ้งแอดมิน'
    ]
  },
  '5': {
    name: 'หยอดครบแล้ว ตุ๊กตาไม่ออก',
    solutions: [
      'ตรวจสอบว่าคีบจับตุ๊กตาแล้วหรือยัง',
      'ลองเขย่าตู้เบาๆ เพื่อให้ตุ๊กตาตก',
      'ตรวจสอบว่าตุ๊กตาติดอยู่หรือไม่',
      'หากตุ๊กตาไม่ออกจริง กรุณาแจ้งแอดมิน'
    ]
  }
};

// Save data to Google Sheets via Apps Script
async function saveToGoogleSheets(data) {
  if (!config.googleAppsScriptURL) {
    console.log('Google Apps Script URL not configured');
    return false;
  }

  try {
    console.log('Saving data to Google Sheets:', data);
    
    const response = await fetch(config.googleAppsScriptURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Data saved to Google Sheets successfully:', result);
      return true;
    } else {
      console.error('❌ Failed to save to Google Sheets:', response.status);
      return false;
    }
  } catch (error) {
    console.error('❌ Error saving to Google Sheets:', error);
    return false;
  }
}

// Verify LINE signature
function verifySignature(body, signature) {
  if (!signature || !config.channelSecret) {
    return false;
  }
  
  const hash = crypto
    .createHmac('sha256', config.channelSecret)
    .update(body, 'utf8')
    .digest('base64');
  
  return hash === signature;
}

// Send reply to LINE
async function replyMessage(replyToken, message) {
  if (!config.channelAccessToken) {
    console.log('LINE Channel Access Token not found');
    return;
  }

  try {
    const response = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.channelAccessToken}`
      },
      body: JSON.stringify({
        replyToken: replyToken,
        messages: [message]
      })
    });

    if (!response.ok) {
      console.error('Failed to send LINE message:', response.status);
    }
  } catch (error) {
    console.error('Error sending LINE message:', error);
  }
}

// Health check endpoint
app.get('/', (req, res) => {
  res.send('🤖 Claw Machine Support Bot is running!');
});

// Webhook endpoint
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-line-signature'];
  const body = JSON.stringify(req.body);

  // Verify signature
  if (!verifySignature(body, signature)) {
    console.log('Invalid signature');
    return res.status(400).send('Invalid signature');
  }

  // Process events
  const events = req.body.events || [];
  
  events.forEach(event => {
    if (event.type === 'message' && event.message.type === 'text') {
      handleTextMessage(event);
    }
  });

  res.status(200).send('OK');
});

// Handle text message
async function handleTextMessage(event) {
  const userId = event.source.userId;
  const userMessage = event.message.text.trim();
  const replyToken = event.replyToken;

  // Get or create user session
  if (!userSessions.has(userId)) {
    userSessions.set(userId, { step: 'start', data: {} });
  }

  const session = userSessions.get(userId);
  const replyMessage_obj = await processUserMessage(userId, userMessage, session);

  await replyMessage(replyToken, replyMessage_obj);
}

// Process user message
async function processUserMessage(userId, message, session) {
  switch (session.step) {
    case 'start':
      return handleStart(userId, message, session);
    
    case 'select_problem':
      return handleProblemSelection(userId, message, session);
    
    case 'troubleshooting':
      return handleTroubleshooting(userId, message, session);
    
    case 'get_machine_number':
      return handleMachineNumber(userId, message, session);
    
    case 'get_location':
      return handleLocation(userId, message, session);
    
    case 'get_customer_info':
      return handleCustomerInfo(userId, message, session);
    
    case 'get_evidence':
      return handleEvidence(userId, message, session);
    
    case 'get_account':
      return handleAccount(userId, message, session);
    
    default:
      return { type: 'text', text: 'ขออภัย เกิดข้อผิดพลาด กรุณาเริ่มใหม่' };
  }
}

// Handle start conversation
function handleStart(userId, message, session) {
  session.step = 'select_problem';
  
  return {
    type: 'text',
    text: '🎯 สวัสดีครับ! ยินดีต้อนรับสู่ระบบแก้ปัญหาตู้คีบตุ๊กตา\n\nกรุณาเลือกปัญหาที่คุณพบ:\n\n1️⃣ ตู้กินเหรียญไม่ทำงาน\n2️⃣ ตู้ค้างเครื่อง\n3️⃣ ตู้คีบไม่แข็ง\n4️⃣ ตู้ไม่มีเสียง\n5️⃣ ตุ๊กตาไม่ออก\n\nพิมพ์เลข 1-5 เพื่อเลือก'
  };
}

// Handle problem selection
function handleProblemSelection(userId, message, session) {
  const problemKey = message.trim();
  
  if (!problemTypes[problemKey]) {
    return {
      type: 'text',
      text: 'กรุณาเลือกปัญหาที่ถูกต้อง\nพิมพ์เลข 1-5:\n\n1️⃣ ตู้กินเหรียญไม่ทำงาน\n2️⃣ ตู้ค้างเครื่อง\n3️⃣ ตู้คีบไม่แข็ง\n4️⃣ ตู้ไม่มีเสียง\n5️⃣ ตุ๊กตาไม่ออก'
    };
  }

  session.data.problemType = problemKey;
  session.data.problemName = problemTypes[problemKey].name;
  session.data.solutions = problemTypes[problemKey].solutions;
  session.data.currentStep = 0;
  session.step = 'troubleshooting';

  return {
    type: 'text',
    text: `🔧 ปัญหา: ${problemTypes[problemKey].name}\n\nขั้นตอนที่ 1: ${problemTypes[problemKey].solutions[0]}\n\nกรุณาลองทำตามแล้วตอบว่า "แก้ได้" หรือ "ไม่ได้"`
  };
}

// Handle troubleshooting
function handleTroubleshooting(userId, message, session) {
  const response = message.toLowerCase().trim();
  
  if (response.includes('แก้ได้') || response === 'ok' || response === 'yes') {
    session.step = 'start';
    return {
      type: 'text',
      text: '🎉 ยินดีด้วย! ปัญหาได้รับการแก้ไขแล้ว\n\nขอบคุณที่ใช้บริการ หากมีปัญหาอื่น สามารถติดต่อได้ตลอดเวลา\n\nพิมพ์ "เริ่มใหม่" เพื่อใช้บริการอีกครั้ง'
    };
  }
  
  if (response.includes('ไม่ได้') || response === 'no') {
    session.data.currentStep++;
    
    if (session.data.currentStep < session.data.solutions.length) {
      return {
        type: 'text',
        text: `ขั้นตอนที่ ${session.data.currentStep + 1}: ${session.data.solutions[session.data.currentStep]}\n\nกรุณาลองทำตามแล้วตอบว่า "แก้ได้" หรือ "ไม่ได้"`
      };
    } else {
      session.step = 'get_machine_number';
      return {
        type: 'text',
        text: '😔 ขออภัย ไม่สามารถแก้ปัญหาได้ด้วยวิธีปกติ\n\n📝 ขอเก็บข้อมูลเพื่อดำเนินการโอนเงินคืน + ตุ๊กตาฟรี 1 ตัว\n\n🎯 กรุณาใส่หมายเลขตู้ (เช่น A001, B052)'
      };
    }
  }
  
  return {
    type: 'text',
    text: 'กรุณาตอบ "แก้ได้" หรือ "ไม่ได้" เท่านั้น'
  };
}

// Handle machine number
function handleMachineNumber(userId, message, session) {
  const machineNumber = message.trim().toUpperCase();
  
  if (machineNumber.length < 3) {
    return {
      type: 'text',
      text: '❌ รูปแบบหมายเลขตู้ไม่ถูกต้อง\n\nกรุณาใส่หมายเลขตู้ที่ติดอยู่บนตู้ (เช่น A001, B052, C123)'
    };
  }
  
  session.data.machineNumber = machineNumber;
  session.step = 'get_location';
  
  return {
    type: 'text',
    text: `✅ หมายเลขตู้: ${machineNumber}\n\n📍 กรุณาระบุสถานที่ตั้งตู้:\n\n🏪 หากอยู่ในเซเว่น: ระบุชื่อสาขาและรหัสสาขา\n🏢 หากอยู่หน้าเซเว่น: ระบุที่อยู่ร้าน\n🏬 หากอยู่ที่อื่น: ระบุที่อยู่ที่ชัดเจน`
  };
}

// Handle location
function handleLocation(userId, message, session) {
  const location = message.trim();
  
  if (location.length < 10) {
    return {
      type: 'text',
      text: '❌ ข้อมูลสถานที่ไม่ครบถ้วน\n\nกรุณาระบุสถานที่ที่ชัดเจน เช่น:\n• เซเว่น สาขาสยาม รหัส 00123\n• หน้าเซเว่น ซอยลาดพร้าว 15\n• ห้างสรรพสินค้า ABC ชั้น 3'
    };
  }
  
  session.data.location = location;
  session.step = 'get_customer_info';
  
  return {
    type: 'text',
    text: `✅ สถานที่: ${location}\n\n👤 กรุณาระบุข้อมูลส่วนตัว:\n\nรูปแบบ: ชื่อ-นามสกุล, เบอร์โทร, จำนวนเงินที่เสีย\n\nตัวอย่าง:\nสมชาย ใจดี, 081-234-5678, 40 บาท`
  };
}

// Handle customer info
function handleCustomerInfo(userId, message, session) {
  const info = message.trim();
  const parts = info.split(',');
  
  if (parts.length < 3) {
    return {
      type: 'text',
      text: '❌ ข้อมูลไม่ครบถ้วน\n\nกรุณาระบุ:\nชื่อ-นามสกุล, เบอร์โทร, จำนวนเงินที่เสีย\n\nตัวอย่าง:\nสมชาย ใจดี, 081-234-5678, 40 บาท'
    };
  }
  
  session.data.customerName = parts[0].trim();
  session.data.customerPhone = parts[1].trim();
  session.data.lostAmount = parts[2].trim();
  session.step = 'get_evidence';
  
  return {
    type: 'text',
    text: `✅ ข้อมูลลูกค้า:\n• ชื่อ: ${session.data.customerName}\n• เบอร์: ${session.data.customerPhone}\n• จำนวนเงิน: ${session.data.lostAmount}\n\n📸 กรุณาส่งหลักฐาน:\n\n1. รูปหน้าจอตู้ที่แสดงการหยอดเงิน\n2. วิดีโอการหยอดเงิน (ถ้ามี)\n3. รูปตู้ที่เกิดปัญหา\n\nหากลืมถ่าย กรุณาลองหยอดใหม่และถ่ายหลักฐาน\n\nพิมพ์ "ส่งหลักฐานเรียบร้อย" เมื่อส่งครบแล้ว`
  };
}

// Handle evidence
function handleEvidence(userId, message, session) {
  if (message.includes('ส่งหลักฐานเรียบร้อย') || message.includes('เรียบร้อย')) {
    session.step = 'get_account';
    return {
      type: 'text',
      text: '✅ ได้รับหลักฐานเรียบร้อย\n\n🏧 ขั้นตอนสุดท้าย: กรุณาส่งเลขบัญชี\n\nรูปแบบ: ธนาคาร, เลขบัญชี, ชื่อบัญชี\n\nตัวอย่าง:\nกสิกรไทย, 123-4-56789-0, นายสมชาย ใจดี'
    };
  }
  
  return {
    type: 'text',
    text: '📸 กรุณาส่งหลักฐานตามที่ระบุ:\n\n1. รูปหน้าจอตู้ที่แสดงการหยอดเงิน\n2. วิดีโอการหยอดเงิน (ถ้ามี)\n3. รูปตู้ที่เกิดปัญหา\n\nพิมพ์ "ส่งหลักฐานเรียบร้อย" เมื่อส่งครบแล้ว'
  };
}

// Handle account
async function handleAccount(userId, message, session) {
  const accountInfo = message.trim();
  const parts = accountInfo.split(',');
  
  if (parts.length < 3) {
    return {
      type: 'text',
      text: '❌ ข้อมูลบัญชีไม่ครบถ้วน\n\nกรุณาระบุ:\nธนาคาร, เลขบัญชี, ชื่อบัญชี\n\nตัวอย่าง:\nกสิกรไทย, 123-4-56789-0, นายสมชาย ใจดี'
    };
  }
  
  session.data.bankName = parts[0].trim();
  session.data.accountNumber = parts[1].trim();
  session.data.accountName = parts[2].trim();
  session.data.timestamp = new Date().toISOString();
  
  // Log customer data to console
  console.log('=== ข้อมูลลูกค้าใหม่ ===');
  console.log('เวลา:', session.data.timestamp);
  console.log('ปัญหา:', session.data.problemName);
  console.log('หมายเลขตู้:', session.data.machineNumber);
  console.log('สถานที่:', session.data.location);
  console.log('ชื่อลูกค้า:', session.data.customerName);
  console.log('เบอร์โทร:', session.data.customerPhone);
  console.log('จำนวนเงิน:', session.data.lostAmount);
  console.log('ธนาคาร:', session.data.bankName);
  console.log('เลขบัญชี:', session.data.accountNumber);
  console.log('ชื่อบัญชี:', session.data.accountName);
  console.log('========================');
  
  // Save to Google Sheets
  const saved = await saveToGoogleSheets(session.data);
  
  // Reset session
  session.step = 'start';
  session.data = {};
  
  if (saved) {
    return {
      type: 'text',
      text: '🎉 ข้อมูลครบถ้วนแล้ว!\n\n✅ ข้อมูลได้ถูกบันทึกและส่งไปยังแอดมินเรียบร้อย\n💰 จะดำเนินการโอนเงินคืน + ตุ๊กตาฟรี 1 ตัว\n⏰ ภายใน 24 ชั่วโมง\n\nขอบคุณที่ใช้บริการ! 🙏\n\nพิมพ์ "เริ่มใหม่" เพื่อใช้บริการอีกครั้ง'
    };
  } else {
    return {
      type: 'text',
      text: '⚠️ ข้อมูลได้ถูกรับไว้แล้ว แต่การบันทึกในระบบมีปัญหา\n\n✅ ข้อมูลได้ถูกส่งไปยังแอดมินแล้ว\n💰 จะดำเนินการโอนเงินคืน + ตุ๊กตาฟรี 1 ตัว\n⏰ ภายใน 24 ชั่วโมง\n\nขอบคุณที่ใช้บริการ! 🙏\n\nพิมพ์ "เริ่มใหม่" เพื่อใช้บริการอีกครั้ง'
    };
  }
}

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🤖 Claw Machine Support Bot running on port ${port}`);
});

module.exports = app;
